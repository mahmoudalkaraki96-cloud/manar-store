"""Create and upload five lossless-layout product thumbnail samples."""

import html
import json
import os
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import unquote

from PIL import Image, ImageOps

BUCKET = "manar-store-media"
REPORT_DIR = Path("thumbnail-trial-report")
REPORT_DIR.mkdir(exist_ok=True)
COUNT = 5
WIDTH = 480
QUALITY = 75


def wrangler(*args, timeout=300):
    result = subprocess.run(
        ["./node_modules/.bin/wrangler", *args, "--config", "wrangler.jsonc"],
        text=True, capture_output=True, timeout=timeout,
    )
    if result.returncode:
        raise RuntimeError((result.stderr or result.stdout)[-1600:])
    return result.stdout.strip()


def query(sql):
    payload = json.loads(wrangler(
        "d1", "execute", "manar-store-db", "--remote", "--json", "--command", sql
    ))
    if not payload or not payload[0].get("success"):
        raise RuntimeError("D1 query failed")
    return payload[0].get("results", [])


def r2_get(key, destination):
    wrangler("r2", "object", "get", f"{BUCKET}/{key}", "--remote", "--file", str(destination))


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


def thumbnail_key(source_url):
    key = unquote(source_url.removeprefix("/media/"))
    source_path = Path(key)
    return str(Path("thumbnails") / f"w{WIDTH}" / source_path.with_suffix(".webp"))


def main():
    rows = query(
        "SELECT p.id AS product_id,p.item_number,p.name,m.id AS media_id,m.url "
        "FROM product_media m JOIN products p ON p.id=m.product_id "
        "WHERE m.is_primary=1 AND m.variant_id IS NULL "
        "AND m.url LIKE '/media/%' AND p.deleted_at IS NULL AND p.active=1 "
        f"ORDER BY p.id DESC LIMIT {COUNT}"
    )
    if len(rows) != COUNT:
        raise RuntimeError(f"Expected {COUNT} products, found {len(rows)}")

    results = []
    with tempfile.TemporaryDirectory() as temp:
        root = Path(temp)
        for index, row in enumerate(rows, start=1):
            source_key = unquote(row["url"].removeprefix("/media/"))
            source = root / f"original-{row['media_id']}{Path(source_key).suffix or '.img'}"
            output = root / f"thumbnail-{row['media_id']}.webp"
            r2_get(source_key, source)

            original_bytes = source.stat().st_size
            with Image.open(source) as opened:
                image = ImageOps.exif_transpose(opened)
                original_dimensions = [image.width, image.height]
                if image.mode not in ("RGB", "RGBA"):
                    image = image.convert("RGBA" if "transparency" in image.info else "RGB")
                if image.width > WIDTH:
                    target_height = max(1, round(image.height * WIDTH / image.width))
                    image = image.resize((WIDTH, target_height), Image.Resampling.LANCZOS)
                image.save(output, "WEBP", quality=QUALITY, method=6)
                thumbnail_dimensions = [image.width, image.height]

            thumb_bytes = output.stat().st_size
            key = thumbnail_key(row["url"])
            r2_put(key, output)
            saving = round((1 - thumb_bytes / original_bytes) * 100, 1) if original_bytes else 0
            entry = {
                "product_id": row["product_id"],
                "item_number": row["item_number"],
                "name": row["name"],
                "original_url": row["url"],
                "thumbnail_url": "/media/" + key,
                "original_bytes": original_bytes,
                "thumbnail_bytes": thumb_bytes,
                "original_size": human_size(original_bytes),
                "thumbnail_size": human_size(thumb_bytes),
                "saving_percent": saving,
                "original_dimensions": original_dimensions,
                "thumbnail_dimensions": thumbnail_dimensions,
            }
            results.append(entry)
            print(
                f"THUMBNAIL {index}/{COUNT}: item #{row['item_number']} | "
                f"{entry['original_size']} -> {entry['thumbnail_size']} | saved {saving}%",
                flush=True,
            )

    (REPORT_DIR / "results.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    rows_html = "".join(
        "<tr>"
        f"<td>#{html.escape(str(item['item_number']))}</td>"
        f"<td>{html.escape(str(item['name']))}</td>"
        f"<td>{html.escape(item['original_size'])}</td>"
        f"<td>{html.escape(item['thumbnail_size'])}</td>"
        f"<td>{item['saving_percent']}%</td>"
        f"<td>{item['original_dimensions'][0]}×{item['original_dimensions'][1]}</td>"
        f"<td>{item['thumbnail_dimensions'][0]}×{item['thumbnail_dimensions'][1]}</td>"
        "</tr>" for item in results
    )
    page = f"""<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8">
<title>تجربة مصغرات المنتجات</title>
<style>body{{font-family:Arial,Tahoma,sans-serif;margin:24px;color:#30242a}}table{{border-collapse:collapse;width:100%}}th,td{{border:1px solid #ddd;padding:9px;text-align:right}}th{{background:#f4e8ed}}</style>
<h1>تجربة خمس صور مصغرة</h1><p>عرض 480px، WebP جودة 75، بدون قص أو تمديد. الصور الأصلية لم تتغير.</p>
<table><thead><tr><th>رقم المنتج</th><th>الاسم</th><th>قبل</th><th>بعد</th><th>التوفير</th><th>أبعاد الأصل</th><th>أبعاد المصغرة</th></tr></thead><tbody>{rows_html}</tbody></table></html>"""
    (REPORT_DIR / "report.html").write_text(page, encoding="utf-8")
    print("THUMBNAIL_RESULTS_JSON=" + json.dumps(results, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
