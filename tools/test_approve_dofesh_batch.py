import unittest,sqlite3,json
from pathlib import Path
import approve_dofesh_batch as a
class DB:
 def __init__(self):
  self.c=sqlite3.connect(':memory:');self.c.row_factory=sqlite3.Row
  self.c.executescript("""CREATE TABLE products(id,item_number,name,active,price_agorot,stock_quantity,updated_at,deleted_at);
  CREATE TABLE product_media(id,product_id,url,updated_at);
  CREATE TABLE image_ai_items(batch_id,media_id,product_id,item_number,generated_url,original_url,status,updated_at);
  CREATE TABLE audit_logs(entity_type,entity_id,action TEXT NOT NULL,details_json,created_at);
  INSERT INTO products VALUES(1,4785,'test',0,7500,0,10,NULL);
  INSERT INTO product_media VALUES(2,1,'/media/original.png',10);
  INSERT INTO image_ai_items VALUES('batch_test',2,1,4785,'/media/edited/batch-v2/product-1-media-2.webp','/media/original.png','pending_review',10);
  """)
 def query(self,s,p=()):return [dict(r) for r in self.c.execute(s,p).fetchall()]
 def batch(self,ss):
  with self.c:
   for s,p in ss:self.c.execute(s,p)
class Tests(unittest.TestCase):
 def test_approve_publish_without_price_or_stock_change(self):
  db=DB();r=a.publish(db,'batch_test',[4785])[0]
  self.assertEqual((r['active'],r['price_agorot'],r['stock_quantity']),(1,7500,0))
  self.assertEqual(db.query('SELECT status FROM image_ai_items')[0]['status'],'published')
  self.assertEqual(len(db.query('SELECT * FROM audit_logs')),1)
 def test_unselected_product_not_modified(self):
  db=DB();db.c.execute("INSERT INTO products VALUES(9,4799,'other',0,1,9,1,NULL)");db.c.commit()
  a.publish(db,'batch_test',[4785])
  self.assertEqual(db.query('SELECT active FROM products WHERE id=9')[0]['active'],0)
 def test_changed_image_refused(self):
  db=DB();db.c.execute("UPDATE product_media SET url='different'");db.c.commit()
  with self.assertRaises(ValueError):a.publish(db,'batch_test',[4785])
  self.assertEqual(db.query('SELECT active FROM products')[0]['active'],0)
 def test_concurrent_change_rolls_back(self):
  db=DB();old=db.batch
  def concurrent(ss):
   db.c.execute('UPDATE products SET updated_at=99');db.c.commit();old(ss)
  db.batch=concurrent
  with self.assertRaises(sqlite3.IntegrityError):a.publish(db,'batch_test',[4785])
  self.assertEqual(db.query('SELECT active FROM products')[0]['active'],0)
  self.assertEqual(db.query('SELECT status FROM image_ai_items')[0]['status'],'pending_review')
if __name__=='__main__':unittest.main()
