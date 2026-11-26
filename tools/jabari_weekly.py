"""Weekly supplier availability and new draft import; never replenish or publish."""
import argparse
import json
import time
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
from urllib.request import Request, build_opener
from urllib.error import HTTPError
from jabari_variant_audit import D1, HTML, NoRedirect, SupplierBlocked, SupplierMissing, parse_product, norm, fetch_product
from jabari_reprice_once import price as agreed_price
import hashlib, re, uuid
from urllib.parse import urljoin,urlsplit,quote,urlunsplit


ORIGIN='https://jabaristore.com'
ACTION='jabari_weekly_draft_import'
FOLDER=Path('docs/jabari-weekly')
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
    roots=[n for n in tree.all() if n.a.get('id')=='this-is-product' or 'this-is-product' in n.a.get('class','').split()]
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
        m=re.fullmatch(r'supplier-jabari-(\d+)',p['slug'] or '')
        if m:add(int(m[1]),p['id'])
    for r in db.query("SELECT product_id,keyword FROM product_keywords WHERE keyword GLOB 'jabari-[0-9]*'"):
        m=re.fullmatch(r'jabari-(\d+)',r['keyword'])
        if m:add(int(m[1]),r['product_id'])
    for r in db.query('SELECT ps.product_id,ps.source_product_id,ps.source_url FROM product_suppliers ps JOIN suppliers s ON s.id=ps.supplier_id WHERE s.supplier_number=9102'):
        sid=str(r['source_product_id'] or '')
        if sid.isdigit():add(int(sid),r['product_id'])
        m=re.search(r'https://(?:www\.)?jabaristore\.com/\?app=product\.show\.(\d+)(?:$|&)',r['source_url'] or '')
        if m:add(int(m[1]),r['product_id'])
    names={}
    for p in products:names.setdefault(norm(p['name']),[]).append(p)
    return by_id,links,names


def extract(data,sid):
    source=parse_product(unpack(data),sid)
    tree=HTML(data).root
    root=next(n for n in tree.all() if n.a.get('id')=='this-is-product' or 'this-is-product' in n.a.get('class','').split())
    images=[]
    for n in root.all():
        if n.tag!='img':continue
        raw=n.a.get('src','')
        url=urlsplit(urljoin('https://jabaristore.com/',raw))
        if url.scheme!='https' or url.netloc!='jabaristore.com' or not url.path.startswith('/upload/'):continue
        image=urlunsplit((url.scheme,url.netloc,quote(url.path,safe='/%()'),'', ''))
        if image not in images:images.append(image)
    if not images:raise ValueError('source_image_not_verified')
    fields=[]
    controls=[n for n in root.all() if n.tag=='textarea' or n.tag=='input' and n.a.get('type','text') in ('text','email','file')]
    if any(n.tag=='select' for n in root.all()) or any(n.a.get('type') in ('email','file') for n in controls):
        raise ValueError('unsupported_custom_field_type')
    for n in controls:
        parent=n.parent
        while parent is not None and 'property-wrapper' not in parent.a.get('class','').split():parent=parent.parent
        labels=[x.text() for x in parent.all() if 'property-name' in x.a.get('class','').split()] if parent else []
        if len(labels)!=1 or not labels[0]:raise ValueError('custom_field_label_not_verified')
        length=int(n.a.get('maxlength','60'))
        fields.append({'label':labels[0],'required':'required' in n.a,'max_length':min(500,max(1,length)),
                       'placeholder':n.a.get('placeholder','')})
    return dict(source,images=images,fields=fields)

def category_number(name):
    rules=[(r'علب|علبة|صندوق|صناديق',1037),(r'كيس|اكياس|تغليف|ورق|شنتة',1038),
           (r'شمع',1010),(r'ورد|زهور|زهرة',1011),(r'تول|قماش|اقمشة',1042),
           (r'شريط|شرائط|ببيون',1041),(r'مرايا|مراة|مراية',1009),
           (r'اكري',1047),(r'خشب|خشبي|CNC',1048),(r'ستاند|ظهرية',1055)]
    return next((c for pattern,c in rules if re.search(pattern,norm(name),re.I)),1060)

def import_one(db,sid,source,mode):
    byid,links,names=local_catalog(db)
    if sid in links:return {'source_id':sid,'status':'already_present','product_ids':sorted(links[sid])}
    if norm(source['title']) in names:return {'source_id':sid,'status':'possible_name_match','name':source['title']}
    price=min(v['price'] for v in source['variants']) if source['variants'] else source['simple_price']
    if mode=='preview':return {'source_id':sid,'status':'ready','name':source['title'],'price_agorot':agreed_price(price),'variants':len(source['variants']),'images':len(source['images']),'fields':source['fields']}
    category=db.query('SELECT id FROM categories WHERE category_number=?',[category_number(source['title'])])
    supplier=db.query('SELECT id FROM suppliers WHERE supplier_number=9102')
    if len(category)!=1 or len(supplier)!=1:raise ValueError('category_or_supplier_not_verified')
    now=int(time.time()*1000);token=uuid.uuid4().hex;slug=f'supplier-jabari-{sid}'
    url=f'https://jabaristore.com/?app=product.show.{sid}'
    gate="slug=? AND active=0 AND EXISTS (SELECT 1 FROM audit_logs a WHERE a.entity_type='product' AND a.action=? AND json_extract(a.details_json,'$.draft_import_token')=?)"
    g=[slug,ACTION,token]
    gate_p=gate.replace('slug=','p.slug=').replace('active=','p.active=')
    insert="""INSERT INTO products(item_number,category_id,name,slug,description,specifications,price_agorot,purchase_price_agorot,stock_quantity,active,featured,created_at,updated_at)
    SELECT COALESCE(MAX(item_number),1000)+1,?,?,?,?,?,?,?,?,0,0,?,? FROM products
    HAVING NOT EXISTS(SELECT 1 FROM products p WHERE p.slug=?)
    AND NOT EXISTS(SELECT 1 FROM product_keywords k WHERE k.keyword=?)
    AND NOT EXISTS(SELECT 1 FROM product_suppliers ps JOIN suppliers s ON s.id=ps.supplier_id WHERE s.supplier_number=9102 AND ps.source_product_id=?)
    """
    sql=[(insert,[category[0]['id'],source['title'],slug,source['title'] ,'',agreed_price(price),price,9999,now,now,slug,f'jabari-{sid}',str(sid)])]
    detail=json.dumps({'draft_import_token':token,'source_id':sid,'source_url':url,'name':source['title'],'active':0,'stock':9999,'source':source},ensure_ascii=False)
    sql.append(("INSERT INTO audit_logs(entity_type,entity_id,action,details_json,created_at) SELECT 'product',CAST(id AS TEXT),?,?,? FROM products WHERE slug=? AND changes()=1",[ACTION,detail,now,slug]))
    sql.append((f'INSERT INTO product_keywords(product_id,keyword) SELECT id,? FROM products WHERE {gate}',[f'jabari-{sid}']+g))
    sql.append((f'INSERT INTO product_suppliers(product_id,supplier_id,source_product_id,source_url,supplier_price_agorot,preferred,created_at,updated_at) SELECT id,?,?,?,?,1,?,? FROM products WHERE {gate}',[supplier[0]['id'],str(sid),url,price,now,now]+g))
    for i,image in enumerate(source['images']):
        sql.append((f"INSERT INTO product_media(product_id,media_type,url,alt_text,sort_order,is_primary,created_at,updated_at) SELECT id,'image',?,?,?,?,?,? FROM products WHERE {gate}",[image,source['title'],i,int(i==0),now,now]+g))
    if source['variants']:
        sql.append((f"INSERT INTO product_options(product_id,name,display_type,sort_order) SELECT id,'الخيار','text',0 FROM products WHERE {gate}",g))
        for i,v in enumerate(source['variants']):
            sku=f"jabari-draft-{sid}-{hashlib.sha256(v['name'].encode()).hexdigest()[:16]}"
            sql.append((f'INSERT INTO product_option_values(option_id,value,sort_order) SELECT o.id,?,? FROM product_options o JOIN products p ON p.id=o.product_id WHERE {gate_p}',[v['name'],i]+g))
            sql.append((f'INSERT INTO product_variants(product_id,sku,price_agorot,purchase_price_agorot,stock_quantity,active,created_at,updated_at) SELECT id,?,?,?,?,?,?,? FROM products WHERE {gate}',[sku,agreed_price(v['price']),v['price'],9999 if v['active'] else 0,int(v['active']),now,now]+g))
            sql.append((f'INSERT INTO variant_option_values(variant_id,option_value_id) SELECT v.id,ov.id FROM product_variants v JOIN products p ON p.id=v.product_id JOIN product_options o ON o.product_id=p.id JOIN product_option_values ov ON ov.option_id=o.id WHERE v.sku=? AND ov.value=? AND {gate_p}',[sku,v['name']]+g))
    for i,field in enumerate(source['fields']):
        sql.append((f'INSERT INTO product_custom_fields(product_id,label,placeholder,max_length,required,sort_order) SELECT id,?,?,?,?,? FROM products WHERE {gate}',[field['label'],field['placeholder'],field['max_length'],int(field['required']),i]+g))
    result=db.batch(sql)
    if result[0]['meta'].get('changes')!=1:return {'source_id':sid,'status':'duplicate_guard_skipped'}
    p=db.query('SELECT id,item_number,name,active,stock_quantity,price_agorot FROM products WHERE slug=?',[slug])[0]
    variants=db.query('SELECT stock_quantity,active FROM product_variants WHERE product_id=?',[p['id']])
    if p['active']!=0 or p['stock_quantity']!=9999 or any(v['stock_quantity']!=(9999 if v['active'] else 0) for v in variants):
        raise RuntimeError('post_import_draft_verification_failed')
    return dict(p,source_id=sid,status='imported_draft',source_url=url,images=len(source['images']),variants=len(source['variants']),fields=len(source['fields']))



def stock_plan(data,sid,variants):
    tree=HTML(unpack(data)).root
    roots=[n for n in tree.all() if n.a.get('id')=='this-is-product']
    import re
    if len(roots)!=1 or not re.search(r'رقم المنتج\s+'+str(sid)+r'(?!\d)',tree.text()):
        raise ValueError('source_identity_not_verified')
    root=roots[0]
    titles={n.text().strip() for n in root.all() if n.tag=='h1' and n.text().strip()}
    if len(titles)!=1:raise ValueError('title_not_verified')
    if 'هذا المنتج لم يعد متوفر' in root.text():return True,[v['id'] for v in variants]
    source=parse_product(data,sid)
    if source['variants']:
        unavailable={norm(v['name']) for v in source['variants'] if not v['active']}
        return all(not v['active'] for v in source['variants']) and {norm(v['name']) for v in variants if v['name']} <= unavailable,[v['id'] for v in variants if norm(v['name']) in unavailable]
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
    guard="INSERT INTO audit_logs(entity_type,entity_id,action,details_json,created_at) SELECT 'product',?,CASE WHEN EXISTS(SELECT 1 FROM products WHERE id=? AND updated_at=? AND stock_quantity=? AND deleted_at IS NULL) THEN 'jabari_weekly_zero' ELSE NULL END,?,?"
    sql=[(guard,[str(pid),pid,p['updated_at'],p['stock_quantity'],json.dumps(result,ensure_ascii=False),now])]
    for v in targets:
        sql.append(("INSERT INTO audit_logs(entity_type,entity_id,action,details_json,created_at) SELECT 'product_variant',?,CASE WHEN EXISTS(SELECT 1 FROM product_variants WHERE id=? AND product_id=? AND stock_quantity=?) THEN 'jabari_weekly_variant_zero' ELSE NULL END,?,?",[str(v['id']),v['id'],pid,v['stock_quantity'],json.dumps(v,ensure_ascii=False),now]))
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
        req=Request(f'https://jabaristore.com/?app=product.all..{page}',headers={'User-Agent':'ManarWeeklyCatalog/1.0 (+https://manarstore.ps)','Accept':'text/html'})
        try:
            with build_opener(NoRedirect()).open(req,timeout=35) as r:
                if 'text/html' not in r.headers.get('Content-Type','') and 'application/json' not in r.headers.get('Content-Type',''):raise ValueError('listing_content_type')
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
                if sid in links and len(links[sid])!=1:
                    state['results'].append({'source_id':sid,'status':'ambiguous_source'})
                elif sid in links and any(sum(pid in matched for matched in links.values())!=1 for pid in links[sid]):
                    state['results'].append({'source_id':sid,'status':'ambiguous_source'})
                elif sid in links:
                    for pid in sorted(links[sid]):state['results'].append(zero_stock(db,pid,data,sid,args.mode=='apply'))
                elif norm(cards[sid]['name']) in names:state['results'].append({'source_id':sid,'status':'possible_name_match'})
                else:
                    source=extract(unpack(data),sid)
                    if not source['variants'] and stock_plan(data,sid,[])[0] or source['variants'] and not any(v['active'] for v in source['variants']):
                        state['results'].append({'source_id':sid,'status':'unavailable'});save(state);continue
                    state['results'].append(import_one(db,sid,source,args.mode))
                    if args.mode=='apply':products,links,names=local_catalog(db)
            except SupplierBlocked:raise
            except Exception as e:
                # Read/parse errors do not zero or import anything. Never print credentials or response bodies.
                state['results'].append({'source_id':sid,'status':'skipped_error','reason':str(e) if type(e) is ValueError and re.fullmatch(r'[a-z_]{1,80}',str(e)) else type(e).__name__})
                if isinstance(e,RuntimeError) and not isinstance(e,SupplierMissing):raise
            save(state)
            print(f"source={sid} status={state['results'][-1]['status']}",flush=True)
        state['status']='completed' if len(ids)<=args.limit else 'limited'
    except Exception as e:
        state['status']='failed';state['error']=type(e).__name__
    finally:
        save(state)
        with Path('STORE-PROGRESS.md').open('a',encoding='utf-8') as f:
            f.write('\n\n### '+state['updated_at']+' — JABARI-WEEKLY\n- '+state['status']+' / '+args.mode+'؛ التقرير docs/jabari-weekly/latest.json. لا زيادة مخزون ولا نشر ولا تعديل أسعار.\n')
            for r in state['results']:
                if r['status']!='unchanged':f.write('- '+json.dumps(r,ensure_ascii=False)+'\n')
        print(json.dumps({'status':state['status'],'checked':len(state['results'])}),flush=True)
    if state['status']=='failed':raise SystemExit(1)

if __name__=='__main__':main()
