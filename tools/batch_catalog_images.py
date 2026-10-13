"""Submit resumable catalog image edits to OpenAI Batch without publishing yet."""

import json
import os
import subprocess
import tempfile
from pathlib import Path

from openai import OpenAI


SITE = "https://manar-store.mahmoud-alkaraki96.workers.dev"
MODEL = "gpt-image-2"
STYLES = [
    "warm cream plaster wall and light travertine surface",
    "soft beige limewash wall and matte sand-colored stone surface",
    "warm ivory microcement wall and pale natural stone tabletop",
    "subtle cream arched studio backdrop and light beige textured surface",
    "warm neutral boutique wall with a refined matte limestone surface",
]


def wrangler(*args):
    result = subprocess.run(
        ["./node_modules/.bin/wrangler", *args, "--config", "wrangler.jsonc"],
        text=True, capture_output=True, timeout=240,
    )
    if result.returncode:
        raise RuntimeError(f"Wrangler failed: {result.stderr[-1200:]}")
    return result.stdout.strip()


def query(sql):
    data = json.loads(wrangler("d1", "execute", "manar-store-db", "--remote", "--json", "--command", sql))
    if not data or not data[0].get("success"):
        raise RuntimeError("D1 query failed")
    return data[0]


def execute_file(sql):
    with tempfile.NamedTemporaryFile("w", suffix=".sql", encoding="utf-8", delete=False) as file:
        file.write(sql)
        path = file.name
    try:
        wrangler("d1", "execute", "manar-store-db", "--remote", "--file", path)
    finally:
        Path(path).unlink(missing_ok=True)


def q(value):
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def ensure_tables():
    execute_file("""
CREATE TABLE IF NOT EXISTS image_ai_batches (
  id TEXT PRIMARY KEY,
  openai_batch_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  requested_count INTEGER NOT NULL,
  report_url TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS image_ai_items (
  batch_id TEXT NOT NULL,
  media_id INTEGER NOT NULL UNIQUE,
  product_id INTEGER NOT NULL,
  item_number INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  original_url TEXT NOT NULL,
  generated_url TEXT,
  status TEXT NOT NULL,
  risk INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  usage_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (batch_id, media_id)
);
CREATE INDEX IF NOT EXISTS idx_image_ai_batches_status ON image_ai_batches(status);
CREATE INDEX IF NOT EXISTS idx_image_ai_items_status ON image_ai_items(status);
CREATE INDEX IF NOT EXISTS idx_image_ai_items_item_number ON image_ai_items(item_number);
""")


def prompt(row, index):
    return f"""Edit this original product photo into a polished premium ecommerce photograph.
Product: {row['name']}.
Scene: a {STYLES[index % len(STYLES)]}. Backgrounds across the catalog should share a warm beige premium identity but not be identical.
Composition: vertical, entire product clearly visible and large, filling roughly 82–90% of usable frame, centered with minimal safe margins. Use natural studio lighting and realistic shadows, reflections and transparent material behavior.
Critical: preserve the actual product exactly: shape, count, proportions, colors, materials, patterns, package design and all writing, letters, numbers, labels, logos and decoration on the product. Do not invent components or change writing.
Remove only hands, arms, unrelated room clutter, external seller watermarks and external product number overlays. No additional text, branding, props, people or products. Do not crop the product."""


def main():
    count = int(os.environ.get("IMAGE_COUNT", "100"))
    if not 1 <= count <= 500:
        raise ValueError("IMAGE_COUNT must be between 1 and 500")
    ensure_tables()
    source_filter = ""
    if os.environ.get("DOFESH_DRAFT_ONLY") == "1":
        source_filter = " AND p.active=0 AND EXISTS(SELECT 1 FROM product_keywords k WHERE k.product_id=p.id AND k.keyword LIKE 'dofesh-%') "
    rows = query(
        "SELECT p.id AS product_id,p.item_number,p.name,m.id AS media_id,m.url "
        "FROM product_media m JOIN products p ON p.id=m.product_id "
        "LEFT JOIN image_ai_items ai ON ai.media_id=m.id "
        "WHERE m.is_primary=1 AND m.variant_id IS NULL AND m.url LIKE '/media/imports/%' "
        "AND p.deleted_at IS NULL AND ai.media_id IS NULL " + source_filter +
        f"ORDER BY p.id DESC LIMIT {count}"
    )["results"]
    if not rows:
        print("No unprocessed original product images remain", flush=True)
        return

    requests = []
    for index, row in enumerate(rows):
        requests.append({
            "custom_id": f"media-{row['media_id']}",
            "method": "POST",
            "url": "/v1/images/edits",
            "body": {
                "model": MODEL,
                "images": [{"image_url": SITE + row["url"]}],
                "prompt": prompt(row, index),
                "size": "1024x1536",
                "quality": "medium",
                "output_format": "webp",
            },
        })

    input_path = Path("batch-catalog-input.jsonl")
    input_path.write_text("\n".join(json.dumps(x, ensure_ascii=False) for x in requests) + "\n", encoding="utf-8")
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"], max_retries=3, timeout=240)
    with input_path.open("rb") as source:
        uploaded = client.files.create(file=source, purpose="batch")
    batch = client.batches.create(input_file_id=uploaded.id, endpoint="/v1/images/edits", completion_window="24h")

    now = "CAST(strftime('%s','now') AS INTEGER)*1000"
    local_id = batch.id
    statements = [
        "INSERT INTO image_ai_batches(id,openai_batch_id,status,requested_count,created_at,updated_at) VALUES("
        f"{q(local_id)},{q(batch.id)},{q(batch.status)},{len(rows)},{now},{now});"
    ]
    for row in rows:
        statements.append(
            "INSERT INTO image_ai_items(batch_id,media_id,product_id,item_number,product_name,original_url,status,created_at,updated_at) VALUES("
            f"{q(local_id)},{row['media_id']},{row['product_id']},{row['item_number']},{q(row['name'])},{q(row['url'])},'submitted',{now},{now});"
        )
    execute_file("\n".join(statements))
    print(f"Submitted {len(rows)} images as Batch {batch.id}", flush=True)
    print("The automatic collector will check and publish completed results", flush=True)


if __name__ == "__main__":
    main()
