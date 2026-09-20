"""Process one resumable Manar Store image batch in a GitHub Actions job."""

import base64
import hashlib
import html
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from openai import OpenAI


ROOT = Path("image-batch-report")
ROOT.mkdir(exist_ok=True)
BUCKET = "manar-store-media"
SITE = "https://manar-store.mahmoud-alkaraki96.workers.dev"
MODEL = "gpt-image-2"
STYLES = [
    "warm cream plaster wall and light travertine surface",
    "soft beige limewash wall and matte sand-colored stone surface",
    "warm ivory microcement wall and pale natural stone tabletop",
    "subtle cream arched studio backdrop and light beige textured surface",
    "warm neutral boutique wall and refined matte limestone surface",
]
RISK_WORDS = ("مصحف", "مطبوع", "كتابة", "تراث", "كوفية", "مقسم", "تعليقة", "شفاف", "اكريلك")


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


def q(value):
    return "'" + value.replace("'", "''") + "'"


def r2_get(key, file):
    try:
        wrangler("r2", "object", "get", f"{BUCKET}/{key}", "--remote", "--file", str(file))
    except RuntimeError as error:
        if "not found" in str(error).lower() or "does not exist" in str(error).lower() or "404" in str(error):
            return False
        raise
    return True


def r2_put(key, file, mime):
    wrangler("r2", "object", "put", f"{BUCKET}/{key}", "--remote", "--file", str(file), "--content-type", mime)


def original(row):
    suffix = Path(row["url"]).suffix.lower()
    if suffix not in (".jpg", ".jpeg", ".png", ".webp"):
        raise ValueError("Unsupported original file type")
    path = ROOT / f"original-{row['media_id']}{suffix}"
    key = row["url"].removeprefix("/media/")
    if not r2_get(key, path):
        request = urllib.request.Request(SITE + row["url"], headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(request, timeout=60) as response:
            path.write_bytes(response.read())
    if path.stat().st_size < 3000:
        raise ValueError("Original image is too small")
    return path


def generate(client, row, path, index):
    prompt = f"""Edit this original product photo into a polished premium ecommerce photograph.
Product: {row['name']}.
Scene: a {STYLES[index % len(STYLES)]}. Backgrounds share a warm beige premium identity but are not identical.
Composition: vertical, entire product clearly visible and large, filling 82–90% of the frame, centered with minimal margins. Natural studio lighting, realistic shadows and transparent materials.
Critical: preserve the actual product exactly: shape, count, proportions, colors, materials, patterns, package design, and all writing, letters, numbers, labels, logos and decoration on the product. Do not invent components or change writing.
Remove only hands, unrelated clutter, external seller watermarks and external product number overlays. No extra text, branding, props, people or products. Do not crop the product."""
    with path.open("rb") as file:
        response = client.images.edit(model=MODEL, image=file, prompt=prompt, size="1024x1536", quality="medium", output_format="webp")
    data = base64.b64decode(response.data[0].b64_json)
    if data[:4] != b"RIFF" or data[8:12] != b"WEBP" or len(data) < 10000:
        raise ValueError("Invalid generated WebP")
    return data, response.usage.model_dump() if response.usage else None


def save_report(items):
    (ROOT / "results.json").write_text(json.dumps(items, ensure_ascii=False, indent=2))
    sections = []
    for item in items:
        old = SITE + item["original_url"]
        new = SITE + item["new_url"] if item.get("status") == "uploaded" else ""
        pairs = f'<div><b>الأصلية</b><a href="{html.escape(old, quote=True)}"><img loading="lazy" src="{html.escape(old, quote=True)}"></a></div>'
        if new:
            pairs += f'<div><b>المرفوعة</b><a href="{html.escape(new, quote=True)}"><img loading="lazy" src="{html.escape(new, quote=True)}"></a></div>'
        status = "مراجعة أولوية" if item.get("risk") else "مراجعة بصرية"
        if item["status"] != "uploaded":
            status = "تعذّر الرفع: " + item["status"]
        sections.append(f'<section><h2>#{item["product_id"]} · {html.escape(item["name"])}</h2><p>{status}</p><div class="pair">{pairs}</div></section>')
    page = '<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>تقرير معالجة صور المنتجات</title><style>body{font:16px system-ui;max-width:1150px;margin:auto;padding:20px;background:#f6f4f0}section{background:white;border-radius:12px;padding:15px;margin:18px 0}.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}img{width:100%;height:350px;object-fit:contain;background:#eee}b{display:block}@media(max-width:600px){img{height:220px}}</style><h1>تقرير صور المنتجات</h1><p>الصور الأصلية محفوظة. علامة «مراجعة أولوية» تعتمد على نوع المنتج فقط، وليست اكتشافاً مؤكداً لتغيير. افحص كل صورة قبل اعتمادها النهائي؛ لا يوجد فحص آلي يضمن تطابق النص والتفاصيل.</p>' + ''.join(sections) + '</html>'
    (ROOT / "report.html").write_text(page, encoding="utf-8")


def main():
    maximum = int(os.environ.get("IMAGE_COUNT", "50"))
    if not 1 <= maximum <= 500:
        raise ValueError("IMAGE_COUNT must be between 1 and 500")
    sql = ("SELECT p.id AS product_id,p.name,m.id AS media_id,m.url FROM product_media m "
           "JOIN products p ON p.id=m.product_id WHERE m.is_primary=1 AND m.variant_id IS NULL "
           "AND m.url LIKE '/media/imports/%' AND p.deleted_at IS NULL "
           f"ORDER BY p.id DESC LIMIT {maximum}")
    rows = query(sql)["results"]
    if len({row["media_id"] for row in rows}) != len(rows):
        raise ValueError("Duplicate media IDs")
    if os.environ.get("IMAGE_DRY_RUN") == "true":
        planned = [{"product_id": row["product_id"], "media_id": row["media_id"], "name": row["name"],
                    "original_url": row["url"], "status": "planned", "risk": any(word in row["name"] for word in RISK_WORDS)}
                   for row in rows]
        save_report(planned)
        print(f"Dry run: selected {len(planned)} original product images; no API calls or uploads", flush=True)
        return 0
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"], max_retries=2, timeout=240)
    results = []
    consecutive_failures = 0
    try:
        for index, row in enumerate(rows):
            media_id, product_id = row["media_id"], row["product_id"]
            key = f"edited/auto-v1/product-{product_id}-media-{media_id}.webp"
            new_url = "/media/" + key
            image = ROOT / f"product-{media_id}.webp"
            entry = {"product_id": product_id, "media_id": media_id, "name": row["name"],
                     "original_url": row["url"], "new_url": new_url, "risk": any(word in row["name"] for word in RISK_WORDS)}
            try:
                # A completed R2 upload can be reused if the job failed before its D1 update.
                existing = r2_get(key, image)
                if not existing:
                    source = original(row)
                    image_bytes, usage = generate(client, row, source, index)
                    image.write_bytes(image_bytes)
                    entry["usage"] = usage
                    r2_put(key, image, "image/webp")
                    time.sleep(13)  # Stay within the observed five-input-images/minute limit.
                if image.stat().st_size < 10000:
                    raise ValueError("Uploaded image is too small")
                check = ROOT / f"verify-{media_id}.webp"
                if not r2_get(key, check) or hashlib.sha256(image.read_bytes()).digest() != hashlib.sha256(check.read_bytes()).digest():
                    raise ValueError("R2 verification failed")
                backup = ROOT / f"backup-{media_id}.json"
                backup.write_text(json.dumps(entry, ensure_ascii=False, indent=2))
                r2_put(f"edited/auto-v1/backups/media-{media_id}.json", backup, "application/json")
                change = query("UPDATE product_media SET url=" + q(new_url) + ",updated_at=CAST(strftime('%s','now') AS INTEGER)*1000 "
                               f"WHERE id={media_id} AND product_id={product_id} AND url=" + q(row["url"]))
                if change.get("meta", {}).get("changes") != 1:
                    raise ValueError("D1 row changed; no URL overwritten")
                entry["status"] = "uploaded"
                consecutive_failures = 0
                print(f"Uploaded {len(results)+1}/{len(rows)} product {product_id}", flush=True)
            except Exception as error:
                entry["status"] = "failed"
                entry["error"] = str(error)[:400]
                consecutive_failures += 1
                print(f"Failed product {product_id}: {str(error)[:180]}", flush=True)
            finally:
                results.append(entry)
                save_report(results)
                for file in (ROOT / f"original-{media_id}{Path(row['url']).suffix.lower()}", image, ROOT / f"verify-{media_id}.webp"):
                    file.unlink(missing_ok=True)
            if consecutive_failures >= 5:
                print("Stopped after five consecutive failures", flush=True)
                break
    finally:
        save_report(results)
    print(f"Batch complete: {sum(x['status']=='uploaded' for x in results)} uploaded, {sum(x['status']=='failed' for x in results)} failed", flush=True)
    return 1 if any(x["status"] == "failed" for x in results) else 0


if __name__ == "__main__":
    sys.exit(main())
