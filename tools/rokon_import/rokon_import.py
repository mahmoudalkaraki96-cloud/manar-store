"""Review first. --apply writes drafts ONLY to verified Rokon D1/R2 resources.
No AI/API translation or model calls. Cloudflare token is read from environment only.
"""
import argparse,copy,hashlib,json,math,os,subprocess,time
from pathlib import Path
from urllib.parse import urlsplit,quote
from urllib.request import Request,urlopen,build_opener,HTTPRedirectHandler

SOURCES={'alsultan-co.com':'السلطان','albazar.ps':'البازار','tammouni-home.com':'تمّوني هوم'}
DB_NAME='rokon-store-db'; BUCKET='rokon-store-media'
WORKERS=('rokon-store','rokon-store-admin')
class NoRedirect(HTTPRedirectHandler):
 def redirect_request(self,*a,**k): return None
def cents(value):
 if isinstance(value,bool) or not isinstance(value,int) or not 0<value<=100000000: raise ValueError('invalid_price')
 return value
def sale_price(cost,before):
 cost,before=cents(cost),cents(before)
 if before<cost: raise ValueError('sale_below_purchase')
 return ((cost*120+9999)//10000)*100 if before==cost else before
def media_url(value,host):
 u=urlsplit(value)
 allowed=(u.hostname==host and u.path.startswith('/upload/')) if host!='tammouni-home.com' else ((u.hostname==host and u.path.startswith('/wp-content/uploads/')) or (u.hostname=='cdn.treesal.com' and u.path.startswith('/altammuni/uploads/')))
 if u.scheme!='https' or not allowed or u.username or u.password: raise ValueError('unverified_media_url')
 return value
def prepare(record):
 p=copy.deepcopy(record);host=p.get('source');sid=p.get('sourceId','')
 if host not in SOURCES or not isinstance(sid,str) or not sid.isdigit(): raise ValueError('invalid_source_identity')
 u=urlsplit(p.get('sourceUrl',''))
 if host=='tammouni-home.com':
  import re
  valid_path=bool(re.fullmatch(r'/product/[^/]+/?',u.path)) and not u.query
 else:valid_path=u.query=='app=product.show.'+sid and u.path=='/'
 if u.scheme!='https' or u.hostname!=host or not valid_path or u.username or u.password:raise ValueError('source_url_mismatch')
 if not p.get('name') or len(p['name'])>400:raise ValueError('invalid_name')
 if p.get('review'):raise ValueError('review:'+','.join(p['review']))
 if not p.get('available'):return None
 p['active']=False;p['stock']=100;p['slug']='supplier-'+host.replace('.','-')+'-'+sid
 variants=p.get('variants',[])
 for v in variants:
  if not v.get('name') or not v.get('sourceKey'):raise ValueError('invalid_variant')
  v['stock']=100 if v.get('available') else 0
  v['saleAgorot']=sale_price(v['purchaseAgorot'],v['saleBeforeAgorot'])
  for image in v.get('images',[]):media_url(image,host)
 if variants:
  available=[v for v in variants if v.get('available')]
  if not available:return None
  p['purchaseAgorot']=min(v['purchaseAgorot'] for v in available)
  p['saleAgorot']=min(v['saleAgorot'] for v in available)
 else:p['saleAgorot']=sale_price(p['purchaseAgorot'],p['saleBeforeAgorot'])
 for image in p.get('images',[]):media_url(image,host)
 for video in p.get('videos',[]):media_url(video,host)
 if not p.get('allImages'):raise ValueError('missing_images')
 if len(variants)>100:raise ValueError('too_many_variants')
 return p

class Cloudflare:
 def __init__(self,account,database):self.account=account;self.database=database;self.token=os.environ['CLOUDFLARE_API_TOKEN']
 def call(self,path,body=None):
  req=Request('https://api.cloudflare.com/client/v4/accounts/'+self.account+'/'+path,data=json.dumps(body).encode() if body is not None else None,headers={'Authorization':'Bearer '+self.token,'Content-Type':'application/json'})
  try:
   with build_opener(NoRedirect()).open(req,timeout=90) as r:payload=json.load(r)
  except Exception:raise RuntimeError('Cloudflare request failed; no credential data logged') from None
  if not payload.get('success'):raise RuntimeError('Cloudflare API rejected request')
  return payload['result']
 def batch(self,statements):
  result=self.call('d1/database/'+self.database+'/query',{'batch':[{'sql':s,'params':p} for s,p in statements]})
  if not all(x.get('success') for x in result):raise RuntimeError('D1 batch failed')
  return result
 def query(self,sql,params=()):return self.batch([(sql,list(params))])[0]['results']
 def verify(self):
  if self.call('d1/database/'+self.database).get('name')!=DB_NAME:raise RuntimeError('Refusing database other than '+DB_NAME)
  for worker in WORKERS:
   bindings=self.call('workers/scripts/'+worker+'/settings').get('bindings',[])
   if not any(b.get('type')=='d1' and b.get('id')==self.database for b in bindings):raise RuntimeError('Rokon database binding mismatch')
   if not any(b.get('type')=='r2_bucket' and b.get('bucket_name')==BUCKET for b in bindings):raise RuntimeError('Rokon media binding mismatch')

SCHEMA="""CREATE TABLE IF NOT EXISTS rokon_supplier_imports(source TEXT NOT NULL,source_id TEXT NOT NULL,product_id INTEGER,token TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('importing','complete')),snapshot_json TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(source,source_id),FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE SET NULL)"""
def statements(p,supplier_id,category_id,token,now):
 slug=p['slug'];where='slug=? AND active=0';gate=[slug]
 spec='\n'.join(x['label']+': '+x['value'] for x in p.get('properties',[]) if x.get('label') and x.get('value') and x['label']!='رقم المنتج')
 spec+=''.join('\n'+v['name']+': '+v['notes'] for v in p.get('variants',[]) if v.get('notes'))
 description='\n'.join(x for x in [p.get('description',''),p.get('notes','')] if x)
 s=[('INSERT INTO rokon_supplier_imports(source,source_id,token,state,snapshot_json,created_at) VALUES(?,?,?,\'importing\',?,?)',[p['source'],p['sourceId'],token,json.dumps(p,ensure_ascii=False),now]),
 ('INSERT INTO products(item_number,category_id,name,slug,description,specifications,price_agorot,purchase_price_agorot,stock_quantity,active,featured,view_count,order_count,rating_average_x100,rating_count,created_at,updated_at) SELECT COALESCE(MAX(item_number),1000)+1,?,?,?,?,?,?,?,100,0,0,0,0,0,0,?,? FROM products',[category_id,p['name'],slug,description,spec,p['saleAgorot'],p['purchaseAgorot'],now,now]),
 ('INSERT INTO product_suppliers(product_id,supplier_id,source_product_id,source_url,supplier_price_agorot,preferred,created_at,updated_at) SELECT id,?,?,?,?,1,?,? FROM products WHERE '+where,[supplier_id,p['sourceId'],p['sourceUrl'],p['purchaseAgorot'],now,now]+gate)]
 for i,url in enumerate(p.get('images',[])):
  s.append(('INSERT INTO product_media(product_id,media_type,url,alt_text,sort_order,is_primary,created_at,updated_at) SELECT id,\'image\',?,?,?,?,?,? FROM products WHERE '+where,[url,p['name'],i,int(i==0),now,now]+gate))
 for i,url in enumerate(p.get('videos',[])):
  s.append(('INSERT INTO product_media(product_id,media_type,url,sort_order,is_primary,created_at,updated_at) SELECT id,\'video\',?,?,0,?,? FROM products WHERE '+where,[url,i,now,now]+gate))
 if p.get('variants'):
  s.append(('INSERT INTO product_options(product_id,name,display_type,sort_order) SELECT id,\'الخيار\',\'text\',0 FROM products WHERE '+where,gate))
  for i,v in enumerate(p['variants']):
   sku='import-'+hashlib.sha256((p['source']+p['sourceId']+':'+v['sourceKey']).encode()).hexdigest()[:24]
   s.append(('INSERT INTO product_option_values(option_id,value,sort_order) SELECT o.id,?,? FROM product_options o JOIN products p ON p.id=o.product_id WHERE p.slug=?',[v['name'],i,slug]))
   s.append(('INSERT INTO product_variants(product_id,sku,price_agorot,purchase_price_agorot,stock_quantity,active,created_at,updated_at) SELECT id,?,?,?,?,?,?,? FROM products WHERE '+where,[sku,v['saleAgorot'],v['purchaseAgorot'],v['stock'],int(bool(v.get('available'))),now,now]+gate))
   s.append(('INSERT INTO variant_option_values(variant_id,option_value_id) SELECT v.id,ov.id FROM product_variants v JOIN product_options o ON o.product_id=v.product_id JOIN product_option_values ov ON ov.option_id=o.id WHERE v.sku=? AND ov.value=?',[sku,v['name']]))
   for n,url in enumerate(v.get('images',[])):
    s.append(('INSERT INTO product_media(product_id,variant_id,media_type,url,sort_order,is_primary,created_at,updated_at) SELECT product_id,id,\'image\',?,?,?,?,? FROM product_variants WHERE sku=?',[url,n,int(n==0),now,now,sku]))
 for i,f in enumerate(p.get('customFields',[])):
  if f.get('type') not in ('text','textarea') or not f.get('label') or f.get('maxLength',60)>200:raise ValueError('unsupported_custom_fields')
  s.append(('INSERT INTO product_custom_fields(product_id,label,placeholder,max_length,required,sort_order) SELECT id,?,?,?,?,? FROM products WHERE '+where,[f['label'],f.get('placeholder',''),f.get('maxLength',60),int(bool(f.get('required'))),i]+gate))
 s.append(('UPDATE rokon_supplier_imports SET state=\'complete\',product_id=(SELECT id FROM products WHERE slug=?) WHERE source=? AND source_id=? AND token=?',[slug,p['source'],p['sourceId'],token]))
 return s

def supplier(db,host):
 rows=db.query('SELECT id FROM suppliers WHERE name=? AND notes=?',[SOURCES[host],host])
 if not rows:db.query('INSERT INTO suppliers(supplier_number,name,notes,active,created_at,updated_at) SELECT COALESCE(MAX(supplier_number),1000)+1,?,?,1,?,? FROM suppliers',[SOURCES[host],host,int(time.time()*1000),int(time.time()*1000)]);rows=db.query('SELECT id FROM suppliers WHERE name=? AND notes=?',[SOURCES[host],host])
 if len(rows)!=1:raise ValueError('ambiguous_supplier')
 return rows[0]['id']
def category(db,p):
 parent=None
 for c in p.get('categories',[]):
  rows=db.query('SELECT id FROM categories WHERE name=? AND parent_id IS ?',[c['name'],parent])
  if len(rows)>1:raise ValueError('ambiguous_category')
  if not rows:
   slug='source-'+hashlib.sha256((p['source']+':'+str(c['id'])).encode()).hexdigest()[:18];now=int(time.time()*1000)
   db.query('INSERT INTO categories(category_number,parent_id,name,slug,sort_order,active,created_at,updated_at) SELECT COALESCE(MAX(category_number),1000)+1,?,?,?,0,0,?,? FROM categories',[parent,c['name'],slug,now,now])
   rows=db.query('SELECT id FROM categories WHERE slug=?',[slug])
  parent=rows[0]['id']
 return parent

def store_images(p,directory,public_origin,account):
 from PIL import Image,ImageOps
 directory.mkdir(parents=True,exist_ok=True);mapping={}
 urls=list(dict.fromkeys(p.get('images',[])+[u for v in p.get('variants',[]) for u in v.get('images',[])]))
 for url in urls:
  media_url(url,p['source']);digest=hashlib.sha256(url.encode()).hexdigest();file=directory/(digest+'.webp');thumb=directory/(digest+'.thumb.webp')
  if not file.exists() or not thumb.exists():
   time.sleep(3)
   with build_opener(NoRedirect()).open(Request(url,headers={'User-Agent':'RokonCatalogImport/1.0'}),timeout=40) as response:data=response.read(20_000_001)
   if len(data)>20_000_000:raise ValueError('image_too_large')
   import io
   with Image.open(io.BytesIO(data)) as image:
    image=ImageOps.exif_transpose(image).convert('RGBA' if 'A' in image.getbands() or 'transparency' in image.info else 'RGB');image.save(file,'WEBP',quality=88)
    image.thumbnail((384,384));image.save(thumb,'WEBP',quality=78)
  for local,key in [(file,'imports/'+digest+'.webp'),(thumb,'thumbnails/w384/imports/'+digest+'.webp')]:
   command=['npx','--no-install','wrangler','r2','object','put',BUCKET+'/'+key,'--file',str(local.resolve()),'--remote','--content-type','image/webp']
   if os.name=='nt':command[0]='npx.cmd'
   result=subprocess.run(command,capture_output=True,text=True,env={**os.environ,'CLOUDFLARE_ACCOUNT_ID':account})
   if result.returncode:raise RuntimeError('R2 upload failed; check local Wrangler login')
  mapping[url]=public_origin.rstrip('/')+'/media/imports/'+digest+'.webp'
 p['images']=[mapping[u] for u in p.get('images',[])]
 for v in p.get('variants',[]):v['images']=[mapping[u] for u in v.get('images',[])]
 videos=[]
 for video in p.get('videos',[]):
  media_url(video,p['source']);suffix=Path(urlsplit(video).path).suffix.lower()
  if suffix not in ('.mp4','.webm','.mov'):raise ValueError('unsupported_video_format')
  digest=hashlib.sha256(video.encode()).hexdigest();file=directory/(digest+suffix);key='imports/'+digest+suffix
  if not file.exists():
   time.sleep(3)
   with build_opener(NoRedirect()).open(video,timeout=60) as response:data=response.read(50_000_001)
   if len(data)>50_000_000:raise ValueError('video_too_large')
   file.write_bytes(data)
  command=['npx.cmd' if os.name=='nt' else 'npx','--no-install','wrangler','r2','object','put',BUCKET+'/'+key,'--file',str(file.resolve()),'--remote','--content-type','video/'+('quicktime' if suffix=='.mov' else suffix[1:])]
  if subprocess.run(command,capture_output=True,env={**os.environ,'CLOUDFLARE_ACCOUNT_ID':account}).returncode:raise RuntimeError('R2 video upload failed')
  videos.append(public_origin.rstrip('/')+'/media/'+key)
 p['videos']=videos
 return p

def main():
 a=argparse.ArgumentParser();a.add_argument('files',nargs='+');a.add_argument('--output',default='rokon-import-report.json');a.add_argument('--apply',action='store_true');a.add_argument('--account-id');a.add_argument('--database-id');a.add_argument('--public-origin',default='https://rokon-store.mahmoud-alkaraki96.workers.dev');args=a.parse_args()
 report={'target':DB_NAME,'draftsOnly':True,'ready':[],'unavailable':[],'review':[],'imported':[],'existing':[],'collectionErrors':[]};seen=set()
 for file in args.files:
  data=json.loads(Path(file).read_text(encoding='utf-8-sig'))
  if data.get('schema')!=1 or data.get('source') not in SOURCES:raise ValueError('unsupported_export')
  report['collectionErrors']+=data.get('errors',[])
  if not data.get('completed'):report['review'].append({'file':str(file),'reason':'collection_incomplete','stopReason':data.get('stopReason')})
  for raw in data['products']:
   key=(raw.get('source'),raw.get('sourceId'))
   if raw.get('source')!=data['source']:raise ValueError('mixed_source_identity')
   if key in seen:continue
   seen.add(key)
   try:
    p=prepare(raw)
    if p is None:report['unavailable'].append({'source':key[0],'id':key[1]})
    else:
     statements(p,1,None,'preview',0) # validate every supported field before any write
     report['ready'].append(p)
   except (ValueError,KeyError,TypeError) as e:report['review'].append({'source':key[0],'id':key[1],'reason':str(e)})
 if args.apply:
  if any(x.get('reason')=='collection_incomplete' for x in report['review']):raise ValueError('Resume collection before applying an incomplete export')
  if not args.account_id or not args.database_id:raise ValueError('Explicit Rokon account/database IDs required')
  if args.public_origin!='https://rokon-store.mahmoud-alkaraki96.workers.dev':raise ValueError('Unverified Rokon media origin')
  db=Cloudflare(args.account_id,args.database_id);db.verify();db.query(SCHEMA)
  for original in report['ready']:
   p=copy.deepcopy(original);key=[p['source'],p['sourceId']]
   old=db.query('SELECT product_id,state FROM rokon_supplier_imports WHERE source=? AND source_id=?',key)
   if old:
    if old[0]['state']!='complete' or not old[0]['product_id']:raise RuntimeError('Incomplete previous import needs review')
    report['existing'].append(key);continue
   if db.query('SELECT id FROM products WHERE slug=?',[p['slug']]):raise RuntimeError('Existing product conflict; no overwrite')
   token=os.urandom(16).hex();sid=supplier(db,p['source']);cid=category(db,p)
   p=store_images(p,Path(args.output).resolve().parent/'rokon-media',args.public_origin,args.account_id)
   db.batch(statements(p,sid,cid,token,int(time.time()*1000)))
   rows=db.query('SELECT p.id,p.active,p.purchase_price_agorot,p.price_agorot FROM products p JOIN rokon_supplier_imports i ON i.product_id=p.id WHERE i.source=? AND i.source_id=?',key)
   if len(rows)!=1 or rows[0]['active']!=0 or rows[0]['purchase_price_agorot']!=p['purchaseAgorot'] or rows[0]['price_agorot']!=p['saleAgorot']:raise RuntimeError('Post-import verification failed')
   report['imported'].append({'source':key[0],'id':key[1],'productId':rows[0]['id']})
   Path(args.output).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
   time.sleep(1)
 Path(args.output).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps({k:len(report[k]) for k in ['ready','unavailable','review','imported','existing','collectionErrors']}))
if __name__=='__main__':main()
