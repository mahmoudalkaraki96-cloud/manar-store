"""Collect completed OpenAI image batches, publish safe items, and create reports."""

import base64
import html
import json
import os
import subprocess
import tempfile
from pathlib import Path

from openai import OpenAI
from batch_catalog_images import ensure_tables


ROOT = Path("batch-collector-report")
ROOT.mkdir(exist_ok=True)
BUCKET = "manar-store-media"
SITE = "https://manar-store.mahmoud-alkaraki96.workers.dev"
RISK_WORDS = ("مصحف", "قرآن", "مطبوع", "كتابة", "تراث", "كوفية", "تعليقة", "شفاف", "اكريلك", "عطر")


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


def r2_put(key, path, mime):
    wrangler("r2", "object", "put", f"{BUCKET}/{key}", "--remote", "--file", str(path), "--content-type", mime)


def file_bytes(client, file_id):
    response = client.files.content(file_id)
    return response.read() if hasattr(response, "read") else response.content


def report(batch_id, items):
    pending_items = [item for item in items if item.get("status") == "pending_review" and item.get("generated_url")]
    pending_numbers = ",".join(str(item["item_number"]) for item in pending_items)
    published_count = sum(1 for item in items if item.get("status") == "published")
    failed_count = sum(1 for item in items if item.get("status") == "failed")
    sections = []
    for item in items:
        old = SITE + item["original_url"]
        new = SITE + item["generated_url"] if item.get("generated_url") else ""
        new_html = f'<a href="{html.escape(new, quote=True)}"><img src="{html.escape(new, quote=True)}"></a>' if new else f'<p>{html.escape(item.get("error") or "لا توجد نتيجة")}</p>'
        selector = (
            f'<label class="reviewSelect"><input class="reviewChoice" type="checkbox" value="{item["item_number"]}" checked> اختيار هذا المنتج للنشر</label>'
            if item.get("status") == "pending_review" and new else ""
        )
        sections.append(
            f'<section><h2>رقم المنتج {item["item_number"]} · {html.escape(item["product_name"])}</h2>'
            f'<p class="status">الحالة: {html.escape(item["status"])}</p>{selector}<div class="pair">'
            f'<div><b>القديمة</b><a href="{html.escape(old, quote=True)}"><img src="{html.escape(old, quote=True)}"></a></div>'
            f'<div><b>الجديدة</b>{new_html}</div></div></section>'
        )
    review_box = (
        f'<div class="reviewBox"><h2>صور تحتاج مراجعتك: {len(pending_items)}</h2>'
        f'<p>راجع الصور، أزل الاختيار عن أي صورة لا تريد نشرها، ثم انسخ أرقام المنتجات المحددة.</p>'
        f'<textarea id="pendingNumbers" readonly>{pending_numbers}</textarea>'
        f'<div class="reviewActions"><button type="button" onclick="copyAll()">نسخ جميع الأرقام</button>'
        f'<button type="button" onclick="copySelected()">نسخ أرقام المحدد فقط</button></div>'
        f'<strong id="copyMessage"></strong></div>'
        if pending_items else '<div class="reviewBox"><h2>لا توجد صور معلقة للمراجعة</h2></div>'
    )
    page = f'''<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>تقرير Batch {html.escape(batch_id)}</title><style>body{{font:16px system-ui;max-width:1200px;margin:auto;padding:20px;background:#f5f2ed}}section,.reviewBox{{background:white;padding:16px;margin:18px 0;border-radius:12px}}.summary{{display:flex;gap:10px;flex-wrap:wrap}}.summary b{{background:#eee8df;border-radius:20px;padding:8px 13px}}.pair{{display:grid;grid-template-columns:1fr 1fr;gap:12px}}img{{width:100%;height:430px;object-fit:contain;background:#eee}}.status{{font-weight:700}}.reviewBox{{border:2px solid #b85f7d}}.reviewBox textarea{{direction:ltr;width:100%;min-height:90px;padding:12px;border:1px solid #ccc;border-radius:8px;box-sizing:border-box}}.reviewActions{{display:flex;gap:10px;margin-top:10px;flex-wrap:wrap}}.reviewActions button{{cursor:pointer;background:#b85f7d;color:white;border:0;border-radius:8px;padding:11px 16px;font-weight:700}}.reviewSelect{{display:flex;align-items:center;gap:8px;background:#fff4f8;border-radius:8px;padding:10px;margin:8px 0}}.reviewSelect input{{width:20px;height:20px}}#copyMessage{{display:block;color:#27734b;margin-top:8px}}@media(max-width:650px){{.pair{{grid-template-columns:1fr}}img{{height:280px}}}}</style>
<h1>تقرير معالجة صور المنتجات</h1><div class="summary"><b>المجموع: {len(items)}</b><b>رُفعت تلقائياً: {published_count}</b><b>تحتاج مراجعة: {len(pending_items)}</b><b>فشلت: {failed_count}</b></div>
<p>الصور التي تحتاج مراجعة محفوظة وجاهزة للنشر دون إعادة معالجة أو تكلفة API جديدة.</p>{review_box}{''.join(sections)}
<script>
function copyValue(value){{const message=document.getElementById('copyMessage');if(!value){{message.textContent='لم تحدد أي منتج';return}}navigator.clipboard.writeText(value).then(()=>message.textContent='تم نسخ الأرقام').catch(()=>{{const box=document.getElementById('pendingNumbers');box.value=value;box.select();document.execCommand('copy');message.textContent='تم نسخ الأرقام'}})}}
function copyAll(){{copyValue(document.getElementById('pendingNumbers').value)}}
function copySelected(){{copyValue([...document.querySelectorAll('.reviewChoice:checked')].map(input=>input.value).join(','))}}
</script></html>'''
    path = ROOT / f"{batch_id}.html"
    path.write_text(page, encoding="utf-8")
    key = f"reports/batch-v2/{batch_id}.html"
    r2_put(key, path, "text/html; charset=utf-8")
    return "/media/" + key

def process_batch(client, job):
    batch = client.batches.retrieve(job["openai_batch_id"])
    now = "CAST(strftime('%s','now') AS INTEGER)*1000"
    if batch.status not in {"completed", "failed", "expired", "cancelled"}:
        query(f"UPDATE image_ai_batches SET status={q(batch.status)},updated_at={now} WHERE id={q(job['id'])}")
        print(f"{batch.id}: {batch.status}", flush=True)
        return

    items = query(f"SELECT * FROM image_ai_items WHERE batch_id={q(job['id'])} ORDER BY item_number")["results"]
    by_media = {str(item["media_id"]): item for item in items}
    records = []
    for file_id in (batch.output_file_id, batch.error_file_id):
        if file_id:
            records.extend(json.loads(line) for line in file_bytes(client, file_id).decode("utf-8").splitlines() if line.strip())

    statements = []
    for record in records:
        custom_id = record.get("custom_id", "")
        media_id = custom_id.removeprefix("media-")
        item = by_media.get(media_id)
        if not item:
            continue
        response = record.get("response", {})
        body = response.get("body", {})
        encoded = body.get("data", [{}])[0].get("b64_json") if response.get("status_code") == 200 else None
        if not encoded:
            error = record.get("error") or body.get("error") or response
            item["status"] = "failed"
            item["error"] = json.dumps(error, ensure_ascii=False)[:1200]
            statements.append(
                f"UPDATE image_ai_items SET status='failed',error={q(item['error'])},updated_at={now} WHERE batch_id={q(job['id'])} AND media_id={item['media_id']};"
            )
            continue
        data = base64.b64decode(encoded)
        if data[:4] != b"RIFF" or data[8:12] != b"WEBP" or len(data) < 10000:
            item["status"], item["error"] = "failed", "Invalid generated WebP"
            statements.append(
                f"UPDATE image_ai_items SET status='failed',error='Invalid generated WebP',updated_at={now} WHERE batch_id={q(job['id'])} AND media_id={item['media_id']};"
            )
            continue
        path = ROOT / f"product-{item['product_id']}-media-{item['media_id']}.webp"
        path.write_bytes(data)
        key = f"edited/batch-v2/product-{item['product_id']}-media-{item['media_id']}.webp"
        r2_put(key, path, "image/webp")
        new_url = "/media/" + key
        risk = int(any(word in item["product_name"] for word in RISK_WORDS))
        status = "pending_review" if risk else "published"
        usage = json.dumps(body.get("usage"), ensure_ascii=False)
        if status == "published":
            changed = query(
                "UPDATE product_media SET url=" + q(new_url) + ",updated_at=" + now +
                f" WHERE id={item['media_id']} AND product_id={item['product_id']} AND url=" + q(item["original_url"])
            ).get("meta", {}).get("changes")
            if changed != 1:
                status = "pending_review"
                item["error"] = "Product image changed since submission; generated image was staged only"
        item["generated_url"], item["status"], item["risk"] = new_url, status, risk
        statements.append(
            f"UPDATE image_ai_items SET generated_url={q(new_url)},status={q(status)},risk={risk},error={q(item.get('error'))},usage_json={q(usage)},updated_at={now} WHERE batch_id={q(job['id'])} AND media_id={item['media_id']};"
        )

    for item in items:
        if item["status"] == "submitted":
            item["status"] = "failed"
            item["error"] = "No result record returned by OpenAI"
            statements.append(
                f"UPDATE image_ai_items SET status='failed',error='No result record returned by OpenAI',updated_at={now} WHERE batch_id={q(job['id'])} AND media_id={item['media_id']};"
            )
    if statements:
        execute_file("\n".join(statements))
    report_url = report(job["id"], items)
    final_status = "completed" if batch.status == "completed" else batch.status
    query(f"UPDATE image_ai_batches SET status={q(final_status)},report_url={q(report_url)},updated_at={now} WHERE id={q(job['id'])}")
    print(f"{batch.id}: collected {len(items)} items; report {SITE + report_url}", flush=True)


def main():
    ensure_tables()
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"], max_retries=3, timeout=240)
    jobs = query("SELECT * FROM image_ai_batches WHERE status IN ('validating','in_progress','finalizing','submitted') ORDER BY created_at LIMIT 10")["results"]
    if not jobs:
        print("No pending image batches", flush=True)
        return
    for job in jobs:
        try:
            process_batch(client, job)
        except Exception as error:
            print(f"Collector error for {job['id']}: {error}", flush=True)


if __name__ == "__main__":
    main()
