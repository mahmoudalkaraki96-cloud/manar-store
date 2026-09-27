"""Safely preview or delete replaced original product images from Cloudflare R2."""

import csv
import html
import json
import os
import subprocess
import tempfile
from pathlib import Path

BUCKET = "manar-store-media"
REPORT_DIR = Path("old-image-cleanup-report")
REPORT_DIR.mkdir(exist_ok=True)
MODE = os.environ.get("CLEANUP_MODE", "preview").strip().lower()
CONFIRMED = os.environ.get("CONFIRM_DELETE", "false").strip().lower() == "true"


def wrangler(*args, timeout=300):
    result = subprocess.run(
        ["./node_modules/.bin/wrangler", *args, "--config", "wrangler.jsonc"],
        text=True, capture_output=True, timeout=timeout,
    )
    if result.returncode:
        raise RuntimeError((result.stderr or result.stdout)[-1600:])
    return result.stdout.strip()


def query(sql):
    data = json.loads(wrangler("d1", "execute", "manar-store-db", "--remote", "--json", "--command", sql))
    if not data or not data[0].get("success"):
        raise RuntimeError("D1 query failed")
    return data[0].get("results", [])


def q(value):
    return "'" + str(value).replace("'", "''") + "'"


def media_key(url):
    if not isinstance(url, str) or not url.startswith("/media/"):
        return None
    key = url[len("/media/"):]
    if not key or key.startswith("edited/") or ".." in key or key.startswith("/"):
        return None
    return key


def r2_get(key, destination):
    result = subprocess.run(
        ["./node_modules/.bin/wrangler", "r2", "object", "get", f"{BUCKET}/{key}",
         "--remote", "--file", str(destination), "--config", "wrangler.jsonc"],
        text=True, capture_output=True, timeout=300,
    )
    if result.returncode == 0:
        return True
    message = (result.stderr or result.stdout).lower()
    if "not found" in message or "does not exist" in message or "404" in message:
        return False
    raise RuntimeError((result.stderr or result.stdout)[-1200:])


def r2_delete(key):
    wrangler("r2", "object", "delete", f"{BUCKET}/{key}", "--remote")


def add_candidate(candidates, row, source):
    old_url = row.get("original_url")
    current_url = row.get("current_url")
    key = media_key(old_url)
    if not key or old_url == current_url:
        return
    item = candidates.setdefault(old_url, {
        "original_url": old_url,
        "original_key": key,
        "current_urls": set(),
        "media_ids": set(),
        "product_ids": set(),
        "item_numbers": set(),
        "sources": set(),
    })
    if current_url:
        item["current_urls"].add(current_url)
    if row.get("media_id") is not None:
        item["media_ids"].add(str(row["media_id"]))
    if row.get("product_id") is not None:
        item["product_ids"].add(str(row["product_id"]))
    if row.get("item_number") is not None:
        item["item_numbers"].add(str(row["item_number"]))
    item["sources"].add(source)


def collect_candidates():
    candidates = {}

    for row in query(
        "SELECT ai.media_id,ai.product_id,ai.item_number,ai.original_url,"
        "pm.url AS current_url FROM image_ai_items ai "
        "JOIN product_media pm ON pm.id=ai.media_id AND pm.product_id=ai.product_id "
        "WHERE ai.status='published' AND ai.generated_url IS NOT NULL "
        "AND pm.url=ai.generated_url AND ai.original_url<>pm.url"
    ):
        add_candidate(candidates, row, "batch")

    for row in query(
        "SELECT s.media_id,s.product_id,p.item_number,s.original_url,"
        "pm.url AS current_url FROM image_processing_status s "
        "JOIN product_media pm ON pm.id=s.media_id AND pm.product_id=s.product_id "
        "LEFT JOIN products p ON p.id=s.product_id "
        "WHERE s.status='processed' AND s.original_url IS NOT NULL "
        "AND s.processed_url IS NOT NULL AND pm.url=s.processed_url "
        "AND s.original_url<>pm.url"
    ):
        add_candidate(candidates, row, "processing-ledger")

    direct_rows = query(
        "SELECT pm.id AS media_id,pm.product_id,p.item_number,pm.url AS current_url "
        "FROM product_media pm LEFT JOIN products p ON p.id=pm.product_id "
        "WHERE pm.url LIKE '/media/edited/auto-v1/%'"
    )
    with tempfile.TemporaryDirectory() as temp:
        temp_path = Path(temp)
        for row in direct_rows:
            backup_key = f"edited/auto-v1/backups/media-{row['media_id']}.json"
            backup_file = temp_path / f"backup-{row['media_id']}.json"
            if not r2_get(backup_key, backup_file):
                continue
            try:
                backup = json.loads(backup_file.read_text(encoding="utf-8"))
            except Exception:
                continue
            if backup.get("new_url") != row["current_url"]:
                continue
            add_candidate(candidates, {**row, "original_url": backup.get("original_url")}, "auto-v1")

    return candidates


def inspect_and_maybe_delete(candidates):
    rows = []
    with tempfile.TemporaryDirectory() as temp:
        temp_path = Path(temp)
        for index, item in enumerate(sorted(candidates.values(), key=lambda value: value["original_key"])):
            old_url = item["original_url"]
            references = query("SELECT COUNT(*) AS count FROM product_media WHERE url=" + q(old_url))
            active_refs = int(references[0]["count"]) if references else 0
            current_urls = sorted(item["current_urls"])
            status = "ready"
            reason = ""

            if active_refs:
                status, reason = "kept", f"still referenced by {active_refs} media row(s)"
            elif not current_urls:
                status, reason = "kept", "no current replacement URL"
            else:
                for current_url in current_urls:
                    current_key = current_url.removeprefix("/media/") if current_url.startswith("/media/") else None
                    if not current_key:
                        status, reason = "kept", "replacement is not an R2 media URL"
                        break
                    if MODE == "delete":
                        verify_file = temp_path / f"replacement-{index}-{len(reason)}"
                        if not r2_get(current_key, verify_file):
                            status, reason = "kept", f"replacement missing from R2: {current_key}"
                            break
                        verify_file.unlink(missing_ok=True)

            if status == "ready" and MODE == "delete":
                try:
                    r2_delete(item["original_key"])
                    status, reason = "deleted", "replacement verified; original deleted"
                except Exception as error:
                    status, reason = "error", str(error)[:500]
            elif status == "ready":
                status, reason = "preview", "safe candidate; no deletion performed"

            rows.append({
                "status": status,
                "reason": reason,
                "original_url": old_url,
                "original_key": item["original_key"],
                "current_urls": " | ".join(current_urls),
                "media_ids": ",".join(sorted(item["media_ids"])),
                "product_ids": ",".join(sorted(item["product_ids"])),
                "item_numbers": ",".join(sorted(item["item_numbers"])),
                "sources": ",".join(sorted(item["sources"])),
                "active_references": active_refs,
            })
            print(f"{status.upper()}: {item['original_key']} — {reason}", flush=True)
    return rows


def write_report(rows):
    json_path = REPORT_DIR / "cleanup-results.json"
    json_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")

    fields = list(rows[0].keys()) if rows else [
        "status","reason","original_url","original_key","current_urls","media_ids",
        "product_ids","item_numbers","sources","active_references"
    ]
    with (REPORT_DIR / "cleanup-results.csv").open("w", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)

    counts = {}
    for row in rows:
        counts[row["status"]] = counts.get(row["status"], 0) + 1
    summary = {"mode": MODE, "total_candidates": len(rows), "counts": counts}
    (REPORT_DIR / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    table_rows = "".join(
        "<tr>" + "".join(f"<td>{html.escape(str(row.get(field,'')))}</td>" for field in
        ("status","item_numbers","original_key","current_urls","reason","sources")) + "</tr>"
        for row in rows
    )
    page = f"""<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8">
<title>تقرير تنظيف الصور القديمة</title>
<style>body{{font-family:Arial,Tahoma,sans-serif;margin:24px;color:#30242a}}table{{border-collapse:collapse;width:100%;font-size:13px}}th,td{{border:1px solid #ddd;padding:8px;text-align:right;vertical-align:top}}th{{background:#f4e8ed}}code{{direction:ltr}}.summary{{padding:14px;background:#fff4f7;border-radius:10px;margin-bottom:18px}}</style>
<h1>تقرير تنظيف الصور القديمة</h1><div class="summary"><b>الوضع:</b> {html.escape(MODE)}<br><b>المرشح:</b> {len(rows)}<br><b>النتيجة:</b> {html.escape(json.dumps(counts,ensure_ascii=False))}</div>
<table><thead><tr><th>الحالة</th><th>أرقام المنتجات</th><th>الصورة القديمة</th><th>البديل الحالي</th><th>السبب</th><th>المصدر</th></tr></thead><tbody>{table_rows}</tbody></table></html>"""
    (REPORT_DIR / "report.html").write_text(page, encoding="utf-8")
    return summary


def main():
    if MODE not in {"preview", "delete"}:
        raise ValueError("CLEANUP_MODE must be preview or delete")
    if MODE == "delete" and not CONFIRMED:
        raise ValueError("Delete mode requires CONFIRM_DELETE=true")

    candidates = collect_candidates()
    rows = inspect_and_maybe_delete(candidates)
    summary = write_report(rows)
    print(json.dumps(summary, ensure_ascii=False), flush=True)
    if any(row["status"] == "error" for row in rows):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
