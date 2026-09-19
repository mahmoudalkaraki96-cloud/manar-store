"""Publish the approved 19-image trial without overwriting original R2 objects."""
import json
import hashlib
import subprocess
from pathlib import Path

DB = "manar-store-db"
BUCKET = "manar-store-media"
ROOT = Path("publish-trial19-results")
ROOT.mkdir(exist_ok=True)


def wrangler(*args):
    result = subprocess.run(["./node_modules/.bin/wrangler", *args], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(f"Wrangler failed: {' '.join(args[:4])}: {result.stderr[-2000:]}")
    return result.stdout.strip()


def query(sql):
    raw = wrangler("d1", "execute", DB, "--remote", "--json", "--config", "wrangler.jsonc", "--command", sql)
    data = json.loads(raw)
    if not isinstance(data, list) or not data or not data[0].get("success"):
        raise RuntimeError(f"D1 query did not succeed: {raw[-1000:]}")
    return data[0]


def quote(value):
    return "'" + str(value).replace("'", "''") + "'"


def main():
    archive = Path("image-trial-results")
    manifest = json.loads((archive / "manifest.json").read_text())
    approved = [item for item in manifest if item["status"] == "ok"]
    if len(approved) != 19 or len({x["id"] for x in approved}) != 19:
        raise RuntimeError("Expected exactly 19 distinct successful trial images")

    candidates = []
    for item in approved:
        product_id = item["id"]
        image = (archive / f"edited/product-{product_id}.webp").read_bytes()
        if not image.startswith(b"RIFF") or image[8:12] != b"WEBP" or len(image) < 10000:
            raise RuntimeError(f"Invalid WebP file for {product_id}")
        # The trial used explicit source paths. Confirm against that list instead of inferring numbering.
        sources = {
            "1221":"dofesh-5.jpeg", "1219":"dofesh-8.jpg", "1214":"dofesh-14.jpeg",
            "1213":"dofesh-15.jpeg", "1209":"dofesh-21.jpeg", "1198":"dofesh-37.jpeg",
            "1196":"dofesh-42.jpeg", "1187":"dofesh-51.jpeg", "1184":"dofesh-54.jpeg",
            "1163":"dofesh-83.jpeg", "1158":"dofesh-94.png", "1153":"dofesh-101.jpeg",
            "1152":"dofesh-102.jpeg", "1149":"dofesh-105.jpeg", "1120":"dofesh-156.png",
            "1119":"dofesh-174.jpg", "1093":"dofesh-239.jpeg", "1087":"dofesh-250.jpeg",
            "1079":"dofesh-259.jpg",
        }
        source_url = "/media/imports/" + sources[product_id]
        candidates.append((product_id, item["name"], source_url, image))

    acceptable_urls = [x[2] for x in candidates] + [f"/media/edited/2026-09-19/trial19/product-{x[0]}.webp" for x in candidates]
    sql = "SELECT p.id AS product_id,p.item_number,p.name,m.id AS media_id,m.url,m.is_primary,m.variant_id FROM product_media m JOIN products p ON p.id=m.product_id WHERE m.url IN (" + ",".join(quote(x) for x in acceptable_urls) + ") ORDER BY p.id,m.id"
    rows = query(sql)["results"]
    if len(rows) != 19 or len({x["media_id"] for x in rows}) != 19 or len({x["product_id"] for x in rows}) != 19:
        raise RuntimeError(f"Expected 19 unique matching media rows; got {len(rows)}")
    by_product = {x["product_id"]: x for x in rows}
    plan = []
    for product_id, name, source_url, image in candidates:
        row = by_product[int(product_id)]
        key = f"edited/2026-09-19/trial19/product-{product_id}.webp"
        if row["url"] not in (source_url, "/media/" + key) or row["is_primary"] != 1 or row["variant_id"] is not None:
            raise RuntimeError(f"Unexpected product/media mapping for {product_id}: {row}")
        plan.append({"trial_id": product_id, "name": name, "product_id": row["product_id"], "media_id": row["media_id"], "old_url": source_url, "current_url": row["url"], "new_url": "/media/" + key, "r2_key": key, "bytes": len(image)})
    (ROOT / "original-links.json").write_text(json.dumps(plan, ensure_ascii=False, indent=2))
    print("Preflight verified 19 unique primary media rows; original links backed up.", flush=True)

    for record, (_, _, _, image) in zip(plan, candidates):
        file = ROOT / f"product-{record['trial_id']}.webp"
        file.write_bytes(image)
        wrangler("r2", "object", "put", f"{BUCKET}/{record['r2_key']}", "--file", str(file), "--content-type", "image/webp", "--remote", "--config", "wrangler.jsonc")
        downloaded = ROOT / f"verify-{record['trial_id']}.webp"
        wrangler("r2", "object", "get", f"{BUCKET}/{record['r2_key']}", "--file", str(downloaded), "--remote", "--config", "wrangler.jsonc")
        if hashlib.sha256(downloaded.read_bytes()).digest() != hashlib.sha256(image).digest():
            raise RuntimeError(f"Uploaded R2 object does not match image {record['trial_id']}")
        print(f"Uploaded and verified {record['trial_id']}", flush=True)

    # Conditional updates make reruns safe and refuse to overwrite later manual edits.
    for record in plan:
        if record["current_url"] == record["new_url"]:
            print(f"Already linked product {record['trial_id']}", flush=True)
            continue
        statement = ("UPDATE product_media SET url=" + quote(record["new_url"]) +
                     ",updated_at=CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id=" +
                     str(record["media_id"]) + " AND product_id=" + str(record["product_id"]) +
                     " AND url=" + quote(record["old_url"]))
        result = query(statement)
        if result.get("meta", {}).get("changes") != 1:
            raise RuntimeError(f"Stopped: media row changed during publish for {record['trial_id']}")
        print(f"Linked product {record['trial_id']}", flush=True)

    ids = ",".join(str(record["media_id"]) for record in plan)
    final = query(f"SELECT id,url FROM product_media WHERE id IN ({ids})")["results"]
    if {x["id"]: x["url"] for x in final} != {x["media_id"]: x["new_url"] for x in plan}:
        raise RuntimeError("Final D1 link verification failed")
    (ROOT / "result.json").write_text(json.dumps({"updated": len(plan), "products": plan}, ensure_ascii=False, indent=2))
    print("SUCCESS: 19 product primary images linked; original objects retained.", flush=True)


if __name__ == "__main__":
    main()
