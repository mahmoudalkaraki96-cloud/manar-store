"""Publish the remaining 21 owner-approved images from the first 50-image artifact."""
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path("batch-50-results")
RECORD = Path("batch-50-publish-record")
RECORD.mkdir(exist_ok=True)
APPROVED = {1218,1216,1207,1206,1205,1204,1203,1202,1201,1200,1195,1194,1192,1188,1185,1183,1172,1169,1166,1162,1161}

def wrangler(*args):
    result = subprocess.run(["./node_modules/.bin/wrangler", *args], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(f"Wrangler command failed: {result.stderr[-1200:]}")
    return result.stdout.strip()

def query(sql):
    data = json.loads(wrangler("d1", "execute", "manar-store-db", "--remote", "--json", "--config", "wrangler.jsonc", "--command", sql))
    if not data or not data[0].get("success"):
        raise RuntimeError(f"D1 query failed: {data}")
    return data[0]

def quote(text):
    return "'" + text.replace("'", "''") + "'"

def main():
    manifest = json.loads((ROOT / "manifest.json").read_text())
    approved = [item for item in manifest if item["product_id"] in APPROVED and item["status"] == "ok"]
    if len(approved) != len(APPROVED) or len({x["product_id"] for x in approved}) != len(APPROVED):
        raise RuntimeError("Missing or duplicate reviewed output")
    ids = ",".join(str(x["media_id"]) for x in approved)
    rows = query(f"SELECT m.id AS media_id,m.product_id,m.url,m.is_primary,m.variant_id,p.name FROM product_media m JOIN products p ON p.id=m.product_id WHERE m.id IN ({ids})")["results"]
    if len(rows) != len(APPROVED):
        raise RuntimeError("Missing media rows")
    actual = {row["media_id"]:row for row in rows}
    plan = []
    for item in approved:
        row = actual[item["media_id"]]
        key = f"edited/2026-09-19/batch50-1/product-{item['product_id']}.webp"
        target = "/media/" + key
        if row["product_id"] != item["product_id"] or row["url"] not in (item["url"], target) or row["is_primary"] != 1 or row["variant_id"] is not None:
            raise RuntimeError(f"Unexpected product image mapping: {item['product_id']}")
        file = ROOT / "edited" / f"product-{item['product_id']}.webp"
        image = file.read_bytes()
        if image[:4] != b"RIFF" or image[8:12] != b"WEBP" or len(image) < 10000:
            raise RuntimeError(f"Invalid reviewed WebP for {item['product_id']}")
        plan.append({"product_id": item["product_id"], "name": row["name"], "media_id": item["media_id"], "original_url": item["url"], "current_url": row["url"], "new_url": target, "key": key, "size":len(image)})
    (RECORD / "backup.json").write_text(json.dumps(plan, ensure_ascii=False, indent=2))
    print(f"Preflight passed for {len(plan)} reviewed product images", flush=True)

    for item in plan:
        image = ROOT / "edited" / f"product-{item['product_id']}.webp"
        dest = f"manar-store-media/{item['key']}"
        wrangler("r2", "object", "put", dest, "--file", str(image), "--content-type", "image/webp", "--remote", "--config", "wrangler.jsonc")
        fetched = RECORD / f"verify-{item['product_id']}.webp"
        wrangler("r2", "object", "get", dest, "--file", str(fetched), "--remote", "--config", "wrangler.jsonc")
        if hashlib.sha256(image.read_bytes()).digest() != hashlib.sha256(fetched.read_bytes()).digest():
            raise RuntimeError(f"R2 file verification failed: {item['product_id']}")
        print(f"Stored and verified {item['product_id']}", flush=True)

    for item in plan:
        if item["current_url"] == item["new_url"]:
            continue
        result = query("UPDATE product_media SET url=" + quote(item["new_url"]) + ",updated_at=CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id=" + str(item["media_id"]) + " AND product_id=" + str(item["product_id"]) + " AND url=" + quote(item["original_url"]))
        if result.get("meta",{}).get("changes") != 1:
            raise RuntimeError(f"D1 record changed concurrently: {item['product_id']}")
        print(f"Linked {item['product_id']}", flush=True)
    final = query(f"SELECT id,url FROM product_media WHERE id IN ({ids})")["results"]
    if {x["id"]:x["url"] for x in final} != {x["media_id"]:x["new_url"] for x in plan}:
        raise RuntimeError("Final link verification failed")
    print(f"SUCCESS: published {len(plan)} reviewed images; original links retained", flush=True)

if __name__ == "__main__":
    main()
