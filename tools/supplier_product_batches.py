"""Slow, resumable Jabari image comparison and WebP publishing batches.

The supplier image host is contacted serially at most once per minute. A batch
is published only after all of its images were downloaded, fingerprinted and
classified. Exact/near perceptual matches and borderline matches remain drafts.
"""

from __future__ import annotations

import concurrent.futures
import io
import json
import math
import os
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

from PIL import Image, ImageOps


SITE = "https://manarstore.ps"
SOURCE = "جعبري ستور"
SOURCE_HOSTS = {"jabaristore.com", "www.jabaristore.com"}
BATCH_SIZE = 100
MAX_BATCHES_PER_RUN = 3
SOURCE_INTERVAL = 60
MAX_IMAGE_BYTES = 20 * 1024 * 1024
PHASH_DUPLICATE_BITS = 4
PHASH_REVIEW_BITS = 12


def wrangler(*args: str) -> str:
    result = subprocess.run(
        ["./node_modules/.bin/wrangler", *args, "--config", "wrangler.jsonc"],
        text=True,
        capture_output=True,
        timeout=240,
    )
    if result.returncode:
        raise RuntimeError(f"Wrangler failed: {result.stderr[-1000:]}")
    return result.stdout.strip()


def query(sql: str) -> dict:
    data = json.loads(wrangler("d1", "execute", "manar-store-db", "--remote", "--json", "--command", sql))
    if not data or not data[0].get("success"):
        raise RuntimeError("D1 query failed")
    return data[0]


def execute(sql: str) -> None:
    with tempfile.NamedTemporaryFile("w", suffix=".sql", encoding="utf-8", delete=False) as file:
        file.write(sql)
        path = file.name
    try:
        wrangler("d1", "execute", "manar-store-db", "--remote", "--file", path)
    finally:
        Path(path).unlink(missing_ok=True)


def q(value: object) -> str:
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def now_ms() -> int:
    return int(time.time() * 1000)


def ensure_tables() -> None:
    execute("""
CREATE TABLE IF NOT EXISTS supplier_visual_control (
  id INTEGER PRIMARY KEY CHECK(id=1), target_max_product_id INTEGER NOT NULL,
  paused INTEGER NOT NULL DEFAULT 0, pause_reason TEXT, last_source_request_at INTEGER,
  next_batch_sequence INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS supplier_visual_batches (
  batch_id TEXT PRIMARY KEY, sequence INTEGER NOT NULL UNIQUE, status TEXT NOT NULL,
  requested_count INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  error TEXT
);
CREATE TABLE IF NOT EXISTS supplier_visual_batch_items (
  batch_id TEXT NOT NULL, media_id INTEGER NOT NULL, product_id INTEGER NOT NULL,
  item_number INTEGER NOT NULL, product_name TEXT NOT NULL, original_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', phash TEXT, matched_media_id INTEGER,
  similarity_distance INTEGER, processed_url TEXT, error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  PRIMARY KEY(batch_id,media_id)
);
CREATE TABLE IF NOT EXISTS supplier_visual_fingerprints (
  media_id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL, item_number INTEGER NOT NULL,
  source TEXT NOT NULL, image_url TEXT NOT NULL, phash TEXT NOT NULL,
  status TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_supplier_visual_batch_status ON supplier_visual_batches(status,sequence);
CREATE INDEX IF NOT EXISTS idx_supplier_visual_fingerprint_source ON supplier_visual_fingerprints(source);
""")


def initialize_target() -> dict:
    row = query("SELECT id,target_max_product_id,paused,pause_reason,last_source_request_at,next_batch_sequence FROM supplier_visual_control WHERE id=1")
    if row["results"]:
        return row["results"][0]
    target = query(
        "SELECT MAX(p.id) AS max_id FROM products p JOIN product_suppliers ps ON ps.product_id=p.id "
        "JOIN suppliers s ON s.id=ps.supplier_id WHERE s.name='جعبري ستور' AND p.deleted_at IS NULL"
    )["results"][0]["max_id"]
    if target is None:
        raise RuntimeError("No Jabari supplier products found")
    execute(f"INSERT INTO supplier_visual_control(id,target_max_product_id,updated_at) VALUES(1,{int(target)},{now_ms()})")
    return query("SELECT id,target_max_product_id,paused,pause_reason,last_source_request_at,next_batch_sequence FROM supplier_visual_control WHERE id=1")["results"][0]


def pause(reason: str, batch_id: str | None = None) -> None:
    safe = reason[:400]
    execute(
        f"UPDATE supplier_visual_control SET paused=1,pause_reason={q(safe)},updated_at={now_ms()} WHERE id=1;"
        + (f"UPDATE supplier_visual_batches SET status='blocked',error={q(safe)},updated_at={now_ms()} WHERE batch_id={q(batch_id)};" if batch_id else "")
    )
    print(f"PAUSED: {safe}", flush=True)


def get_batch() -> dict | None:
    rows = query("SELECT * FROM supplier_visual_batches WHERE status IN ('processing','blocked') ORDER BY sequence LIMIT 1")["results"]
    return rows[0] if rows else None


def create_batch(control: dict) -> dict | None:
    batch_id = int(control["next_batch_sequence"])
    max_id = int(control["target_max_product_id"])
    rows = query(
        "SELECT p.id AS product_id,p.item_number,p.name,m.id AS media_id,m.url AS original_url "
        "FROM products p JOIN product_suppliers ps ON ps.product_id=p.id JOIN suppliers s ON s.id=ps.supplier_id "
        "JOIN categories c ON c.id=p.category_id AND c.active=1 "
        "JOIN product_media m ON m.product_id=p.id AND m.is_primary=1 AND m.variant_id IS NULL AND m.media_type='image' "
        f"WHERE s.name={q(SOURCE)} AND p.active=0 AND p.deleted_at IS NULL AND p.id<={max_id} "
        "AND NOT EXISTS(SELECT 1 FROM supplier_visual_batch_items i WHERE i.media_id=m.id) "
        "ORDER BY p.id DESC LIMIT 100"
    )["results"]
    if not rows:
        return None
    name = f"jabari-{batch_id:04d}"
    now = now_ms()
    statements = [
        f"INSERT INTO supplier_visual_batches(batch_id,sequence,status,requested_count,created_at,updated_at) VALUES({q(name)},{batch_id},'processing',{len(rows)},{now},{now});",
        f"UPDATE supplier_visual_control SET next_batch_sequence={batch_id+1},updated_at={now} WHERE id=1;",
    ]
    for row in rows:
        statements.append(
            "INSERT INTO supplier_visual_batch_items(batch_id,media_id,product_id,item_number,product_name,original_url,status,created_at,updated_at) VALUES("+
            f"{q(name)},{int(row['media_id'])},{int(row['product_id'])},{int(row['item_number'])},{q(row['name'])},{q(row['original_url'])},'pending',{now},{now});"
        )
    execute("\n".join(statements))
    print(f"Created {name}: {len(rows)} products", flush=True)
    return get_batch()


def download(url: str, *, expected_host: str | None = None) -> bytes:
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname is None:
        raise RuntimeError("Image URL must use HTTPS")
    if expected_host and parsed.hostname.lower() not in SOURCE_HOSTS:
        raise RuntimeError(f"Unexpected supplier image host: {parsed.hostname}")
    request = urllib.request.Request(url, headers={"Accept": "image/*", "User-Agent": "ManarStore/1.0 (+https://manarstore.ps)"})

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None

    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=45) as response:
            data = response.read(MAX_IMAGE_BYTES + 1)
            if not response.headers.get("Content-Type", "").lower().startswith("image/"):
                raise RuntimeError("Supplier response was not an image")
    except urllib.error.HTTPError as error:
        if error.code in (403, 429):
            raise RuntimeError(f"supplier_block_http_{error.code}") from error
        raise RuntimeError(f"supplier_http_{error.code}") from error
    if len(data) > MAX_IMAGE_BYTES:
        raise RuntimeError("Image exceeds 20 MB")
    return data


def make_image(data: bytes) -> tuple[str, bytes]:
    with Image.open(io.BytesIO(data)) as source:
        image = ImageOps.exif_transpose(source).convert("RGBA" if "A" in source.getbands() else "RGB")
        image.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
        digest = phash(image)
        output = io.BytesIO()
        image.save(output, format="WEBP", quality=84, method=6)
        return digest, output.getvalue()


def phash(image: Image.Image) -> str:
    """Small pure-Python 64-bit perceptual hash; no model/API or extra package."""
    size = 32
    low = 8
    pixels = list(image.convert("L").resize((size, size), Image.Resampling.LANCZOS).tobytes())
    cosines = [[math.cos(math.pi * (2 * position + 1) * frequency / (2 * size)) for position in range(size)] for frequency in range(low)]
    horizontal = [[0.0] * low for _ in range(size)]
    for y in range(size):
        for u in range(low):
            horizontal[y][u] = sum(pixels[y * size + x] * cosines[u][x] for x in range(size))
    coefficients = [[0.0] * low for _ in range(low)]
    for v in range(low):
        scale_v = math.sqrt(1 / size) if v == 0 else math.sqrt(2 / size)
        for u in range(low):
            scale_u = math.sqrt(1 / size) if u == 0 else math.sqrt(2 / size)
            coefficients[v][u] = scale_v * scale_u * sum(horizontal[y][u] * cosines[v][y] for y in range(size))
    values = sorted(coefficients[v][u] for v in range(low) for u in range(low) if v or u)
    median = values[len(values) // 2]
    bits = [coefficients[v][u] > median for v in range(low) for u in range(low)]
    value = 0
    for bit in bits:
        value = (value << 1) | int(bit)
    return f"{value:016x}"


def hamming(first: str, second: str) -> int:
    return (int(first, 16) ^ int(second, 16)).bit_count()


def existing_fingerprints() -> list[dict]:
    return query("SELECT media_id,product_id,item_number,source,image_url,phash,status FROM supplier_visual_fingerprints")["results"]


def upload_webp(product_id: int, media_id: int, data: bytes) -> str:
    with tempfile.NamedTemporaryFile("wb", suffix=".webp", delete=False) as file:
        file.write(data)
        path = file.name
    try:
        key = f"imports/processed/jabari/product-{product_id}-media-{media_id}.webp"
        wrangler("r2", "object", "put", "manar-store-media/" + key, "--remote", "--file", path, "--content-type", "image/webp")
    finally:
        Path(path).unlink(missing_ok=True)
    return "/media/" + key


def baseline() -> bool:
    rows = query(
        "SELECT p.id AS product_id,p.item_number,m.id AS media_id,m.url "
        "FROM products p JOIN product_media m ON m.product_id=p.id AND m.media_type='image' AND m.is_primary=1 AND m.variant_id IS NULL "
        "WHERE p.active=1 AND p.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM supplier_visual_fingerprints f WHERE f.media_id=m.id) "
        "ORDER BY p.id"
    )["results"]
    if not rows:
        return True
    print(f"Fingerprinting {len(rows)} existing active product images on Manar", flush=True)

    def process(row: dict) -> tuple[dict, str]:
        url = row["url"]
        if url.startswith("/"):
            url = SITE + url
        data = download(url)
        digest, _ = make_image(data)
        return row, digest

    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        futures = [pool.submit(process, row) for row in rows]
        for future in concurrent.futures.as_completed(futures):
            try:
                row, digest = future.result()
            except Exception as error:
                pause(f"existing_image_unavailable: {type(error).__name__}")
                return False
            now = now_ms()
            execute(
                "INSERT OR IGNORE INTO supplier_visual_fingerprints(media_id,product_id,item_number,source,image_url,phash,status,created_at,updated_at) VALUES("+
                f"{int(row['media_id'])},{int(row['product_id'])},{int(row['item_number'])},'Manar',{q(row['url'])},{q(digest)},'baseline',{now},{now})"
            )
    print("Existing active catalog image fingerprints ready", flush=True)
    return True


def last_request_wait() -> None:
    row = query("SELECT last_source_request_at FROM supplier_visual_control WHERE id=1")["results"][0]
    previous = int(row.get("last_source_request_at") or 0)
    wait = max(0, SOURCE_INTERVAL - (time.time() - previous / 1000))
    if wait:
        print(f"Waiting {int(wait)} seconds to respect the supplier image limit", flush=True)
        time.sleep(wait)


def save_source_request_time() -> None:
    execute(f"UPDATE supplier_visual_control SET last_source_request_at={now_ms()},updated_at={now_ms()} WHERE id=1")


def process_item(batch: dict, row: dict, fingerprints: list[dict]) -> tuple[str, int | None, str | None, str]:
    original = row["original_url"]
    now = now_ms()
    if row["status"] == "uploaded":
        digest = row["phash"]
        status = row["error"]
        matched = row["matched_media_id"]
        best_distance = row.get("similarity_distance")
        processed_url = row["processed_url"]
    else:
        last_request_wait()
        save_source_request_time()
        data = download(original, expected_host="jabaristore.com")
        digest, webp = make_image(data)
        comparisons = [(hamming(digest, item["phash"]), int(item["media_id"])) for item in fingerprints]
        best_distance, matched = min(comparisons, default=(64, None))
        if best_distance <= PHASH_DUPLICATE_BITS:
            status = "duplicate"
        elif best_distance <= PHASH_REVIEW_BITS:
            status = "review"
        else:
            status = "unique"
        processed_url = upload_webp(int(row["product_id"]), int(row["media_id"]), webp)
        execute(
            f"UPDATE supplier_visual_batch_items SET status='uploaded',phash={q(digest)},matched_media_id={matched if matched is not None else 'NULL'},similarity_distance={best_distance},processed_url={q(processed_url)},error={q(status)},updated_at={now} WHERE batch_id={q(batch['batch_id'])} AND media_id={int(row['media_id'])} AND status='pending'"
        )
    changed = query(
        f"UPDATE product_media SET url={q(processed_url)},updated_at={now} WHERE id={int(row['media_id'])} AND product_id={int(row['product_id'])} AND url IN ({q(original)},{q(processed_url)})"
    ).get("meta", {}).get("changes")
    if changed != 1:
        raise RuntimeError("Product image changed during processing; product remains a draft")
    execute(
        "INSERT OR REPLACE INTO supplier_visual_fingerprints(media_id,product_id,item_number,source,image_url,phash,status,created_at,updated_at) VALUES("+
        f"{int(row['media_id'])},{int(row['product_id'])},{int(row['item_number'])},{q(SOURCE)},{q(processed_url)},{q(digest)},{q(status)},{now},{now});"
        f"UPDATE supplier_visual_batch_items SET status={q(status)},updated_at={now} WHERE batch_id={q(batch['batch_id'])} AND media_id={int(row['media_id'])};"
    )
    return status, best_distance, matched, processed_url


def finish_batch(batch: dict) -> dict:
    rows = query(f"SELECT * FROM supplier_visual_batch_items WHERE batch_id={q(batch['batch_id'])} ORDER BY item_number DESC")["results"]
    if len(rows) != int(batch["requested_count"]) or any(row["status"] not in ("unique", "duplicate", "review") for row in rows):
        raise RuntimeError("Batch incomplete; products remain drafts")
    now = now_ms()
    published = [row for row in rows if row["status"] == "unique"]
    review = [row for row in rows if row["status"] == "review"]
    duplicate = [row for row in rows if row["status"] == "duplicate"]
    if published:
        where = ",".join(str(int(row["product_id"])) for row in published)
        eligible = query(
            f"SELECT COUNT(*) AS count FROM products WHERE id IN ({where}) AND active=0 AND deleted_at IS NULL "
            f"AND EXISTS(SELECT 1 FROM categories c WHERE c.id=products.category_id AND c.active=1) "
            f"AND EXISTS(SELECT 1 FROM product_suppliers ps JOIN suppliers s ON s.id=ps.supplier_id WHERE ps.product_id=products.id AND s.name={q(SOURCE)})"
        )["results"][0]["count"]
        if int(eligible) != len(published):
            raise RuntimeError("Some unique products are no longer eligible; batch left incomplete and products remain drafts")
        execute(
            f"UPDATE products SET active=1,updated_at={now} WHERE id IN ({where}) AND active=0 AND deleted_at IS NULL "
            f"AND EXISTS(SELECT 1 FROM categories c WHERE c.id=products.category_id AND c.active=1) "
            f"AND EXISTS(SELECT 1 FROM product_suppliers ps JOIN suppliers s ON s.id=ps.supplier_id WHERE ps.product_id=products.id AND s.name={q(SOURCE)});"
        )
        activated = query(f"SELECT COUNT(*) AS count FROM products WHERE id IN ({where}) AND active=1")["results"][0]["count"]
        if int(activated) != len(published):
            raise RuntimeError("Published count did not match the unique-image count; batch left incomplete")
    execute(f"UPDATE supplier_visual_batches SET status='completed',updated_at={now} WHERE batch_id={q(batch['batch_id'])}")
    summary = {"batch": batch["batch_id"], "processed": len(rows), "published": len(published), "duplicates_left_draft": len(duplicate), "review_left_draft": len(review)}
    print(json.dumps(summary, ensure_ascii=False), flush=True)
    return {"summary": summary, "products": rows}


def main() -> None:
    mode = os.environ.get("BATCH_MODE", "preview")
    if mode not in ("preview", "process", "resume"):
        raise ValueError("BATCH_MODE must be preview, process, or resume")
    ensure_tables()
    control = initialize_target()
    if control["paused"] and mode != "resume":
        raise RuntimeError("Source processing is paused after a failure; inspect the run and dispatch with mode=resume")
    if control["paused"] and mode == "resume":
        execute("UPDATE supplier_visual_control SET paused=0,pause_reason=NULL,updated_at="+str(now_ms())+" WHERE id=1")
    batch = get_batch()
    if mode == "preview":
        if batch is None:
            batch = create_batch(control)
        if batch is None:
            print("No remaining Jabari draft products in the captured import set", flush=True)
            return
        items = query(f"SELECT item_number,product_name,status FROM supplier_visual_batch_items WHERE batch_id={q(batch['batch_id'])} ORDER BY item_number DESC")["results"]
        Path("supplier-product-batch-report.json").write_text(json.dumps({"mode": "preview", "batch": batch["batch_id"], "count": len(items), "products": items}, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({"mode": mode, "batch": batch["batch_id"], "count": len(items), "products": items}, ensure_ascii=False), flush=True)
        return

    completed_this_run = 0
    completed_reports = []
    while completed_this_run < MAX_BATCHES_PER_RUN:
        control = query("SELECT * FROM supplier_visual_control WHERE id=1")["results"][0]
        if control["paused"]:
            print("Stopped: supplier processing is paused", flush=True)
            break
        if not baseline():
            break
        batch = get_batch() or create_batch(control)
        if batch is None:
            print("No remaining Jabari draft products in the captured import set", flush=True)
            break
        execute(f"UPDATE supplier_visual_batches SET status='processing',error=NULL,updated_at={now_ms()} WHERE batch_id={q(batch['batch_id'])}")
        items = query(f"SELECT * FROM supplier_visual_batch_items WHERE batch_id={q(batch['batch_id'])} AND status IN ('pending','uploaded') ORDER BY item_number DESC")["results"]
        for row in items:
            try:
                status, distance, matched, _ = process_item(batch, row, existing_fingerprints())
                print(f"#{row['item_number']} {status}; phash distance={distance}; match_media={matched}", flush=True)
            except Exception as error:
                reason = str(error)[:300]
                pause(reason, batch["batch_id"])
                break
        control = query("SELECT paused FROM supplier_visual_control WHERE id=1")["results"][0]
        if control["paused"]:
            break
        report = finish_batch(batch)
        completed_reports.append(report)
        completed_this_run += 1
        if report["summary"]["processed"] < BATCH_SIZE:
            break
    control = query("SELECT target_max_product_id,paused FROM supplier_visual_control WHERE id=1")["results"][0]
    remaining = query(
        "SELECT COUNT(*) AS count FROM products p JOIN product_suppliers ps ON ps.product_id=p.id JOIN suppliers s ON s.id=ps.supplier_id "
        "JOIN product_media m ON m.product_id=p.id AND m.is_primary=1 AND m.variant_id IS NULL AND m.media_type='image' "
        f"WHERE s.name={q(SOURCE)} AND p.active=0 AND p.deleted_at IS NULL AND p.id<={int(control['target_max_product_id'])} "
        "AND NOT EXISTS(SELECT 1 FROM supplier_visual_batch_items i WHERE i.media_id=m.id)"
    )["results"][0]["count"]
    continue_chain = bool(remaining) and not control["paused"] and completed_this_run > 0 and completed_this_run == MAX_BATCHES_PER_RUN
    if completed_reports:
        Path("supplier-product-batch-report.json").write_text(json.dumps({"batches": completed_reports}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"::notice::remaining={remaining}; paused={control['paused']}; continue={str(continue_chain).lower()}", flush=True)
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
            output.write(f"continue={'true' if continue_chain else 'false'}\n")


if __name__ == "__main__":
    main()

