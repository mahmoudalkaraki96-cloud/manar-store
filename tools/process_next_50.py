"""Create the next 50 approved-style product images as a review artifact."""
import base64
import json
import os
import subprocess
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from openai import OpenAI

ROOT = Path("batch-50-results")
ORIGINALS = ROOT / "originals"
EDITED = ROOT / "edited"
for directory in (ORIGINALS, EDITED):
    directory.mkdir(parents=True, exist_ok=True)

STYLES = [
    "warm cream plaster wall and light travertine surface",
    "soft beige limewash wall and matte sand-colored stone surface",
    "warm ivory microcement wall and pale natural stone tabletop",
    "subtle cream arched studio backdrop and light beige textured surface",
    "warm neutral boutique wall with a refined matte limestone surface",
]


def wrangler(*args):
    process = subprocess.run(["./node_modules/.bin/wrangler", *args], capture_output=True, text=True)
    if process.returncode:
        raise RuntimeError(process.stderr[-1200:])
    return process.stdout.strip()


def select():
    sql = "SELECT p.id AS product_id,p.name,m.id AS media_id,m.url FROM product_media m JOIN products p ON p.id=m.product_id WHERE m.is_primary=1 AND m.variant_id IS NULL AND m.url LIKE '/media/imports/%' AND p.deleted_at IS NULL ORDER BY p.id DESC LIMIT 50"
    data = json.loads(wrangler("d1", "execute", "manar-store-db", "--remote", "--json", "--config", "wrangler.jsonc", "--command", sql))
    if not data or not data[0].get("success") or len(data[0]["results"]) != 50:
        raise RuntimeError("Could not select exactly 50 unprocessed primary product images")
    rows = data[0]["results"]
    if len({row["product_id"] for row in rows}) != 50 or len({row["media_id"] for row in rows}) != 50:
        raise RuntimeError("Duplicate product or media record in selection")
    (ROOT / "selection.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2))
    return rows


def download(row):
    suffix = Path(row["url"]).suffix.lower()
    if suffix not in (".jpg", ".jpeg", ".png", ".webp"):
        raise RuntimeError("Unsupported original image suffix")
    path = ORIGINALS / f"{row['product_id']}{suffix}"
    key = row["url"].removeprefix("/media/")
    try:
        wrangler("r2", "object", "get", f"manar-store-media/{key}", "--remote", "--file", str(path), "--config", "wrangler.jsonc")
    except Exception:
        request = urllib.request.Request("https://manar-store.mahmoud-alkaraki96.workers.dev" + row["url"], headers={"User-Agent":"Mozilla/5.0", "Accept":"image/*"})
        with urllib.request.urlopen(request, timeout=60) as response:
            path.write_bytes(response.read())
    if path.stat().st_size < 3000:
        raise RuntimeError(f"Original image too small for {row['product_id']}")
    return path


def process(row, index, path):
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"], max_retries=3, timeout=240)
    prompt = f"""Edit this original product photo into a polished premium ecommerce photograph.
Product: {row['name']}.
Scene: a {STYLES[index % len(STYLES)]}. Backgrounds across the catalog should share a warm beige premium identity but not be identical.
Composition: vertical, entire product clearly visible and large, filling roughly 82–90% of usable frame, centered with minimal safe margins. Use natural studio lighting and realistic shadows, reflections and transparent material behavior.
Critical: preserve the actual product exactly: shape, count, proportions, colors, materials, patterns, package design and all writing, letters, numbers, labels, logos and decoration on the product. Do not invent components or change writing.
Remove only hands, arms, unrelated room clutter, external seller watermarks and external product number overlays. No additional text, branding, props, people or products. Do not crop the product."""
    with path.open("rb") as file:
        response = client.images.edit(model="gpt-image-2", image=file, prompt=prompt, size="1024x1536", quality="medium", output_format="webp")
    output = EDITED / f"product-{row['product_id']}.webp"
    output.write_bytes(base64.b64decode(response.data[0].b64_json))
    return {**row, "status":"ok", "file":str(output), "usage":response.usage.model_dump() if response.usage else None}


def main():
    rows = select()
    manifest = []
    files = []
    for row in rows:
        try:
            files.append(download(row))
        except Exception as error:
            files.append(None)
            manifest.append({**row, "status":"download_failed", "error":repr(error)})
    (ROOT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = {}
        for index, (row, file) in enumerate(zip(rows, files)):
            if file is None:
                continue
            futures[pool.submit(process, row, index, file)] = row
            time.sleep(13)  # Account trial limit was five input images per minute.
        for future in as_completed(futures):
            row = futures[future]
            try:
                result = future.result()
            except Exception as error:
                result = {**row, "status":"edit_failed", "error":repr(error)}
            manifest.append(result)
            (ROOT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
            print(f"{row['product_id']}: {result['status']}", flush=True)
    print(f"Generated {sum(x['status']=='ok' for x in manifest)} of 50 images", flush=True)


if __name__ == "__main__":
    main()
