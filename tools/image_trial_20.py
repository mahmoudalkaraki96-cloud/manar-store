import base64
import json
import os
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from openai import OpenAI

BASE = "https://manar-store.mahmoud-alkaraki96.workers.dev"
OUT = Path("image-trial-results")
ORIGINALS = OUT / "originals"
EDITED = OUT / "edited"
OUT.mkdir(exist_ok=True)
ORIGINALS.mkdir(exist_ok=True)
EDITED.mkdir(exist_ok=True)

ITEMS = [
    ("1221", "عطر شانيل (30مل)", "/media/imports/dofesh-5.jpeg", "luxury perfume studio"),
    ("1219", "عطر مس ديور (30مل)", "/media/imports/dofesh-8.jpg", "luxury perfume studio"),
    ("1214", "مبخرة وردة سيراميك", "/media/imports/dofesh-14.jpeg", "warm ceramic boutique"),
    ("1213", "مبخرة ماربل مربعة", "/media/imports/dofesh-15.jpeg", "warm ceramic boutique"),
    ("1212", "مروحة خشب", "/media/imports/dofesh-16.jpg", "soft natural craft studio"),
    ("1209", "ورد لولو سداسي محجر", "/media/imports/dofesh-21.jpeg", "elegant floral craft studio"),
    ("1198", "علبة أكريليك ذهبية", "/media/imports/dofesh-37.jpeg", "premium gift boutique"),
    ("1196", "ورد قماش", "/media/imports/dofesh-42.jpeg", "elegant floral craft studio"),
    ("1187", "شمع دب", "/media/imports/dofesh-51.jpeg", "soft candle boutique"),
    ("1184", "مراية ذهبية", "/media/imports/dofesh-54.jpeg", "refined decor studio"),
    ("1163", "مصحف البقرة", "/media/imports/dofesh-83.jpeg", "calm premium gift studio"),
    ("1158", "علبة أكريليك شفاف", "/media/imports/dofesh-94.png", "bright modern acrylic studio"),
    ("1153", "صينية أكريليك ذهبية", "/media/imports/dofesh-101.jpeg", "premium serving decor studio"),
    ("1152", "صندوق خشب وزجاج", "/media/imports/dofesh-102.jpeg", "warm artisan wood studio"),
    ("1149", "دب قماش", "/media/imports/dofesh-105.jpeg", "soft nursery gift studio"),
    ("1120", "زجاج كرستال", "/media/imports/dofesh-156.png", "bright glass product studio"),
    ("1119", "صندوق زجاج ذهبي", "/media/imports/dofesh-174.jpg", "premium glass decor studio"),
    ("1093", "مبخرة نحاس ذهبية", "/media/imports/dofesh-239.jpeg", "luxury brass decor studio"),
    ("1087", "ورد خشب", "/media/imports/dofesh-250.jpeg", "soft natural craft studio"),
    ("1079", "مبخرة فخار", "/media/imports/dofesh-259.jpg", "warm ceramic boutique"),
]

BACKDROPS = [
    "warm cream plaster wall and light travertine surface",
    "soft beige limewash wall and matte sand-colored stone surface",
    "warm ivory microcement wall and pale natural stone tabletop",
    "subtle cream arched studio backdrop and light beige textured surface",
    "warm neutral boutique wall with a refined matte limestone surface",
]

def download(path, dest):
    req = urllib.request.Request(BASE + path, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as response:
        raw = response.read()
    dest.write_bytes(raw)
    return raw

def prompt_for(name, style, index):
    backdrop = BACKDROPS[index % len(BACKDROPS)]
    return f"""Edit the supplied original product photo into a polished premium ecommerce photograph.

Product: {name}
Scene: {style}; use a {backdrop}. Backgrounds across the catalog should share a warm beige premium identity but must not be identical.
Composition: portrait 4:5, entire product visible, large and prominent, occupying roughly 82–90% of usable frame, centered with minimal safe margins. Match soft diffused studio lighting, realistic contact shadows, reflections, transparency and material behavior.

Critical protection rule: preserve the real product exactly. Do not change its shape, count, proportions, colors, materials, patterns, transparent parts, package design, printed words, letters, numbers, logos, labels, decorative details, or component placement. Existing writing on the product must remain exactly as photographed and readable.

Remove only unwanted surroundings: original room/table clutter, hands, arms, sleeves, unrelated props, external seller watermarks and external product-number overlays. If a hand hides part of the product, reconstruct only the hidden portion consistently with visible geometry.

Do not add text, branding, props, flowers, hands, people, extra products or watermark. Do not crop the product."""

def edit_one(item, index):
    product_id, name, path, style = item
    suffix = Path(path).suffix or ".jpg"
    original_path = ORIGINALS / f"{product_id}{suffix}"
    if not original_path.exists():
        download(path, original_path)

    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"], max_retries=1, timeout=180)
    with original_path.open("rb") as image_file:
        response = client.images.edit(
            model="gpt-image-2",
            image=image_file,
            prompt=prompt_for(name, style, index),
            size="1024x1536",
            quality="medium",
            output_format="webp",
        )
    output_path = EDITED / f"product-{product_id}.webp"
    output_path.write_bytes(base64.b64decode(response.data[0].b64_json))
    usage = response.usage.model_dump() if getattr(response, "usage", None) else None
    return {"id": product_id, "name": name, "status": "ok", "file": str(output_path), "usage": usage}

def main():
    manifest = []
    # Billing/auth gate: one image first.
    try:
        first = edit_one(ITEMS[0], 0)
        manifest.append(first)
        print(json.dumps(first, ensure_ascii=False), flush=True)
    except Exception as exc:
        error = {"id": ITEMS[0][0], "status": "gate_failed", "error": repr(exc)}
        (OUT / "manifest.json").write_text(json.dumps([error], ensure_ascii=False, indent=2))
        raise

    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = {pool.submit(edit_one, item, index): item for index, item in enumerate(ITEMS[1:], 1)}
        for future in as_completed(futures):
            item = futures[future]
            try:
                row = future.result()
            except Exception as exc:
                row = {"id": item[0], "name": item[1], "status": "failed", "error": repr(exc)}
            manifest.append(row)
            print(json.dumps(row, ensure_ascii=False), flush=True)

    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
