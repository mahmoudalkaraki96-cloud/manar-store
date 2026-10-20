"""Read-only comparison of Dofesh's public catalog with Manar source mappings."""
import argparse
import csv
import html
import json
import re
import time
from datetime import datetime
from pathlib import Path
from urllib.request import Request, build_opener
from urllib.error import HTTPError
from zoneinfo import ZoneInfo
from dofesh_variant_audit import D1, HTML, NoRedirect, norm, SupplierBlocked

ORIGIN='https://dofesh.ps'
FOLDER=Path('docs/dofesh-missing-products')

class ReadOnlyD1(D1):
    def query(self, sql, params=()):
        if not sql.lstrip().upper().startswith('SELECT '):
            raise ValueError('read_only_database')
        return super().query(sql,params)

def clean_text(node):
    if node.tag in ('del','s','script','style'):
        return ''
    return norm(' '.join(node.texts+[clean_text(c) for c in node.children]))

def unpack(data):
    if data.lstrip().startswith(('{','[')):
        parts=[]
        def visit(v):
            if isinstance(v,str) and '<' in v:parts.append(v)
            elif isinstance(v,dict):
                for x in v.values():visit(x)
            elif isinstance(v,list):
                for x in v:visit(x)
        visit(json.loads(data))
        data='\n'.join(parts)
    if re.search(r'cf-chl-|captcha|access denied|too many requests|403 Forbidden',data,re.I):
        raise SupplierBlocked('supplier_blocked')
    return data

def listing(data,page):
    tree=HTML(unpack(data)).root
    cards={}
    for n in tree.all():
        m=re.fullmatch(r'link-(\d+)',n.a.get('id','')) if n.tag=='a' else None
        if not m:continue
        names=[c.text() for c in n.all() if c.tag=='h2']
        prices=[clean_text(c) for c in n.all() if 'price' in c.a.get('class','').split()]
        if len(names)!=1 or len(prices)!=1 or not prices[0]:
            raise ValueError('listing_card_not_verified')
        sid=int(m[1])
        cards[sid]={'source_id':sid,'name':names[0],'price':prices[0],
                    'source_url':f'{ORIGIN}/?app=product.show.{sid}'}
    if not cards:raise ValueError('empty_catalog_page_not_verified')
    nexts=[n for n in tree.all() if n.tag=='a' and 'pages-next-box' in n.a.get('class','').split()]
    if len(nexts)>1:raise ValueError('ambiguous_next_page')
    next_page=None
    if nexts:
        m=re.search(r'\?app=product\.all\.\.(\d+)',nexts[0].a.get('href',''))
        if not m or int(m[1])!=page+1:raise ValueError('next_page_not_verified')
        next_page=int(m[1])
    return list(cards.values()),next_page

def availability(data,sid):
    tree=HTML(unpack(data)).root
    roots=[n for n in tree.all() if n.a.get('id')=='this-is-product']
    if len(roots)!=1 or not re.search(r'رقم المنتج\s+'+str(sid)+r'(?!\d)',tree.text()):
        raise ValueError('source_identity_not_verified')
    root=roots[0]
    title=list(dict.fromkeys(n.text() for n in root.all() if n.tag=='h1'))
    if len(title)!=1:raise ValueError('product_title_not_verified')
    radios=[n for n in root.all() if n.tag=='input' and n.a.get('type')=='radio']
    buy=[n for n in root.all() if n.a.get('id')=='addToCart']
    disabled=lambda n:'disabled' in n.a or n.a.get('aria-disabled')=='true'
    if 'هذا المنتج لم يعد متوفر' in root.text() or (radios and all(disabled(n) for n in radios)):
        result='unavailable'
    elif len(buy)==1 and not disabled(buy[0]):
        result='available'
    else:result='unknown'
    return {'availability':result,'verified_title':title[0],
            'verified_at':datetime.now(ZoneInfo('Asia/Hebron')).isoformat()}

def local_catalog(db):
    products=db.query('SELECT id,item_number,name,slug,active FROM products WHERE deleted_at IS NULL')
    by_id={p['id']:p for p in products}
    links={}
    def add(sid,pid):
        if pid in by_id:links.setdefault(sid,set()).add(pid)
    for p in products:
        m=re.fullmatch(r'supplier-dofesh-(\d+)',p['slug'] or '')
        if m:add(int(m[1]),p['id'])
    for r in db.query("SELECT product_id,keyword FROM product_keywords WHERE keyword GLOB 'dofesh-[0-9]*'"):
        m=re.fullmatch(r'dofesh-(\d+)',r['keyword'])
        if m:add(int(m[1]),r['product_id'])
    for r in db.query('SELECT ps.product_id,ps.source_product_id,ps.source_url FROM product_suppliers ps JOIN suppliers s ON s.id=ps.supplier_id WHERE s.supplier_number=9101'):
        sid=str(r['source_product_id'] or '')
        if sid.isdigit():add(int(sid),r['product_id'])
        m=re.search(r'https://(?:www\.)?dofesh\.ps/\?app=product\.show\.(\d+)(?:$|&)',r['source_url'] or '')
        if m:add(int(m[1]),r['product_id'])
    names={}
    for p in products:names.setdefault(norm(p['name']),[]).append(p)
    return by_id,links,names

def compare(cards,details,db):
    products,links,names=local_catalog(db)
    rows=[]
    for c in sorted(cards.values(),key=lambda x:x['source_id'],reverse=True):
        sid=c['source_id'];mapped=[products[i] for i in sorted(links.get(sid,[]))]
        possible=[] if mapped else names.get(norm(c['name']),[])
        status='present' if mapped else 'possible_name_match' if possible else 'missing'
        row=dict(c,status=status,availability='not_checked',
                 local_items=','.join(str(p['item_number']) for p in mapped or possible),
                 local_urls=' '.join(f"https://manarstore.ps/product/{p['id']}" for p in mapped or possible),
                 local_publication=','.join('published' if p['active'] else 'draft' for p in mapped or possible))
        row.update(details.get(str(sid),{}))
        rows.append(row)
    return rows

def write_report(state,rows):
    FOLDER.mkdir(parents=True,exist_ok=True)
    now=datetime.now(ZoneInfo('Asia/Hebron')).isoformat()
    counts={key:sum(r['status']==key for r in rows) for key in ('present','missing','possible_name_match')}
    pending=[r for r in rows if r['status']!='present' and r['availability']=='not_checked']
    state.update(updated_at=now,counts=counts,detail_pending=len(pending))
    (FOLDER/'state.json').write_text(json.dumps(state,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    result={k:v for k,v in state.items() if k not in ('cards','details')}
    result['results']=rows
    (FOLDER/'latest.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    candidates=[r for r in rows if r['status']!='present']
    fields=['source_id','name','price','status','availability','source_url','local_items','local_urls','local_publication','verified_at','detail_error']
    with (FOLDER/'missing-products.csv').open('w',encoding='utf-8-sig',newline='') as f:
        writer=csv.DictWriter(f,fields,extrasaction='ignore');writer.writeheader();writer.writerows(candidates)
    labels={'missing':'غير مرتبط بمنتج عندك','possible_name_match':'اسم مطابق عندك يحتاج مطابقة المصدر',
            'available':'متوفر','unavailable':'غير متوفر','unknown':'غير محسوم',
            'not_checked':'لم يفحص التوفر بعد','source_404':'صفحة المصدر غير موجودة'}
    headers={'source_id':'رقم دوفش','name':'المنتج','price':'السعر المعروض','status':'المطابقة','availability':'توفر دوفش','source_url':'رابط دوفش','local_items':'أرقام أصناف محتملة عندك'}
    def cell(row,k):
        v=str(row.get(k,''));v=labels.get(v,v)
        if k=='source_url':return '<a href="'+html.escape(v,quote=True)+'">فتح المنتج</a>'
        return html.escape(v)
    body=''.join('<tr>'+''.join('<td>'+cell(row,k)+'</td>' for k in headers)+'</tr>' for row in candidates)
    summary=f"الحالة: {state['status']}؛ صفحات مفحوصة: {len(state['pages'])}؛ أصناف دوفش: {len(rows)}؛ موجودة عندك: {counts['present']}؛ غير مرتبطة: {counts['missing']}؛ اسم مطابق يحتاج تحقق: {counts['possible_name_match']}؛ توفر لم يفحص: {len(pending)}."
    doc='<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>الأصناف الناقصة من دوفش</title><style>body{font:16px Arial;padding:24px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:9px}tr:nth-child(even){background:#fafafa}</style><h1>مقارنة كتالوج دوفش بمتجرك</h1><p>'+html.escape(summary)+'</p><p>'+html.escape(now)+'</p><p>الفحص للقراءة فقط. يشمل المنتجات المنشورة والمسودات. المطابقة برقم المصدر عبر الكلمات والـslug وروابط المورد؛ تطابق الاسم وحده لا يثبت تطابق الصنف. قد توجد منتجات يدوية بأسماء مختلفة؛ غير مرتبطة تعني عدم العثور على ربط بالمصدر.</p><table><tr>'+''.join('<th>'+v+'</th>' for v in headers.values())+'</tr>'+body+'</table></html>'
    (FOLDER/'missing-products.html').write_text(doc,encoding='utf-8')
    text=f"## DOFESH-MISSING-CATALOG\n- Time: {now}\n- {summary}\n- Next listing page: {state['next_page']}\n- No product/database writes.\n"
    (FOLDER/'summary.md').write_text(text,encoding='utf-8')
    return text

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--requests',type=int,default=25)
    ap.add_argument('--delay',type=float,default=10)
    args=ap.parse_args()
    if not 1<=args.requests<=100 or not 5<=args.delay<=300:ap.error('requests 1..100, delay 5..300')
    path=FOLDER/'state.json'
    state=json.loads(path.read_text(encoding='utf-8')) if path.exists() else {
        'cards':{},'details':{},'pages':[],'next_page':1,'catalog_complete':False}
    state['status']='running'
    db=ReadOnlyD1()
    last=0
    used=0
    def fetch(url):
        nonlocal last,used
        time.sleep(max(0,args.delay-(time.monotonic()-last)))
        last=time.monotonic();used+=1
        req=Request(url,headers={'User-Agent':'ManarCatalogComparison/1.0 (+https://manarstore.ps)','Accept':'text/html'})
        try:
            with build_opener(NoRedirect()).open(req,timeout=35) as response:
                data=response.read(2000001)
                if len(data)>2000000:raise ValueError('response_too_large')
                return data.decode('utf-8')
        except HTTPError as e:
            if e.code in (403,429):raise SupplierBlocked(f'HTTP_{e.code}') from None
            raise
    rows=[]
    try:
        while used<args.requests and not state['catalog_complete']:
            page=state['next_page']
            cards,nxt=listing(fetch(f'{ORIGIN}/?app=product.all..{page}'),page)
            old=set(state['cards'])
            if page in state['pages'] or all(str(c['source_id']) in old for c in cards):
                raise ValueError('repeated_listing_page')
            for c in cards:state['cards'][str(c['source_id'])]=c
            state['pages'].append(page);state['next_page']=nxt
            state['catalog_complete']=nxt is None
            rows=compare(state['cards'],state['details'],db)
            write_report(state,rows)
            print(f'page={page} unique_cards={len(rows)} next={nxt}',flush=True)
        rows=compare(state['cards'],state['details'],db)
        if state['catalog_complete']:
            for row in rows:
                if used>=args.requests:break
                if row['status']=='present' or row['availability']!='not_checked':continue
                sid=row['source_id']
                try:detail=availability(fetch(row['source_url']),sid)
                except HTTPError as e:
                    if e.code!=404:raise
                    detail={'availability':'source_404','detail_error':'HTTP_404'}
                except ValueError as e:
                    detail={'availability':'unknown','detail_error':str(e)}
                state['details'][str(sid)]=detail
                print(f"source={sid} status={row['status']} availability={detail['availability']}",flush=True)
            rows=compare(state['cards'],state['details'],db)
        pending=any(r['status']!='present' and r['availability']=='not_checked' for r in rows)
        state['status']='completed' if state['catalog_complete'] and not pending else 'partial'
    except SupplierBlocked as e:
        state['status']='paused_blocked';state['error']=str(e)
    except Exception as e:
        state['status']='paused_error';state['error']=str(e)[:150]
    finally:
        rows=compare(state['cards'],state['details'],db)
        text=write_report(state,rows)
        state['requests_this_run']=used
        with Path('STORE-PROGRESS.md').open('a',encoding='utf-8') as f:
            f.write('\n\n### '+state['updated_at']+' — DOFESH-MISSING-CATALOG\n'+text+'- التقرير: docs/dofesh-missing-products/missing-products.html وmissing-products.csv؛ لم تُضف أو تُنشر أو تُعدّل منتجات.\n')
        print(text,flush=True)
    if state['status'].startswith('paused'):raise SystemExit(1)

if __name__=='__main__':main()
