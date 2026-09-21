"""Run a three-image OpenAI Batch edit trial without changing the store."""

import base64
import html
import json
import os
import subprocess
import sys
import time
from pathlib import Path

from openai import OpenAI


ROOT = Path("batch-api-trial-report")
ROOT.mkdir(exist_ok=True)
SITE = "https://manar-store.mahmoud-alkaraki96.workers.dev"
MODEL = "gpt-image-2"
STYLES = [
    "warm cream plaster wall and light travertine surface",
    "soft beige limewash wall and matte sand-colored stone surface",
    "warm ivory microcement wall and pale natural stone tabletop",
]


def wrangler(*args):
    command = ["./node_modules/.bin/wrangler", *args, "--config", "wrangler.jsonc"]
    result = subprocess.run(command, text=True, capture_output=True, timeout=180)
    if result.returncode:
        raise RuntimeError(f"Wrangler failed: {result.stderr[-800:]}")
    return result.stdout.strip()


def query(sql):
    result = json.loads(wrangler("d1", "execute", "manar-store-db", "--remote", "--json", "--command", sql))
    if not result or not result[0].get("success"):
        raise RuntimeError("D1 query failed")
    return result[0]


def prompt(row, index):
    return f"""Edit this original product photo into a polished premium ecommerce photograph.
Product: {row['name']}.
Scene: a {STYLES[index % len(STYLES)]}. Backgrounds across the catalog should share a warm beige premium identity but not be identical.
Composition: vertical, entire product clearly visible and large, filling roughly 82–90% of usable frame, centered with minimal safe margins. Use natural studio lighting and realistic shadows, reflections and transparent material behavior.
Critical: preserve the actual product exactly: shape, count, proportions, colors, materials, patterns, package design and all writing, letters, numbers, labels, logos and decoration on the product. Do not invent components or change writing.
Remove only hands, arms, unrelated room clutter, external seller watermarks and external product number overlays. No additional text, branding, props, people or products. Do not crop the product."""


def write_report(items, batch_id, status):
    (ROOT / "results.json").write_text(
        json.dumps({"batch_id": batch_id, "batch_status": status, "items": items}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    sections = []
    for item in items:
        original = html.escape(item["original_url"], quote=True)
        result = item.get("file")
        right = f'<img src="{html.escape(result, quote=True)}">' if result else f'<p>{html.escape(item.get("error", "قيد الانتظار"))}</p>'
        sections.append(
            f'<section><h2>#{item["product_id"]} · {html.escape(item["name"])}</h2>'
            f'<div class="pair"><div><b>الأصلية</b><img src="{original}"></div>'
            f'<div><b>نتيجة Batch</b>{right}</div></div></section>'
        )
    page = f'''<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>تجربة Batch لثلاث صور</title>
<style>body{{font:16px system-ui;max-width:1150px;margin:auto;padding:20px;background:#f6f4f0}}section{{background:#fff;border-radius:12px;padding:15px;margin:18px 0}}.pair{{display:grid;grid-template-columns:1fr 1fr;gap:12px}}img{{width:100%;height:480px;object-fit:contain;background:#eee}}b{{display:block;margin-bottom:8px}}@media(max-width:650px){{.pair{{grid-template-columns:1fr}}img{{height:300px}}}}</style>
<h1>تجربة OpenAI Batch API</h1><p>الحالة: {html.escape(status)} — لم يتم استبدال أي صورة في المتجر.</p>{''.join(sections)}</html>'''
    (ROOT / "report.html").write_text(page, encoding="utf-8")


def content_bytes(client, file_id):
    response = client.files.content(file_id)
    if hasattr(response, "read"):
        return response.read()
    if hasattr(response, "content"):
        return response.content
    return bytes(response)


def main():
    rows = query(
        "SELECT p.id AS product_id,p.name,m.id AS media_id,m.url FROM product_media m "
        "JOIN products p ON p.id=m.product_id WHERE m.is_primary=1 AND m.variant_id IS NULL "
        "AND m.url LIKE '/media/imports/%' AND p.deleted_at IS NULL ORDER BY p.id DESC LIMIT 3"
    )["results"]
    if len(rows) != 3:
        raise RuntimeError(f"Expected 3 original images, found {len(rows)}")

    requests = []
    items = []
    for index, row in enumerate(rows):
        custom_id = f"product-{row['product_id']}-media-{row['media_id']}"
        original_url = SITE + row["url"]
        requests.append({
            "custom_id": custom_id,
            "method": "POST",
            "url": "/v1/images/edits",
            "body": {
                "model": MODEL,
                "images": [{"image_url": original_url}],
                "prompt": prompt(row, index),
                "size": "1024x1536",
                "quality": "medium",
                "input_fidelity": "high",
                "output_format": "webp",
            },
        })
        items.append({
            "custom_id": custom_id,
            "product_id": row["product_id"],
            "media_id": row["media_id"],
            "name": row["name"],
            "original_url": original_url,
            "status": "submitted",
        })

    input_path = ROOT / "batch-input.jsonl"
    input_path.write_text("\n".join(json.dumps(request, ensure_ascii=False) for request in requests) + "\n", encoding="utf-8")
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"], max_retries=3, timeout=240)
    with input_path.open("rb") as source:
        uploaded = client.files.create(file=source, purpose="batch")
    batch = client.batches.create(input_file_id=uploaded.id, endpoint="/v1/images/edits", completion_window="24h")
    write_report(items, batch.id, batch.status)
    print(f"Submitted batch {batch.id} for {len(items)} images", flush=True)

    deadline = time.time() + (5 * 60 * 60)
    while batch.status not in {"completed", "failed", "expired", "cancelled"} and time.time() < deadline:
        time.sleep(30)
        batch = client.batches.retrieve(batch.id)
        print(f"Batch {batch.id}: {batch.status}", flush=True)

    if batch.status != "completed":
        write_report(items, batch.id, batch.status)
        raise RuntimeError(f"Batch did not complete during this job: {batch.status}")

    output = content_bytes(client, batch.output_file_id).decode("utf-8")
    by_id = {item["custom_id"]: item for item in items}
    for line in output.splitlines():
        record = json.loads(line)
        item = by_id.get(record.get("custom_id"))
        if not item:
            continue
        if record.get("error"):
            item["status"] = "failed"
            item["error"] = json.dumps(record["error"], ensure_ascii=False)
            continue
        response = record.get("response", {})
        if response.get("status_code") != 200:
            item["status"] = "failed"
            item["error"] = json.dumps(response.get("body", response), ensure_ascii=False)[:1000]
            continue
        body = response.get("body", {})
        encoded = body.get("data", [{}])[0].get("b64_json")
        if not encoded:
            item["status"] = "failed"
            item["error"] = "Batch result contained no image data"
            continue
        image = base64.b64decode(encoded)
        if image[:4] != b"RIFF" or image[8:12] != b"WEBP" or len(image) < 10000:
            item["status"] = "failed"
            item["error"] = "Invalid generated WebP"
            continue
        filename = f"product-{item['product_id']}.webp"
        (ROOT / filename).write_bytes(image)
        item["file"] = filename
        item["status"] = "ready"
        item["usage"] = body.get("usage")

    write_report(items, batch.id, batch.status)
    ready = sum(item["status"] == "ready" for item in items)
    print(f"Batch complete: {ready}/3 images ready; store unchanged", flush=True)
    return 0 if ready == 3 else 1


if __name__ == "__main__":
    sys.exit(main())
