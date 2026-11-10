import copy,json,sqlite3,unittest
from pathlib import Path
import rokon_import as r

def product():
 return {'source':'alsultan-co.com','sourceId':'1093','sourceUrl':'https://alsultan-co.com/?app=product.show.1093','name':'عينة حجر','purchaseAgorot':6500,'saleBeforeAgorot':8000,'available':True,'images':[],'allImages':['https://alsultan-co.com/upload/main.jpg'],'variants':[{'sourceKey':'c0s0','name':'أبيض / كبير','available':True,'purchaseAgorot':6500,'saleBeforeAgorot':8000,'images':['https://alsultan-co.com/upload/white.jpg'],'notes':'المقاس 20 سم'},{'sourceKey':'c1s0','name':'زهري / كبير','available':False,'purchaseAgorot':6500,'saleBeforeAgorot':8000,'images':['https://alsultan-co.com/upload/pink.jpg']}],'description':'وصف كامل','notes':'ملاحظة عامة','properties':[{'label':'الخامة','value':'حجر'}],'customFields':[{'label':'الاسم','type':'text','required':False,'maxLength':60}]}
class Tests(unittest.TestCase):
 def test_pricing(self):
  self.assertEqual(r.sale_price(6500,8000),8000)
  self.assertEqual(r.sale_price(1200,1200),1500)
  self.assertEqual(r.sale_price(1500,1500),1800)
  self.assertEqual(r.sale_price(101,101),200)
  for a,b in [(0,0),(100,50),(True,100),(1.2,100)]:
   with self.assertRaises(ValueError):r.sale_price(a,b)
 def test_draft_available_only_and_no_mutation(self):
  source=product();p=r.prepare(source);self.assertFalse(p['active']);self.assertEqual([v['stock'] for v in p['variants']],[100,0]);self.assertNotIn('stock',source['variants'][0])
  source['available']=False;self.assertIsNone(r.prepare(source))
 def test_unverified_source_or_fields_blocked(self):
  for update in [{'source':'dofesh.ps'},{'sourceUrl':'https://alsultan-co.com/?app=product.show.999'},{'review':['unsupported_custom_fields']},{'images':['http://alsultan-co.com/upload/x']}]:
   with self.assertRaises(ValueError):r.prepare({**product(),**update})
 def test_sql_actual_schema_variant_cost_media_metadata_and_rollback(self):
  root=Path(__file__).resolve().parents[2];baseline=root/'db/store-baseline.sql'
  if not baseline.exists():baseline=root/'work/media-stock-1.7.4/db/store-baseline.sql'
  db=sqlite3.connect(':memory:');db.executescript(baseline.read_text(encoding='utf-8'));db.execute(r.SCHEMA)
  db.execute("INSERT INTO suppliers(supplier_number,name,active,created_at,updated_at) VALUES(1,'مورد',1,0,0)");db.commit()
  p=r.prepare(product());statements=r.statements(p,1,None,'token',0)
  with db:
   for sql,params in statements:db.execute(sql,params)
  row=db.execute('SELECT active,stock_quantity,price_agorot,purchase_price_agorot,description,specifications FROM products').fetchone()
  self.assertEqual(row[:4],(0,100,8000,6500));self.assertIn('ملاحظة عامة',row[4]);self.assertIn('المقاس 20 سم',row[5])
  self.assertEqual(db.execute('SELECT stock_quantity,active,purchase_price_agorot FROM product_variants ORDER BY id').fetchall(),[(100,1,6500),(0,0,6500)])
  self.assertEqual(db.execute('SELECT COUNT(*) FROM variant_option_values').fetchone()[0],2)
  self.assertEqual(db.execute('SELECT COUNT(*) FROM product_media WHERE variant_id IS NOT NULL').fetchone()[0],2)
  self.assertEqual(db.execute('SELECT source_product_id,source_url FROM product_suppliers').fetchone(),('1093',product()['sourceUrl']))
  self.assertEqual(db.execute('SELECT state FROM rokon_supplier_imports').fetchone()[0],'complete')
  with self.assertRaises(sqlite3.IntegrityError):
   with db:
    for sql,params in statements:db.execute(sql,params)
  self.assertEqual(db.execute('SELECT COUNT(*) FROM products').fetchone()[0],1)
  fresh=r.prepare({**product(),'sourceId':'1094','sourceUrl':'https://alsultan-co.com/?app=product.show.1094'});s=r.statements(fresh,1,None,'failed',0)
  with self.assertRaises(sqlite3.IntegrityError):
   with db:
    for sql,params in s:db.execute(sql,params)
    db.execute("INSERT INTO suppliers(supplier_number,name,active,created_at,updated_at) VALUES(1,'duplicate',1,0,0)")
  self.assertEqual(db.execute('SELECT COUNT(*) FROM products').fetchone()[0],1)
 def test_cross_store_database_guard_before_writes(self):
  client=r.Cloudflare.__new__(r.Cloudflare);client.database='x';client.call=lambda path:{'name':'manar-store-db'}
  with self.assertRaisesRegex(RuntimeError,'Refusing'):client.verify()
 def test_tammouni_paths_cdn_scope_and_stock(self):
  p=product();p.update(source='tammouni-home.com',sourceUrl='https://tammouni-home.com/product/sample/')
  for v in p['variants']:v['images']=['https://cdn.treesal.com/altammuni/uploads/2026/11/a.webp']
  prepared=r.prepare(p);self.assertEqual(prepared['variants'][0]['stock'],100)
  self.assertEqual(r.media_url(p['variants'][0]['images'][0],p['source']),p['variants'][0]['images'][0])
  with self.assertRaises(ValueError):r.media_url('https://cdn.treesal.com/another/uploads/a.webp',p['source'])
if __name__=='__main__':unittest.main()
