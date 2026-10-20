import unittest
import sqlite3
from pathlib import Path
from unittest.mock import patch
import dofesh_missing_draft_import as a

class DB:
    def __init__(self):
        self.c=sqlite3.connect(':memory:');self.c.row_factory=sqlite3.Row
        self.c.executescript(Path(__file__).with_name('fixture-import-schema.sql').read_text(encoding='utf-8'))
        self.c.executescript("""
        CREATE TABLE product_suppliers(product_id INTEGER,supplier_id INTEGER,source_product_id TEXT,source_url TEXT,supplier_price_agorot INTEGER,preferred INTEGER,created_at INTEGER,updated_at INTEGER,UNIQUE(product_id,supplier_id));
        CREATE TABLE product_custom_fields(id INTEGER PRIMARY KEY,product_id INTEGER,label TEXT,placeholder TEXT,max_length INTEGER,required INTEGER,sort_order INTEGER);
        INSERT INTO categories(category_number,name,slug,created_at,updated_at) VALUES(1055,'ستاند','stand',1,1),(1060,'منوع','other',1,1);
        INSERT INTO suppliers(supplier_number,name,created_at,updated_at) VALUES(9101,'دوفش',1,1);
        """)
    def batch(self,ss):
        out=[]
        with self.c:
            for sql,params in ss:
                cur=self.c.execute(sql,params)
                out.append({'results':[dict(r) for r in cur.fetchall()],'meta':{'changes':self.c.execute('SELECT changes()').fetchone()[0]}})
        return out
    def query(self,sql,params=()):return self.batch([(sql,params)])[0]['results']

class Tests(unittest.TestCase):
    def source(self):
        return a.extract(Path(__file__).with_name('fixture-dofesh-1421.html').read_text(encoding='utf-8'),1421)
    def test_real_source_custom_fields_images_variants(self):
        s=self.source()
        self.assertEqual([v['price'] for v in s['variants']],[7500,8500])
        self.assertEqual([f['label'] for f in s['fields']],['اسم البيبي','ملاحظة'])
        self.assertTrue(all(f['required'] for f in s['fields']))
        self.assertTrue(s['images'][0].startswith('https://dofesh.ps/upload/'))
        self.assertNotIn(' ',s['images'][0])
    def test_draft_import_all_components(self):
        db=DB();r=a.import_one(db,1421,self.source(),'apply')
        self.assertEqual(r['status'],'imported_draft')
        self.assertEqual((r['active'],r['stock_quantity'],r['price_agorot']),(0,0,7500))
        self.assertEqual(len(db.query('SELECT * FROM product_custom_fields')),2)
        self.assertEqual(len(db.query('SELECT * FROM product_variants')),2)
        self.assertEqual(len(db.query('SELECT * FROM variant_option_values')),2)
        self.assertEqual(len(db.query('SELECT * FROM audit_logs')),1)
        self.assertTrue(all(v['stock_quantity']==0 for v in db.query('SELECT * FROM product_variants')))
    def test_repeated_import_skips_without_change(self):
        db=DB();a.import_one(db,1421,self.source(),'apply')
        self.assertEqual(a.import_one(db,1421,self.source(),'apply')['status'],'already_present')
        self.assertEqual(len(db.query('SELECT * FROM products')),1)
    def test_name_duplicate_preserved(self):
        db=DB();s=self.source()
        db.query("INSERT INTO products(item_number,name,slug,price_agorot,created_at,updated_at) VALUES(1,?,'manual',100,1,1)",[s['title']])
        self.assertEqual(a.import_one(db,1421,s,'apply')['status'],'possible_name_match')
        self.assertEqual(db.query('SELECT price_agorot FROM products')[0]['price_agorot'],100)
    def test_preview_does_not_write(self):
        db=DB();self.assertEqual(a.import_one(db,1421,self.source(),'preview')['status'],'ready')
        self.assertEqual(db.query('SELECT * FROM products'),[])
    def test_failure_rolls_back_entire_product(self):
        db=DB();s=self.source();sku='dofesh-draft-1421-'+a.hashlib.sha256(s['variants'][0]['name'].encode()).hexdigest()[:16]
        db.query("INSERT INTO products(item_number,name,slug,price_agorot,created_at,updated_at) VALUES(1,'قديم','old',1,1,1)")
        db.query('INSERT INTO product_variants(product_id,sku,created_at,updated_at) VALUES(1,?,1,1)',[sku])
        with self.assertRaises(sqlite3.IntegrityError):a.import_one(db,1421,s,'apply')
        self.assertEqual(len(db.query('SELECT * FROM products')),1)
        self.assertEqual(db.query('SELECT * FROM product_media'),[])
        self.assertEqual(db.query('SELECT * FROM audit_logs'),[])
    def test_deleted_slug_blocks_reimport(self):
        db=DB();db.query("INSERT INTO products(item_number,name,slug,price_agorot,deleted_at,created_at,updated_at) VALUES(1,'قديم','supplier-dofesh-1421',1,2,1,1)")
        self.assertEqual(a.import_one(db,1421,self.source(),'apply')['status'],'duplicate_guard_skipped')
        self.assertEqual(len(db.query('SELECT * FROM products')),1)

if __name__=='__main__':unittest.main()
