"""Weekly supplier availability and new draft import; never replenish or publish."""
import argparse
import json
import time
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
from urllib.request import Request, build_opener
from urllib.error import HTTPError
from dofesh_variant_audit import D1, HTML, NoRedirect, SupplierBlocked, SupplierMissing, parse_product, norm, fetch_product
from dofesh_missing_products import listing, local_catalog, unpack
from dofesh_missing_draft_import import extract, import_one

FOLDER=Path('docs/dofesh-weekly')

def stock_plan(data,sid,variants):
    tree=HTML(unpack(data)).root
    roots=[n for n in tree.all() if n.a.get('id')=='this-is-product']
    import re
    if len(roots)!=1 or not re.search(r'رقم المنتج\s+'+str(sid)+r'(?!\d)',tree.text()):
        raise ValueError('source_identity_not_verified')
    root=roots[0]
    if len([n for n in root.all() if n.tag=='h1'])!=1:raise ValueError('title_not_verified')
    if 'هذا المنتج لم يعد متوفر' in root.text():return True,[v['id'] for v in variants]
    source=parse_product(data,sid)
    if source['variants']:
        unavailable={norm(v['name']) for v in source['variants'] if not v['active']}
        return all(not v['active'] for v in source['variants']),[v['id'] for v in variants if norm(v['name']) in unavailable]
    buy=[n for n in root.all() if n.a.get('id')=='addToCart']
    # Disabled purchase alone can be a form requirement. Only explicit sold-out text zeros simple items.
    if len(buy)!=1:raise ValueError('availability_unknown')
    return False,[]

def zero_stock(db,pid,data,sid,apply):
    p=db.query('SELECT id,item_number,name,stock_quantity,updated_at FROM products WHERE id=? AND deleted_at IS NULL',[pid])[0]
    variants=db.query("SELECT v.id,v.stock_quantity,group_concat(ov.value,' / ') AS name FROM product_variants v LEFT JOIN variant_option_values vv ON vv.variant_id=v.id LEFT JOIN product_option_values ov ON ov.id=vv.option_value_id WHERE v.product_id=? GROUP BY v.id ORDER BY v.id",[pid])
    whole,ids=stock_plan(data,sid,variants)
    targets=[v for v in variants if v['id'] in ids and v['stock_quantity']!=0]
    change_product=whole and p['stock_quantity']!=0
    result={'source_id':sid,'product_id':pid,'item_number':p['item_number'],'name':p['name'],'status':'zeroed' if apply else 'would_zero','before_stock':p['stock_quantity'],'product_zeroed':change_product,'variants':targets}
    if not change_product and not targets:return dict(result,status='unchanged')
    if not apply:return result
    now=int(time.time()*1000)
    guard="INSERT INTO audit_logs(entity_type,entity_id,action,details_json,created_at) SELECT 'product',?,CASE WHEN EXISTS(SELECT 1 FROM products WHERE id=? AND updated_at=? AND stock_quantity=? AND deleted_at IS NULL) THEN 'dofesh_weekly_zero' ELSE NULL END,?,?"
    sql=[(guard,[str(pid),pid,p['updated_at'],p['stock_quantity'],json.dumps(result,ensure_ascii=False),now])]
    for v in targets:
        sql.append(("INSERT INTO audit_logs(entity_type,entity_id,action,details_json,created_at) SELECT 'product_variant',?,CASE WHEN EXISTS(SELECT 1 FROM product_variants WHERE id=? AND product_id=? AND stock_quantity=?) THEN 'dofesh_weekly_variant_zero' ELSE NULL END,?,?",[str(v['id']),v['id'],pid,v['stock_quantity'],json.dumps(v,ensure_ascii=False),now]))
        sql.append(('UPDATE product_variants SET stock_quantity=0,updated_at=? WHERE id=? AND product_id=?',[now,v['id'],pid]))
    if change_product:sql.append(('UPDATE products SET stock_quantity=0,updated_at=? WHERE id=?',[now,pid]))
    db.batch(sql)
    if change_product and db.query('SELECT stock_quantity FROM products WHERE id=?',[pid])[0]['stock_quantity']!=0:raise RuntimeError('stock_verification_failed')
    for v in targets:
        if db.query('SELECT stock_quantity FROM product_variants WHERE id=?',[v['id']])[0]['stock_quantity']!=0:raise RuntimeError('variant_verification_failed')
    return result

def save(state):
    FOLDER.mkdir(parents=True,exist_ok=True)
    state['updated_at']=datetime.now(ZoneInfo('Asia/Hebron')).isoformat()
    (FOLDER/'latest.json').write_text(json.dumps(state,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--mode',choices=['preview','apply'],default='preview');ap.add_argument('--limit',type=int,default=10000);ap.add_argument('--delay',type=float,default=5);args=ap.parse_args()
    if args.delay<5 or not 1<=args.limit<=10000:ap.error('invalid limits')
    db=D1();state={'started_at':datetime.now(ZoneInfo('Asia/Hebron')).isoformat(),'mode':args.mode,'status':'running','results':[],'pages':0,'cards':0};save(state)
    last=0
    def fetch(sid=None,page=None):
        nonlocal last
        time.sleep(max(0,args.delay-(time.monotonic()-last)));last=time.monotonic()
        if sid is not None:return fetch_product(sid)
        req=Request(f'https://dofesh.ps/?app=product.all..{page}',headers={'User-Agent':'ManarWeeklyCatalog/1.0 (+https://manarstore.ps)','Accept':'text/html'})
        try:
            with build_opener(NoRedirect()).open(req,timeout=35) as r:
                body=r.read(2000001)
                if len(body)>2000000:raise ValueError('response_too_large')
                return body.decode('utf-8')
        except HTTPError as e:
            if e.code in (403,429):raise SupplierBlocked('supplier_blocked') from None
            raise
    try:
        cards={};page=1
        while page is not None:
            if state['pages']>=1000:raise ValueError('catalog_page_limit')
            rows,nxt=listing(fetch(page=page),page)
            if all(c['source_id'] in cards for c in rows):raise ValueError('repeated_page')
            cards.update({c['source_id']:c for c in rows});state['pages']+=1;state['cards']=len(cards);save(state);page=nxt
        products,links,names=local_catalog(db)
        # Includes mapped products absent from the listing; a missing page is never evidence of sold-out stock.
        ids=sorted(set(cards)|set(links),reverse=True)
        for sid in ids[:args.limit]:
            try:
                data=fetch(sid=sid)
                if sid in links:
                    for pid in sorted(links[sid]):state['results'].append(zero_stock(db,pid,data,sid,args.mode=='apply'))
                elif norm(cards[sid]['name']) in names:state['results'].append({'source_id':sid,'status':'possible_name_match'})
                else:
                    source=extract(data,sid)
                    state['results'].append(import_one(db,sid,source,args.mode))
                    if args.mode=='apply':products,links,names=local_catalog(db)
            except SupplierBlocked:raise
            except Exception as e:
                # Read/parse errors do not zero or import anything. Never print credentials or response bodies.
                state['results'].append({'source_id':sid,'status':'skipped_error','reason':type(e).__name__})
                if isinstance(e,RuntimeError) and not isinstance(e,SupplierMissing):raise
            save(state)
            print(f"source={sid} status={state['results'][-1]['status']}",flush=True)
        state['status']='completed' if len(ids)<=args.limit else 'limited'
    except Exception as e:
        state['status']='failed';state['error']=type(e).__name__
    finally:
        save(state)
        with Path('STORE-PROGRESS.md').open('a',encoding='utf-8') as f:
            f.write('\n\n### '+state['updated_at']+' — DOFESH-WEEKLY\n- '+state['status']+' / '+args.mode+'؛ التقرير docs/dofesh-weekly/latest.json. لا زيادة مخزون ولا نشر ولا تعديل أسعار.\n')
            for r in state['results']:
                if r['status']!='unchanged':f.write('- '+json.dumps(r,ensure_ascii=False)+'\n')
        print(json.dumps({'status':state['status'],'checked':len(state['results'])}),flush=True)
    if state['status']=='failed':raise SystemExit(1)

if __name__=='__main__':main()
