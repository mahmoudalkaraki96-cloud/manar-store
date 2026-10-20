import sqlite3
import unittest
import dofesh_weekly as a

def page(body):return '<span>رقم المنتج 42</span><div id="this-is-product"><h1>Test</h1>'+body+'</div>'
def choices():return page('<input type="radio" id="s1" value="A" disabled onclick="changePrice(\'10\',\'10\')"><input type="radio" id="s2" value="B" onclick="changePrice(\'20\',\'20\')"><button id="addToCart">Buy</button>')
class DB:
 def __init__(self):
  self.c=sqlite3.connect(':memory:');self.c.row_factory=sqlite3.Row
  self.c.executescript("""CREATE TABLE products(id,item_number,name,stock_quantity,updated_at,deleted_at,price_agorot,active);
  CREATE TABLE product_variants(id,product_id,stock_quantity,updated_at,price_agorot,active);
  CREATE TABLE variant_option_values(variant_id,option_value_id);
  CREATE TABLE product_option_values(id,value);
  CREATE TABLE audit_logs(entity_type,entity_id,action TEXT NOT NULL,details_json,created_at);
  INSERT INTO products VALUES(1,1001,'Test',10000,1,NULL,5000,1);
  INSERT INTO product_variants VALUES(11,1,10000,1,1000,1),(12,1,80,1,2000,1);
  INSERT INTO product_option_values VALUES(1,'A'),(2,'B');
  INSERT INTO variant_option_values VALUES(11,1),(12,2);""")
 def query(self,s,p=()):return [dict(r) for r in self.c.execute(s,p).fetchall()]
 def batch(self,ss):
  with self.c:
   for s,p in ss:self.c.execute(s,p)
class Tests(unittest.TestCase):
 def test_only_unavailable_variant_zeroed(self):
  db=DB();a.zero_stock(db,1,choices(),42,True)
  self.assertEqual([v['stock_quantity'] for v in db.query('SELECT * FROM product_variants ORDER BY id')],[0,80])
  p=db.query('SELECT * FROM products')[0];self.assertEqual((p['stock_quantity'],p['price_agorot'],p['active']),(10000,5000,1))
 def test_explicit_soldout_zeros_whole_product(self):
  db=DB();a.zero_stock(db,1,page('هذا المنتج لم يعد متوفر'),42,True)
  self.assertEqual(db.query('SELECT stock_quantity FROM products')[0]['stock_quantity'],0)
  self.assertTrue(all(v['stock_quantity']==0 for v in db.query('SELECT * FROM product_variants')))
 def test_preview_does_not_write(self):
  db=DB();a.zero_stock(db,1,choices(),42,False)
  self.assertEqual(db.query('SELECT stock_quantity FROM product_variants WHERE id=11')[0]['stock_quantity'],10000)
 def test_identity_error_no_change(self):
  db=DB()
  with self.assertRaises(ValueError):a.zero_stock(db,1,page('هذا المنتج لم يعد متوفر'),99,True)
  self.assertEqual(db.query('SELECT stock_quantity FROM products')[0]['stock_quantity'],10000)
 def test_available_never_replenishes(self):
  db=DB();db.c.execute('UPDATE product_variants SET stock_quantity=0 WHERE id=12');db.c.commit();a.zero_stock(db,1,choices(),42,True)
  self.assertEqual(db.query('SELECT stock_quantity FROM product_variants WHERE id=12')[0]['stock_quantity'],0)
 def test_concurrent_stock_edit_rolls_back(self):
  db=DB();old=db.batch
  def concurrent(ss):
   db.c.execute('UPDATE product_variants SET stock_quantity=50 WHERE id=11');db.c.commit();old(ss)
  db.batch=concurrent
  with self.assertRaises(sqlite3.IntegrityError):a.zero_stock(db,1,page('هذا المنتج لم يعد متوفر'),42,True)
  self.assertEqual(db.query('SELECT stock_quantity FROM products')[0]['stock_quantity'],10000)
  self.assertEqual(len(db.query('SELECT * FROM audit_logs')),0)
 def test_disabled_simple_button_not_proof(self):
  self.assertEqual(a.stock_plan(page('<span class="price">10 ₪</span><button id="addToCart" disabled>Buy</button>'),42,[]),(False,[]))
if __name__=='__main__':unittest.main()
