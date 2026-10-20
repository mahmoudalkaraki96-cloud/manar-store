"""Import only the verified missing Dofesh candidates as unpublished drafts."""
import argparse
import csv
import hashlib
import json
import re
import time
import uuid
from pathlib import Path
from urllib.parse import urljoin,urlsplit,quote,urlunsplit
from datetime import datetime
from zoneinfo import ZoneInfo
from dofesh_variant_audit import D1,HTML,parse_product,fetch_product,norm,SupplierBlocked
from dofesh_missing_products import local_catalog

FOLDER=Path('docs/dofesh-draft-import')
ACTION='dofesh_missing_draft_import'

def extract(data,sid):
    source=parse_product(data,sid)
    tree=HTML(data).root
    root=next(n for n in tree.all() if n.a.get('id')=='this-is-product')
    images=[]
    for n in root.all():
        if n.tag!='img':continue
        raw=n.a.get('src','')
        url=urlsplit(urljoin('https://dofesh.ps/',raw))
        if url.scheme!='https' or url.netloc!='dofesh.ps' or not url.path.startswith('/upload/'):continue
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
    if mode=='preview':return {'source_id':sid,'status':'ready','name':source['title'],'price_agorot':price,'variants':len(source['variants']),'images':len(source['images']),'fields':source['fields']}
    category=db.query('SELECT id FROM categories WHERE category_number=?',[category_number(source['title'])])
    supplier=db.query('SELECT id FROM suppliers WHERE supplier_number=9101')
    if len(category)!=1 or len(supplier)!=1:raise ValueError('category_or_supplier_not_verified')
    now=int(time.time()*1000);token=uuid.uuid4().hex;slug=f'supplier-dofesh-{sid}'
    url=f'https://dofesh.ps/?app=product.show.{sid}'
    spec=json.dumps({'source_url':url,'source_minimum':source['minimum'],'draft_import_token':token},ensure_ascii=False)
    gate="slug=? AND json_extract(specifications,'$.draft_import_token')=? AND active=0"
    g=[slug,token]
    gate_p=gate.replace('slug=','p.slug=').replace('specifications','p.specifications').replace('active=','p.active=')
    insert="""INSERT INTO products(item_number,category_id,name,slug,description,specifications,price_agorot,purchase_price_agorot,stock_quantity,active,featured,created_at,updated_at)
    SELECT COALESCE(MAX(item_number),1000)+1,?,?,?,?,?,?,?,0,0,0,?,? FROM products
    HAVING NOT EXISTS(SELECT 1 FROM products p WHERE p.slug=?)
    AND NOT EXISTS(SELECT 1 FROM product_keywords k WHERE k.keyword=?)
    AND NOT EXISTS(SELECT 1 FROM product_suppliers ps JOIN suppliers s ON s.id=ps.supplier_id WHERE s.supplier_number=9101 AND ps.source_product_id=?)
    """
    sql=[(insert,[category[0]['id'],source['title'],slug,source['title'],spec,price,price,now,now,slug,f'dofesh-{sid}',str(sid)])]
    sql.append((f'INSERT INTO product_keywords(product_id,keyword) SELECT id,? FROM products WHERE {gate}',[f'dofesh-{sid}']+g))
    sql.append((f'INSERT INTO product_suppliers(product_id,supplier_id,source_product_id,source_url,supplier_price_agorot,preferred,created_at,updated_at) SELECT id,?,?,?,?,1,?,? FROM products WHERE {gate}',[supplier[0]['id'],str(sid),url,price,now,now]+g))
    for i,image in enumerate(source['images']):
        sql.append((f"INSERT INTO product_media(product_id,media_type,url,alt_text,sort_order,is_primary,created_at,updated_at) SELECT id,'image',?,?,?,?,?,? FROM products WHERE {gate}",[image,source['title'],i,int(i==0),now,now]+g))
    if source['variants']:
        sql.append((f"INSERT INTO product_options(product_id,name,display_type,sort_order) SELECT id,'الخيار','text',0 FROM products WHERE {gate}",g))
        for i,v in enumerate(source['variants']):
            sku=f"dofesh-draft-{sid}-{hashlib.sha256(v['name'].encode()).hexdigest()[:16]}"
            sql.append((f'INSERT INTO product_option_values(option_id,value,sort_order) SELECT o.id,?,? FROM product_options o JOIN products p ON p.id=o.product_id WHERE {gate_p}',[v['name'],i]+g))
            sql.append((f'INSERT INTO product_variants(product_id,sku,price_agorot,purchase_price_agorot,stock_quantity,active,created_at,updated_at) SELECT id,?,?,?,0,?,?,? FROM products WHERE {gate}',[sku,v['price'],v['price'],int(v['active']),now,now]+g))
            sql.append((f'INSERT INTO variant_option_values(variant_id,option_value_id) SELECT v.id,ov.id FROM product_variants v JOIN products p ON p.id=v.product_id JOIN product_options o ON o.product_id=p.id JOIN product_option_values ov ON ov.option_id=o.id WHERE v.sku=? AND ov.value=? AND {gate_p}',[sku,v['name']]+g))
    for i,field in enumerate(source['fields']):
        sql.append((f'INSERT INTO product_custom_fields(product_id,label,placeholder,max_length,required,sort_order) SELECT id,?,?,?,?,? FROM products WHERE {gate}',[field['label'],field['placeholder'],field['max_length'],int(field['required']),i]+g))
    detail=json.dumps({'source_id':sid,'source_url':url,'name':source['title'],'active':0,'stock':0,'source':source},ensure_ascii=False)
    sql.append((f"INSERT INTO audit_logs(entity_type,entity_id,action,details_json,created_at) SELECT 'product',CAST(id AS TEXT),?,?,? FROM products WHERE {gate}",[ACTION,detail,now]+g))
    result=db.batch(sql)
    if result[0]['meta'].get('changes')!=1:return {'source_id':sid,'status':'duplicate_guard_skipped'}
    p=db.query('SELECT id,item_number,name,active,stock_quantity,price_agorot FROM products WHERE slug=?',[slug])[0]
    variants=db.query('SELECT stock_quantity FROM product_variants WHERE product_id=?',[p['id']])
    if p['active']!=0 or p['stock_quantity']!=0 or any(v['stock_quantity'] for v in variants):
        raise RuntimeError('post_import_draft_verification_failed')
    return dict(p,source_id=sid,status='imported_draft',source_url=url,images=len(source['images']),variants=len(source['variants']),fields=len(source['fields']))

def write_report(db,results,status):
    FOLDER.mkdir(parents=True,exist_ok=True)
    saved=db.query('SELECT entity_id,details_json,created_at FROM audit_logs WHERE action=? ORDER BY created_at',[ACTION])
    imports=[]
    for row in saved:
        d=json.loads(row['details_json'])
        products=db.query('SELECT id,item_number,active,name FROM products WHERE id=?',[int(row['entity_id'])])
        if products:imports.append(dict(products[0],source_id=d['source_id'],source_url=d['source_url'],store_url=f"https://manarstore.ps/product/{products[0]['id']}",created_at=row['created_at']))
    data={'time':datetime.now(ZoneInfo('Asia/Hebron')).isoformat(),'status':status,'results':results,'imported_drafts':imports}
    (FOLDER/'latest.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    with (FOLDER/'imported-drafts.csv').open('w',encoding='utf-8-sig',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=['source_id','item_number','id','name','active','source_url','store_url','created_at'])
        writer.writeheader();writer.writerows(imports)
    text=f"## DOFESH-MISSING-DRAFT-IMPORT\n- Time: {data['time']}\n- Status: {status}\n- Total saved imports: {len(imports)}\n"
    (FOLDER/'summary.md').write_text(text,encoding='utf-8')
    with Path('STORE-PROGRESS.md').open('a',encoding='utf-8') as f:
        f.write('\n\n### '+data['time']+' — DOFESH-MISSING-DRAFT-IMPORT\n'+text)
        for p in results:f.write('- '+json.dumps(p,ensure_ascii=False)+'\n')
    return data

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--mode',choices=['preview','apply'],default='preview');args=ap.parse_args()
    report=json.loads(Path('docs/dofesh-missing-products/latest.json').read_text(encoding='utf-8'))
    if report['status']!='completed' or not report['catalog_complete']:raise ValueError('comparison_not_completed')
    candidates=[r for r in report['results'] if r['status']=='missing' and r['availability']=='available']
    if len(candidates)>30:raise ValueError('candidate_limit_exceeded')
    db=D1();results=[];status='completed'
    try:
        for row in candidates:
            sid=row['source_id']
            if any(int(x['source_id'])==sid for x in db.query("SELECT ps.source_product_id AS source_id FROM product_suppliers ps JOIN suppliers s ON s.id=ps.supplier_id WHERE s.supplier_number=9101 AND ps.source_product_id=?",[str(sid)])):
                results.append({'source_id':sid,'status':'already_present'});continue
            try:
                source=extract(fetch_product(sid),sid)
                results.append(import_one(db,sid,source,args.mode))
                print(json.dumps(results[-1],ensure_ascii=False),flush=True)
            except SupplierBlocked:raise
            except ValueError as e:
                results.append({'source_id':sid,'status':'unsupported_source','reason':str(e)})
            time.sleep(10)
    except Exception as e:
        status='paused_error';results.append({'status':'error','reason':str(e)[:150]})
    finally:write_report(db,results,status)
    if status!='completed':raise SystemExit(1)

if __name__=='__main__':main()


