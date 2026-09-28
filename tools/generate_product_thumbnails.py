"""Generate stored 480px WebP thumbnails for every active product's primary image."""

import csv
import html
import json
import os
import subprocess
import tempfile
import threading
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import unquote

from PIL import Image, ImageOps

BUCKET = "manar-store-media"
SITE = "https://manarstore.ps"
WIDTH = 480
QUALITY = 75
WORKERS = 6
REPORT_DIR = Path("thumbnail-batch-report")
REPORT_DIR.mkdir(exist_ok=True)
print_lock = threading.Lock()


def wrangler(*args, timeout=300, allow_missing=False):
    result = subprocess.run(
        ["./node_modules/.bin/wrangler", *args, "--config", "wrangler.jsonc"],
        text=True, capture_output=True, timeout=timeout,
    )
    if result.returncode:
        message = (result.stderr or result.stdout)
        if allow_missing and any(token in message.lower() for token in ("not found", "does not exist", "404")):
            return None
        raise RuntimeError(message[-1600:])
    return result.stdout.strip()


def query(sql):
    payload = json.loads(wrangler(
        "d1", "execute", "manar-store-db", "--remote", "--json", "--command", sql
    ))
    if not payload or not payload[0].get("success"):
        raise RuntimeError("D1 query failed")
    return payload[0].get("results", [])


def r2_get(key, destination, missing_ok=False):
    result = wrangler(
        "r2", "object", "get", f"{BUCKET}/{key}", "--remote",
        "--file", str(destination), allow_missing=missing_ok,
    )
    return result is not None


def r2_put(key, source):
    wrangler(
        "r2", "object", "put", f"{BUCKET}/{key}", "--remote",
        "--file", str(source), "--content-type", "image/webp",
        "--cache-control", "public, max-age=31536000, immutable",
    )


def human_size(value):
    if value >= 1024 * 1024:
        return f"{value / 1024 / 1024:.2f} MB"
    return f"{value / 1024:.1f} KB"


def paths_for(source_url):
    if source_url.startswith("/media/"):
        source_key = unquote(source_url[len("/media/"):])
        source_path = Path(source_key)
        target_key = str(Path("thumbnails") / f"w{WIDTH}" / source_path.with_suffix(".webp"))
        return source_key, target_key
    if source_url.startswith("/product-images/"):
        relative = unquote(source_url.lstrip("/"))
        target_key = str(Path("thumbnails") / f"w{WIDTH}" / Path(relative).with_suffix(".webp"))
        return None, target_key
    raise ValueError("Unsupported image path")


def download_source(source_url, source_key, destination):
    if source_key is not None:
        r2_get(source_key, destination)
        return
    request = urllib.request.Request(SITE + source_url, headers={"User-Agent": "ManarStoreThumbnailer/1.0"})
    with urllib.request.urlopen(request, timeout=90) as response:
        destination.write_bytes(response.read())


def process_image(group, temp_root):
    source_url = group["url"]
    source_key, target_key = paths_for(source_url)
    token = str(abs(hash(source_url)))
    suffix = Path(unquote(source_url)).suffix or ".img"
    original = temp_root / f"source-{token}{suffix}"
    thumbnail = temp_root / f"thumb-{token}.webp"
    existing = temp_root / f"existing-{token}.webp"
    entry = {
        "product_ids": group["product_ids"],
        "item_numbers": group["item_numbers"],
        "names": group["names"],
        "original_url": source_url,
        "thumbnail_url": "/media/" + target_key,
    }
    try:
        download_source(source_url, source_key, original)
        original_bytes = original.stat().st_size
        if original_bytes < 1000:
            raise ValueError("Original image is too small")

        if r2_get(target_key, existing, missing_ok=True):
            with Image.open(original) as opened:
                image = ImageOps.exif_transpose(opened)
                original_dimensions = [image.width, image.height]
            with Image.open(existing) as opened:
                thumb_image = ImageOps.exif_transpose(opened)
                thumbnail_dimensions = [thumb_image.width, thumb_image.height]
            thumb_bytes = existing.stat().st_size
            status = "skipped_existing"
        else:
            with Image.open(original) as opened:
                image = ImageOps.exif_transpose(opened)
                original_dimensions = [image.width, image.height]
                if image.mode not in ("RGB", "RGBA"):
                    image = image.convert("RGBA" if "transparency" in image.info else "RGB")
                if image.width > WIDTH:
                    height = max(1, round(image.height * WIDTH / image.width))
                    image = image.resize((WIDTH, height), Image.Resampling.LANCZOS)
                image.save(thumbnail, "WEBP", quality=QUALITY, method=6)
                thumbnail_dimensions = [image.width, image.height]
            thumb_bytes = thumbnail.stat().st_size
            if thumb_bytes < 500:
                raise ValueError("Generated thumbnail is too small")
            r2_put(target_key, thumbnail)
            verify = temp_root / f"verify-{token}.webp"
            if not r2_get(target_key, verify) or verify.stat().st_size != thumb_bytes:
                raise ValueError("R2 verification failed")
            verify.unlink(missing_ok=True)
            status = "uploaded"

        entry.update({
            "status": status,
            "original_bytes": original_bytes,
            "thumbnail_bytes": thumb_bytes,
            "original_size": human_size(original_bytes),
            "thumbnail_size": human_size(thumb_bytes),
            "saving_percent": round((1 - thumb_bytes / original_bytes) * 100, 1),
            "original_dimensions": original_dimensions,
            "thumbnail_dimensions": thumbnail_dimensions,
        })
    except Exception as error:
        entry.update({"status": "failed", "error": str(error)[:500]})
    finally:
        for path in (original, thumbnail, existing):
            path.unlink(missing_ok=True)
    with print_lock:
        label = ",".join(str(value) for value in group["item_numbers"])
        if entry["status"] == "failed":
            print(f"FAILED #{label}: {entry['error']}", flush=True)
        else:
            print(
                f"{entry['status'].upper()} #{label}: "
                f"{entry['original_size']} -> {entry['thumbnail_size']} "
                f"({entry['saving_percent']}% saved)", flush=True
            )
    return entry


def write_report(results):
    results.sort(key=lambda item: min(item["item_numbers"]) if item["item_numbers"] else 0)
    (REPORT_DIR / "results.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    fields = [
        "status", "item_numbers", "names", "original_size", "thumbnail_size",
        "saving_percent", "original_dimensions", "thumbnail_dimensions",
        "original_url", "thumbnail_url", "error",
    ]
    with (REPORT_DIR / "results.csv").open("w", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for item in results:
            row = dict(item)
            for key in ("item_numbers", "names", "original_dimensions", "thumbnail_dimensions"):
                row[key] = " | ".join(map(str, row.get(key, [])))
            writer.writerow(row)

    uploaded = sum(item["status"] == "uploaded" for item in results)
    skipped = sum(item["status"] == "skipped_existing" for item in results)
    failed = sum(item["status"] == "failed" for item in results)
    before = sum(item.get("original_bytes", 0) for item in results)
    after = sum(item.get("thumbnail_bytes", 0) for item in results)
    summary = {
        "unique_primary_images": len(results),
        "uploaded": uploaded,
        "skipped_existing": skipped,
        "failed": failed,
        "total_original_bytes": before,
        "total_thumbnail_bytes": after,
        "total_original_size": human_size(before),
        "total_thumbnail_size": human_size(after),
        "saving_percent": round((1 - after / before) * 100, 1) if before else 0,
    }
    (REPORT_DIR / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    table = "".join(
        "<tr>"
        f"<td>{html.escape(item['status'])}</td>"
        f"<td>{html.escape(', '.join(map(str,item['item_numbers'])))}</td>"
        f"<td>{html.escape(' | '.join(item['names']))}</td>"
        f"<td>{html.escape(item.get('original_size','—'))}</td>"
        f"<td>{html.escape(item.get('thumbnail_size','—'))}</td>"
        f"<td>{html.escape(str(item.get('saving_percent','—')))}%</td>"
        f"<td>{html.escape(item.get('error',''))}</td>"
        "</tr>" for item in results
    )
    page = f"""<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8">
<title>تقرير مصغرات المنتجات</title><style>body{{font-family:Arial,Tahoma,sans-serif;margin:24px;color:#30242a}}table{{border-collapse:collapse;width:100%;font-size:13px}}th,td{{border:1px solid #ddd;padding:8px;text-align:right}}th{{background:#f4e8ed}}.summary{{background:#fff4f7;padding:14px;border-radius:10px}}</style>
<h1>تقرير مصغرات الصور الأساسية</h1><div class="summary"><pre>{html.escape(json.dumps(summary,ensure_ascii=False,indent=2))}</pre></div>
<table><thead><tr><th>الحالة</th><th>رقم المنتج</th><th>الاسم</th><th>قبل</th><th>بعد</th><th>التوفير</th><th>الخطأ</th></tr></thead><tbody>{table}</tbody></table></html>"""
    (REPORT_DIR / "report.html").write_text(page, encoding="utf-8")
    print("THUMBNAIL_SUMMARY=" + json.dumps(summary, ensure_ascii=False), flush=True)
    return summary


def main():
    rows = query(
        "SELECT p.id AS product_id,p.item_number,p.name,m.id AS media_id,m.url "
        "FROM product_media m JOIN products p ON p.id=m.product_id "
        "WHERE m.is_primary=1 AND m.variant_id IS NULL "
        "AND (m.url LIKE '/media/%' OR m.url LIKE '/product-images/%') "
        "AND m.url NOT LIKE '/media/thumbnails/%' "
        "AND p.deleted_at IS NULL AND p.active=1 ORDER BY p.id DESC"
    )
    groups = {}
    for row in rows:
        group = groups.setdefault(row["url"], {
            "url": row["url"], "product_ids": [], "item_numbers": [], "names": []
        })
        group["product_ids"].append(row["product_id"])
        group["item_numbers"].append(row["item_number"])
        group["names"].append(row["name"])

    print(f"Selected {len(rows)} products using {len(groups)} unique primary images", flush=True)
    results = []
    with tempfile.TemporaryDirectory() as temp:
        root = Path(temp)
        with ThreadPoolExecutor(max_workers=WORKERS) as pool:
            futures = [pool.submit(process_image, group, root) for group in groups.values()]
            for future in as_completed(futures):
                results.append(future.result())

    summary = write_report(results)
    if summary["failed"]:
        raise SystemExit(f"{summary['failed']} thumbnails failed; inspect the report")


if __name__ == "__main__":
    main()
