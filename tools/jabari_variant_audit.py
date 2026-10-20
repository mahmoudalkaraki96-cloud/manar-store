"""Resumable, conservative Jabari variant audit. Standard library only; no AI.

Adds missing verified supplier options with the established Jabari markup.
Existing product and variant prices are never updated. Never writes media,
publishing flags, or stock of existing records. Never removes local options.
"""
import argparse
import csv
import html
import hashlib
import json
import os
import re
import time
import uuid
from datetime import datetime
from decimal import Decimal
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, build_opener, HTTPRedirectHandler
from zoneinfo import ZoneInfo

DB_ID = '4afe4c16-e513-43ac-a397-26fa4141e5c9'
SCHEMA = """
CREATE TABLE IF NOT EXISTS jabari_variant_audit (
 source_id INTEGER NOT NULL, mode TEXT NOT NULL, product_id INTEGER NOT NULL,
 status TEXT NOT NULL, detail TEXT NOT NULL, token TEXT NOT NULL,
 updated_at INTEGER NOT NULL, PRIMARY KEY(source_id,mode));
CREATE TABLE IF NOT EXISTS jabari_variant_audit_lock (
 id INTEGER PRIMARY KEY CHECK(id=1),token TEXT NOT NULL,expires_at INTEGER NOT NULL);
INSERT OR IGNORE INTO jabari_variant_audit_lock VALUES(1,'',0);
"""


def norm(s):
    s=str(s).translate(str.maketrans('٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹أإآ','01234567890123456789ااا'))
    s=re.sub(r'[\u064b-\u065f\u200e\u200f]', '', s).replace('ـ','')
    s=re.sub(r'(\d+)\s*حبات',r'\1 حبة',s)
    s=re.sub(r'(\d+)\s*قطع(?!ة)',r'\1 قطعة',s)
    return re.sub(r'\s+', ' ', s).strip()


def money(s):
    if not re.fullmatch(r'\d+(?:\.\d{1,2})?', s):
        raise ValueError('unsupported_price')
    n = int(Decimal(s) * 100)
    if not 0 < n < 100000000:
        raise ValueError('invalid_price')
    return n


class Node:
    def __init__(self, tag='', attrs=(), parent=None):
        self.tag, self.a, self.parent = tag, dict(attrs), parent
        self.children, self.texts = [], []

    def text(self):
        return norm(' '.join(self.texts + [n.text() for n in self.children]))

    def all(self):
        yield self
        for n in self.children:
            yield from n.all()


class HTML(HTMLParser):
    VOID = {'input', 'img', 'br', 'hr', 'meta', 'link', 'source', 'wbr', 'area', 'embed'}

    def __init__(self, data):
        super().__init__(convert_charrefs=True)
        self.root = self.current = Node()
        self.feed(data)

    def handle_starttag(self, tag, attrs):
        n = Node(tag, attrs, self.current)
        self.current.children.append(n)
        if tag not in self.VOID:
            self.current = n

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in self.VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        n = self.current
        while n.parent:
            if n.tag == tag:
                self.current = n.parent
                return
            n = n.parent

    def handle_data(self, data):
        if self.current.tag not in ('script', 'style'):
            self.current.texts.append(data)


class SupplierBlocked(RuntimeError):
    pass


class SupplierMissing(RuntimeError):
    pass


def original_simple_price(root):
    prices = [n for n in root.all() if 'price' in n.a.get('class', '').split()]
    if len(prices) != 1:
        raise ValueError('simple_price_not_verified')
    node = prices[0]
    originals = [n for n in node.all() if n.tag in ('del', 's')]
    def amount(text):
        text = text.replace('₪', '').strip()
        if not re.fullmatch(r'\d+(?:\.\d{1,2})?', text):
            raise ValueError('simple_price_not_verified')
        return money(text)
    if not originals:
        return amount(node.text())
    if len(originals) != 1:
        raise ValueError('simple_price_not_verified')
    original = amount(originals[0].text())
    def current(n):
        if n.tag in ('del', 's'):
            return ''
        return norm(' '.join(n.texts + [current(c) for c in n.children]))
    discounted = amount(current(node))
    if discounted >= original:
        raise ValueError('simple_price_not_verified')
    return original


def parse_product(data, source_id):
    if 'الصفحة المطلوبة غير متوفرة' in data:
        raise SupplierMissing('supplier_404')
    if re.search(r'cf-chl-|captcha|access denied|too many requests|temporarily blocked|403 Forbidden', data, re.I):
        raise SupplierBlocked('supplier_block_page')
    tree = HTML(data).root
    roots = [n for n in tree.all() if n.a.get('id') == 'this-is-product' or 'this-is-product' in n.a.get('class', '').split()]
    if len(roots) != 1:
        raise ValueError('product_container_not_verified')
    root = roots[0]
    titles = list(dict.fromkeys(n.text() for n in root.all() if n.tag == 'h1'))
    # Product number is displayed outside the main form. Never trust URL alone.
    if len(titles) != 1 or not re.search(r'رقم المنتج\s+' + str(source_id) + r'(?!\d)', tree.text()):
        raise ValueError('source_identity_not_verified')
    inputs = [n for n in root.all() if n.tag in ('input', 'textarea', 'select')]
    custom = [n for n in inputs if n.tag in ('textarea', 'select') or n.a.get('type', 'text') in ('text', 'email', 'file')]
    qty = [n for n in inputs if n.a.get('id') == 'quantity']
    minimum = max([int(n.a.get('min', '1')) for n in qty] or [1])
    radios = [n for n in inputs if n.a.get('type') == 'radio']
    result = {'title': titles[0], 'variants': [], 'custom_fields': bool(custom), 'minimum': minimum}
    if not radios:
        result['simple_price'] = original_simple_price(root)
        return result
    ids = {n.a.get('id'): n for n in radios}
    if len(ids) != len(radios) or None in ids:
        raise ValueError('duplicate_radio_id')
    for n in radios:
        a = n.a
        script = a.get('onclick', '')
        price = re.search(r"changePrice\(\s*['\"](\d+(?:\.\d{1,2})?)['\"]\s*,\s*['\"]([^'\"]*)['\"]\s*\)", script)
        if not price:
            if not re.fullmatch(r'c\d+', a.get('id', '')) or not any(k.startswith(a['id'] + 's') for k in ids):
                raise ValueError('radio_price_not_verified')
            continue
        label = norm(a.get('value', ''))
        parent_id = re.fullmatch(r'(c\d+)s\d+', a['id'])
        if parent_id:
            if parent_id[1] not in ids:
                raise ValueError('missing_parent_choice')
            label = norm(ids[parent_id[1]].a.get('value', '')) + ' / ' + label
        elif not re.fullmatch(r'[sc]\d+', a['id']):
            raise ValueError('unsupported_choice_structure')
        if not label or len(label) > 180:
            raise ValueError('invalid_choice_label')
        disabled = 'disabled' in a or a.get('aria-disabled') == 'true'
        if parent_id:
            disabled = disabled or 'disabled' in ids[parent_id[1]].a
        result['variants'].append({'name': label, 'price': money(price[2] or price[1]), 'active': not disabled})
    names = [v['name'] for v in result['variants']]
    if not names or len(names) != len(set(names)) or len(names) > 100:
        raise ValueError('ambiguous_choices')
    return result


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def fetch_product(source_id):
    req = Request(f'https://jabaristore.com/?app=product.show.{source_id}', headers={
        'User-Agent': 'ManarVariantAudit/1.0 (+https://manarstore.ps)', 'Accept': 'text/html'})
    try:
        with build_opener(NoRedirect()).open(req, timeout=35) as response:
            if 'text/html' not in response.headers.get('Content-Type', ''):
                raise ValueError('supplier_content_type')
            data = response.read(1500001)
        if len(data) > 1500000:
            raise ValueError('supplier_response_too_large')
        return data.decode('utf-8', errors='strict')
    except HTTPError as e:
        if e.code == 404:
            raise SupplierMissing('supplier_404') from None
        if e.code in (403, 429):
            raise SupplierBlocked(f'HTTP_{e.code}') from None
        raise RuntimeError(f'supplier_HTTP_{e.code}') from None


class D1:
    def __init__(self):
        self.token = os.environ['CLOUDFLARE_API_TOKEN']
        self.account = os.environ.get('CLOUDFLARE_ACCOUNT_ID')
        if not self.account:
            accounts = self.request('accounts')['result']
            if len(accounts) != 1:
                raise RuntimeError('Set CLOUDFLARE_ACCOUNT_ID explicitly')
            self.account = accounts[0]['id']

    def request(self, path, payload=None):
        req = Request('https://api.cloudflare.com/client/v4/' + path,
                      data=None if payload is None else json.dumps(payload).encode(),
                      headers={'Authorization': 'Bearer ' + self.token, 'Content-Type': 'application/json'})
        try:
            with build_opener(NoRedirect()).open(req, timeout=90) as response:
                result = json.load(response)
        except HTTPError as e:
            raise RuntimeError(f'cloudflare_HTTP_{e.code}') from None
        if not result.get('success'):
            raise RuntimeError('cloudflare_request_failed')
        return result

    def batch(self, statements):
        result = self.request(f'accounts/{self.account}/d1/database/{DB_ID}/query',
                              {'batch': [{'sql': sql, 'params': params} for sql, params in statements]})['result']
        if not all(r.get('success') for r in result):
            raise RuntimeError('d1_batch_failed')
        return result

    def query(self, sql, params=()):
        return self.batch([(sql, list(params))])[0]['results']


def snapshot(db, product_id):
    p = db.query('SELECT id,item_number,name,price_agorot,active,updated_at,deleted_at FROM products WHERE id=?', [product_id])[0]
    p['variants'] = db.query('SELECT v.id,v.sku,v.price_agorot,v.active,v.stock_quantity,group_concat(ov.value,\' / \') AS name FROM product_variants v LEFT JOIN variant_option_values vv ON vv.variant_id=v.id LEFT JOIN product_option_values ov ON ov.id=vv.option_value_id WHERE v.product_id=? GROUP BY v.id ORDER BY v.id', [product_id])
    p['options'] = db.query('SELECT id FROM product_options WHERE product_id=?', [product_id])
    p['custom'] = db.query('SELECT id FROM product_custom_fields WHERE product_id=?', [product_id])
    p['media'] = db.query('SELECT id,url,variant_id,sort_order,is_primary FROM product_media WHERE product_id=? ORDER BY id', [product_id])
    return p


def sale_price(cost):
    """Exact import rule in worker/supplier-import.ts; amounts are agorot."""
    return cost + (50 if cost <= 500 else 100 if cost <= 1000 else
                   150 if cost <= 3000 else 200 if cost <= 7000 else
                   500 if cost <= 10000 else 1000)


def decide(p, source):
    if p['deleted_at'] is not None:
        return 'unsupported_deleted_product'
    if source['custom_fields'] or source['minimum'] > 1 or p['custom']:
        return 'unsupported_customization_or_minimum'
    expected = source['variants']
    if not expected:
        if p['variants'] or p['options']:
            return 'unsupported_supplier_removed_options'
        return 'no_options'
    if len(p['options']) > 1 or (p['variants'] and not p['options']):
        return 'unsupported_local_option_structure'
    names = [norm(v['name']) for v in p['variants']]
    if len(names) != len(set(names)):
        return 'unsupported_duplicate_local_names'
    if all(v['name'] in names for v in expected):
        return 'matched'
    return 'ready'


def save_result(db, source_id, mode, p, status, detail, token):
    detail.setdefault('item_number',p.get('item_number'))
    db.query("INSERT INTO jabari_variant_audit VALUES(?,?,?,?,?,?,?) ON CONFLICT(source_id,mode) DO UPDATE SET status=CASE WHEN jabari_variant_audit.status='synced' THEN 'synced_verification_error' ELSE excluded.status END,detail=CASE WHEN jabari_variant_audit.status='synced' THEN json_set(jabari_variant_audit.detail,'$.verification_error',json(excluded.detail)) ELSE excluded.detail END,token=excluded.token,updated_at=excluded.updated_at",
             [source_id, mode, p['id'], status, json.dumps(detail, ensure_ascii=False), token, int(time.time()*1000)])


def apply_variants(db, source_id, p, source, token, stock):
    """One transactional D1 batch with a snapshot guard and durable completion row."""
    now = int(time.time()*1000)
    old_by_name = {norm(v['name']):v for v in p['variants']}
    added = [dict(v, supplier_price=v['price'], price=sale_price(v['price']))
             for v in source['variants'] if v['name'] not in old_by_name]
    if not added:
        raise ValueError('no_missing_variants')
    after_source = dict(source, variants=[
        {'name':v['name'], 'price':v['price_agorot'], 'active':bool(v['active'])}
        for v in p['variants']
    ] + added)
    detail = json.dumps({'item_number': p['item_number'], 'name':p['name'], 'before_price':p['price_agorot'], 'before_variants':p['variants'], 'source':after_source, 'supplier_source':source, 'added_variants':added, 'prices_preserved':True,
                         'store_url':f"https://manarstore.ps/product/{p['id']}", 'source_url':f'https://jabaristore.com/?app=product.show.{source_id}'}, ensure_ascii=False)
    guard = '''INSERT INTO jabari_variant_audit(source_id,mode,product_id,status,detail,token,updated_at)
      SELECT ?,'apply',p.id,'synced',?,?,? FROM products p WHERE p.id=? AND p.updated_at=?
      AND p.price_agorot=? AND p.active=? AND p.deleted_at IS NULL
      AND EXISTS(SELECT 1 FROM product_keywords k WHERE k.product_id=p.id AND k.keyword=?)
      AND (SELECT COUNT(*) FROM product_variants WHERE product_id=p.id)=?
      AND (SELECT COUNT(*) FROM product_options WHERE product_id=p.id)=?
      AND NOT EXISTS(SELECT 1 FROM product_custom_fields WHERE product_id=p.id)
      AND EXISTS(SELECT 1 FROM jabari_variant_audit_lock WHERE id=1 AND token=? AND expires_at>?)'''
    statements = [(guard, [source_id, detail, token, now, p['id'], p['updated_at'], p['price_agorot'], p['active'], f'jabari-{source_id}',len(p['variants']),len(p['options']),token,now])]
    gate = 'EXISTS(SELECT 1 FROM jabari_variant_audit WHERE source_id=? AND mode=\'apply\' AND token=?)'
    if source['variants'] and not p['options']:
        statements.append((f"INSERT INTO product_options(product_id,name,display_type,sort_order) SELECT ?,'الخيار','text',0 WHERE {gate}", [p['id'], source_id, token]))
    existing = {norm(v['name']):v for v in p['variants']}
    for i, v in enumerate(added):
        sku = f"jabari-audit-{source_id}-{hashlib.sha256(v['name'].encode()).hexdigest()[:16]}"
        statements.append((f'INSERT INTO product_option_values(option_id,value,color_hex,sort_order) SELECT id,?,NULL,? FROM product_options WHERE product_id=? AND {gate}', [v['name'], len(existing)+i, p['id'], source_id, token]))
        statements.append((f'INSERT INTO product_variants(product_id,sku,price_agorot,wholesale_price_agorot,stock_quantity,active,created_at,updated_at) SELECT ?,?,?,NULL,?,?,?,? WHERE {gate}', [p['id'], sku, v['price'], stock if v['active'] and p['active'] else 0,int(v['active']),now,now,source_id,token]))
        statements.append((f'INSERT INTO variant_option_values(variant_id,option_value_id) SELECT v.id,ov.id FROM product_variants v JOIN product_options o ON o.product_id=v.product_id JOIN product_option_values ov ON ov.option_id=o.id WHERE v.sku=? AND ov.value=? AND {gate}', [sku,v['name'],source_id,token]))
    statements.append((f'UPDATE products SET updated_at=? WHERE id=? AND {gate}',[now,p['id'],source_id,token]))
    results = db.batch(statements)
    if results[0]['meta'].get('changes') != 1:
        raise RuntimeError('product_changed_before_apply')
    after = snapshot(db, p['id'])
    if after['media'] != p['media'] or any(after[k] != p[k] for k in ('active', 'name', 'price_agorot')):
        raise RuntimeError('post_apply_product_changed')
    prior = {v['id']:v for v in p['variants']}
    if any(v != prior[v['id']] for v in after['variants'] if v['id'] in prior):
        raise RuntimeError('existing_variant_changed')
    if decide(after, source) not in ('matched','no_options'):
        raise RuntimeError('post_apply_variants_not_verified')


def report(db, folder, mode, status, current_token=None, progress_file=Path('STORE-PROGRESS.md'), processed_count=None):
    rows = db.query('SELECT source_id,mode,product_id,status,detail,updated_at,token FROM jabari_variant_audit ORDER BY source_id DESC,mode')
    current_rows=[r.copy() for r in rows if r['token']==current_token]
    for r in rows:
        r.pop('token',None)
    data = {'updated_at': datetime.now(ZoneInfo('Asia/Hebron')).isoformat(), 'run_mode': mode, 'run_status': status, 'run_processed':processed_count if processed_count is not None else len(current_rows), 'results': rows}
    folder.mkdir(parents=True, exist_ok=True)
    (folder/'latest.json').write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    counts = {}
    for row in rows:
        if row['mode'] == mode:
            counts[row['status']] = counts.get(row['status'], 0)+1
    text = f"## Jabari variant audit\n- Time: {data['updated_at']}\n- Mode: {mode}\n- Status: {status}\n- Counts: {json.dumps(counts)}\n- Per-product results: docs/jabari-variant-audit/latest.json\n"
    (folder/'summary.md').write_text(text, encoding='utf-8')
    changed=[]
    for row in rows:
        if row['mode']=='apply' and row['status'].startswith('synced'):
            d=json.loads(row['detail'])
            changed.append({'source_id':row['source_id'],'item_number':d['item_number'],'name':d['name'],
                            'before':json.dumps({'price':d['before_price'],'variants':d['before_variants']},ensure_ascii=False),
                            'after':json.dumps(d['source'],ensure_ascii=False),
                            'store_url':d['store_url'],'source_url':d['source_url'],'method':'script'})
    progress=progress_file
    historical=progress.read_text(encoding='utf-8') if progress.exists() else ''
    start=historical.find('— JABARI-VARIANT-AUDIT')
    for paragraph in []:
        paragraph=paragraph.strip().split('\n- ')[0]
        if not paragraph.startswith('- تحديث') or not re.search(r'أ[\u064b-\u065f]*ضيف',paragraph):
            continue
        sid=re.search(r'الجعبري\s*#(\d+)',paragraph)
        if not sid:
            sid=re.search(r'jabari-(\d+)|product\.show\.(\d+)',paragraph)
        item=re.search(r'(?:المنتج|الصنف)(?:\s+الموجود)?\s*#(\d+)',paragraph)
        if not sid or not item:
            continue
        source_id=int(next(g for g in sid.groups() if g is not None))
        if any(c['source_id']==source_id for c in changed):
            continue
        links=re.findall(r'https://manarstore\.ps/product/\d+',paragraph)
        changed.append({'source_id':source_id,'item_number':int(item[1]),'name':'تعديل يدوي موثق سابقًا',
                        'before':'انظر سجل التنفيذ','after':paragraph.strip(),'store_url':links[0] if links else '',
                        'source_url':f'https://jabaristore.com/?app=product.show.{source_id}','method':'manual_log'})
    fields=['source_id','item_number','name','before','after','store_url','source_url','method']
    with (folder/'changed-products.csv').open('w',encoding='utf-8-sig',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=fields);writer.writeheader();writer.writerows(changed)
    def human(c, key):
        if c['method']=='script' and key in ('before','after'):
            value=json.loads(c[key])
            lines=[]
            if key=='before':
                lines.append(f"السعر الأساسي: {value['price']/100:g} ₪")
                lines.extend(f"{v['name']}: {(v['price_agorot'] or 0)/100:g} ₪" for v in value['variants'])
            else:
                lines.extend(f"{v['name']}: {v['price']/100:g} ₪"+(' (غير متاح)' if not v['active'] else '') for v in value['variants'])
                if not value['variants']:
                    lines.append(f"{value['simple_price']/100:g} ₪")
            return html.escape('\n'.join(lines))
        if key.endswith('_url') and c[key]:
            url=html.escape(c[key],quote=True)
            return f'<a href="{url}">فتح المنتج</a>'
        return html.escape(str(c[key]))
    body=''.join('<tr>'+''.join('<td>'+human(c,k)+'</td>' for k in fields)+'</tr>' for c in changed)
    (folder/'changed-products.html').write_text('<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>تقرير تعديلات الجعبري</title><style>body{font:16px Arial;padding:24px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:10px;white-space:pre-wrap;overflow-wrap:anywhere}tr:nth-child(even){background:#fafafa}</style><h1>كل الأصناف المعدّلة من الجعبري</h1><p>'+html.escape(data['updated_at'])+'</p><p>الأسعار المعروضة بالشيكل؛ بيانات CSV التفصيلية بالأغورات (100أغورة=1شيكل). أسعار المنتجات والمتغيرات السابقة محفوظة؛ المتغيرات الجديدة بسعر المورد مع زيادة الربح المعتمدة.</p><table><tr>'+''.join('<th>'+k+'</th>' for k in fields)+'</tr>'+body+'</table></html>',encoding='utf-8')
    if progress.exists():
        with progress.open('a',encoding='utf-8') as f:
            f.write('\n\n### '+data['updated_at']+' — JABARI-VARIANT-BATCH\n'+text+'- تفاصيل كل عملية محفوظة في D1 فور تنفيذها؛ التقرير يشمل قبل/بعد وروابط المصدر والمتجر.\n- تقرير كل الأصناف المعدلة: docs/jabari-variant-audit/changed-products.csv وchanged-products.html، ويشمل التعديلات اليدوية المسجلة.\n')
            # Recover D1 operations whose previous report push failed.
            progress_rows = [r for r in rows if r['mode'] == mode and (
                r in current_rows or
                f"- الجعبري#{r['source_id']} ↔ صنف#{json.loads(r['detail']).get('item_number','?')}: {r['status']}؛" not in historical
            )]
            for row in progress_rows:
                d=json.loads(row['detail']);source=d.get('source',{})
                variants='؛ '.join(f"{v['name']}={v['price']/100:g}₪" for v in source.get('variants',[]))
                f.write(f"- الجعبري#{row['source_id']} ↔ صنف#{d.get('item_number','?')}: {row['status']}؛ {variants or source.get('title',d.get('reason',''))}. https://jabaristore.com/?app=product.show.{row['source_id']}\n")
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as f:
            f.write(text)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--mode', choices=['preview','apply'], default='preview')
    ap.add_argument('--start', type=int, default=999999)
    ap.add_argument('--limit', type=int, default=50)
    ap.add_argument('--delay', type=float, default=10)
    ap.add_argument('--stock', type=int, default=10000)
    ap.add_argument('--report-dir', type=Path, default=Path('docs/jabari-variant-audit'))
    args = ap.parse_args()
    if not (1 <= args.start <= 999999 and 1 <= args.limit <= 200 and 5 <= args.delay <= 300 and 1 <= args.stock <= 10000):
        ap.error('start 1..999999, limit 1..200, delay 5..300, stock 1..10000')
    db, token = D1(), uuid.uuid4().hex
    db.query(SCHEMA)
    now = int(time.time()*1000)
    lease = db.batch([('UPDATE jabari_variant_audit_lock SET token=?,expires_at=? WHERE id=1 AND expires_at<?', [token,now+900000,now])])
    if lease[0]['meta'].get('changes') != 1:
        raise RuntimeError('audit_already_running')
    status, last_request, processed = 'interrupted', 0, 0
    try:
        # Only explicitly linked imported products; ambiguity is reported, never guessed.
        rows = db.query("SELECT CAST(substr(k.keyword,8) AS INTEGER) AS source_id,p.id FROM product_keywords k JOIN products p ON p.id=k.product_id WHERE k.keyword GLOB 'jabari-[0-9]*' AND p.deleted_at IS NULL ORDER BY source_id DESC")
        groups = {}
        for row in rows:
            sid = row['source_id']
            if 1 <= sid <= args.start:
                groups.setdefault(sid, []).append(row['id'])
        done = {r['source_id'] for r in db.query('SELECT source_id FROM jabari_variant_audit WHERE mode=? AND status NOT IN (\'blocked\',\'error\',\'unsupported_source_price\')', [args.mode])}
        selected = [sid for sid in groups if sid not in done][:args.limit]
        for sid in selected:
            processed+=1
            renewal=db.batch([('UPDATE jabari_variant_audit_lock SET expires_at=? WHERE id=1 AND token=?',[int(time.time()*1000)+900000,token])])
            if renewal[0]['meta'].get('changes')!=1:
                raise RuntimeError('audit_lease_lost')
            if len(set(groups[sid])) != 1:
                p = {'id':groups[sid][0]}
                save_result(db,sid,args.mode,p,'unsupported_duplicate_mapping',{},token)
                continue
            p = snapshot(db, groups[sid][0])
            wait = args.delay - (time.monotonic()-last_request)
            if wait > 0:
                time.sleep(wait)
            last_request = time.monotonic()
            try:
                try:
                    source = parse_product(fetch_product(sid),sid)
                except ValueError as e:
                    if str(e) not in ('invalid_price', 'unsupported_price', 'simple_price_not_verified'):
                        raise
                    save_result(db,sid,args.mode,p,'unsupported_source_price',{'reason':str(e)},token)
                    print(f"source={sid} item={p['item_number']} status=unsupported_source_price",flush=True)
                    continue
                decision = decide(p,source)
                if decision == 'ready' and args.mode == 'apply':
                    # Remove only a previous failure record, never a completed record.
                    db.query("DELETE FROM jabari_variant_audit WHERE source_id=? AND mode='apply' AND status IN ('blocked','error','unsupported_source_price')", [sid])
                    apply_variants(db,sid,p,source,token,args.stock)
                    decision = 'synced'
                else:
                    save_result(db,sid,args.mode,p,decision,{'item_number':p['item_number'],'source':source,'missing_variants':[dict(v,price=sale_price(v['price']),supplier_price=v['price']) for v in source['variants'] if v['name'] not in {norm(x['name']) for x in p['variants']}],'prices_preserved':True},token)
                print(f"source={sid} item={p['item_number']} status={decision}",flush=True)
            except SupplierMissing as e:
                save_result(db,sid,args.mode,p,'missing_source',{'reason':str(e)},token)
                print(f"source={sid} item={p['item_number']} status=missing_source",flush=True)
            except SupplierBlocked as e:
                save_result(db,sid,args.mode,p,'blocked',{'reason':str(e)},token)
                status='paused_blocked'
                break
            except Exception as e:
                # No retries after a response, parsing, apply, or connection failure.
                save_result(db,sid,args.mode,p,'error',{'reason':str(e)[:120] if isinstance(e,(ValueError,RuntimeError)) else type(e).__name__},token)
                status='paused_error'
                break
        else:
            status='completed_batch'
    finally:
        try:
            report(db,args.report_dir,args.mode,status,token,processed_count=processed)
        finally:
            db.query('UPDATE jabari_variant_audit_lock SET expires_at=0 WHERE id=1 AND token=?',[token])
    if status=='paused_error':
        raise SystemExit(1)


if __name__ == '__main__':
    main()


