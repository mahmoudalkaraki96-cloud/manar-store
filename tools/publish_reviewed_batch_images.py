"""Publish already-generated review images without another OpenAI call."""

import json
import os
import subprocess


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


def q(value):
    return "'" + str(value).replace("'", "''") + "'"


def main():
    raw = os.environ.get("ITEM_NUMBERS", "")
    numbers = sorted({int(value.strip()) for value in raw.split(",") if value.strip()})
    if not numbers or len(numbers) > 500:
        raise ValueError("Provide 1–500 comma-separated visible product numbers")
    values = ",".join(map(str, numbers))
    rows = query(
        "SELECT * FROM image_ai_items WHERE status='pending_review' AND item_number IN (" + values + ") ORDER BY item_number"
    )["results"]
    found = {row["item_number"] for row in rows}
    missing = [number for number in numbers if number not in found]
    if missing:
        raise ValueError(f"No pending generated image for product numbers: {missing}")
    now = "CAST(strftime('%s','now') AS INTEGER)*1000"
    for row in rows:
        changed = query(
            "UPDATE product_media SET url=" + q(row["generated_url"]) + ",updated_at=" + now +
            f" WHERE id={row['media_id']} AND product_id={row['product_id']} AND url=" + q(row["original_url"])
        ).get("meta", {}).get("changes")
        if changed != 1:
            raise RuntimeError(f"Refused product {row['item_number']}: original image is no longer current")
        query(
            f"UPDATE image_ai_items SET status='published',updated_at={now} WHERE batch_id={q(row['batch_id'])} AND media_id={row['media_id']}"
        )
        print(f"Published reviewed image for visible product {row['item_number']}", flush=True)


if __name__ == "__main__":
    main()
