import sqlite3
import unittest
import json
from pathlib import Path
from unittest.mock import patch
from datetime import timezone
import jabari_variant_audit as a

class LocalDB:
    def __init__(self):
        self.c=sqlite3.connect(':memory:')
        self.c.row_factory=sqlite3.Row
        self.c.executescript('''
        PRAGMA foreign_keys=ON;
        CREATE TABLE products(id INTEGER PRIMARY KEY,item_number INTEGER,name TEXT,price_agorot INTEGER,active INTEGER,updated_at INTEGER,deleted_at INTEGER);
        CREATE TABLE product_keywords(product_id INTEGER,keyword TEXT);
        CREATE TABLE product_options(id INTEGER PRIMARY KEY,product_id INTEGER,name TEXT,display_type TEXT,sort_order INTEGER);
        CREATE TABLE product_option_values(id INTEGER PRIMARY KEY,option_id INTEGER REFERENCES product_options(id),value TEXT,color_hex TEXT,sort_order INTEGER);
        CREATE TABLE product_variants(id INTEGER PRIMARY KEY,product_id INTEGER,sku TEXT UNIQUE,price_agorot INTEGER,wholesale_price_agorot INTEGER,stock_quantity INTEGER,active INTEGER,created_at INTEGER,updated_at INTEGER);
        CREATE TABLE variant_option_values(variant_id INTEGER REFERENCES product_variants(id),option_value_id INTEGER REFERENCES product_option_values(id),PRIMARY KEY(variant_id,option_value_id));
        CREATE TABLE product_custom_fields(id INTEGER PRIMARY KEY,product_id INTEGER);
        CREATE TABLE product_media(id INTEGER PRIMARY KEY,product_id INTEGER,url TEXT,variant_id INTEGER,sort_order INTEGER,is_primary INTEGER);
        INSERT INTO products VALUES(1,1240,'منتج',700,1,100,NULL);
        INSERT INTO product_keywords VALUES(1,'jabari-1298');
        INSERT INTO product_media VALUES(1,1,'/media/original.webp',NULL,0,1);
        '''+a.SCHEMA)
        self.c.execute("UPDATE jabari_variant_audit_lock SET token='test',expires_at=9999999999999")
        self.c.commit()

    def batch(self, statements):
        out=[]
        with self.c:
            for sql, params in statements:
                cur=self.c.execute(sql,params)
                out.append({'results':[dict(r) for r in cur.fetchall()], 'meta':{'changes':self.c.execute('SELECT changes()').fetchone()[0]}})
        return out

    def query(self, sql, params=()):
        return self.batch([(sql,params)])[0]['results']


def source():
    return {'title':'منتج','variants':[
        {'name':'50 قطعة','price':1500,'active':True},
        {'name':'100 قطعة','price':2500,'active':True}],
        'custom_fields':False,'minimum':1}

class Tests(unittest.TestCase):
    def test_real_supplier_html(self):
        s=a.parse_product(Path(__file__).with_name('fixture-jabari-3780.html').read_text(encoding='utf-8'),3780)
        self.assertEqual([v['price'] for v in s['variants']],[1500,2500,4500])
        self.assertFalse(s['custom_fields'])

    def test_exact_import_markup_boundaries(self):
        for cost,expected in [(100,150),(500,550),(501,601),(1000,1100),(1001,1151),
                              (3000,3150),(3001,3201),(7000,7200),(7001,7501),
                              (10000,10500),(10001,11001)]:
            self.assertEqual(a.sale_price(cost),expected)

    def test_add_preserves_price_photo_publication(self):
        db=LocalDB();before=a.snapshot(db,1)
        a.apply_variants(db,1298,before,source(),'test',10000)
        after=a.snapshot(db,1)
        self.assertEqual(after['price_agorot'],700)
        self.assertEqual(after['media'],before['media'])
        self.assertEqual(after['active'],1)
        self.assertEqual([v['price_agorot'] for v in after['variants']],[1650,2650])
        self.assertEqual(a.decide(after,source()),'matched')

    def test_existing_variant_entirely_preserved(self):
        db=LocalDB()
        a.apply_variants(db,1298,a.snapshot(db,1),source(),'test',10000)
        db.query('DELETE FROM jabari_variant_audit')
        db.query('UPDATE product_variants SET price_agorot=9999,stock_quantity=17,active=0 WHERE id=1')
        before=a.snapshot(db,1)
        s=source();s['variants'].append({'name':'200 قطعة','price':4500,'active':True})
        a.apply_variants(db,1298,before,s,'test',10000)
        after=a.snapshot(db,1)
        self.assertEqual(after['variants'][:2],before['variants'])
        self.assertEqual(after['variants'][2]['price_agorot'],4700)
        self.assertEqual(after['price_agorot'],before['price_agorot'])

    def test_existing_different_prices_already_matched(self):
        db=LocalDB();a.apply_variants(db,1298,a.snapshot(db,1),source(),'test',10000)
        db.query('UPDATE product_variants SET price_agorot=9999')
        self.assertEqual(a.decide(a.snapshot(db,1),source()),'matched')

    def test_simple_product_never_updates_price(self):
        db=LocalDB()
        self.assertEqual(a.decide(a.snapshot(db,1),dict(source(),variants=[],simple_price=1)),'no_options')

    def test_drafts_remain_unpublished_with_zero_new_stock(self):
        db=LocalDB();db.query('UPDATE products SET active=0')
        a.apply_variants(db,1298,a.snapshot(db,1),source(),'test',10000)
        after=a.snapshot(db,1)
        self.assertEqual(after['active'],0)
        self.assertEqual([v['stock_quantity'] for v in after['variants']],[0,0])

    def test_block_and_missing(self):
        with self.assertRaises(a.SupplierBlocked):a.parse_product('403 Forbidden',1298)
        with self.assertRaises(a.SupplierMissing):a.parse_product('الصفحة المطلوبة غير متوفرة',1298)

    def test_source_mapping_guard_rolls_back(self):
        db=LocalDB();db.query("UPDATE product_keywords SET keyword='dofesh-1298'")
        with self.assertRaises(RuntimeError):a.apply_variants(db,1298,a.snapshot(db,1),source(),'test',10000)
        self.assertEqual(db.query('SELECT * FROM product_options'),[])

    def test_concurrent_change_guard(self):
        db=LocalDB();p=a.snapshot(db,1);db.query('UPDATE products SET updated_at=101')
        with self.assertRaises(RuntimeError):a.apply_variants(db,1298,p,source(),'test',10000)
        self.assertEqual(db.query('SELECT * FROM product_variants'),[])

    def test_atomic_rollback_and_idempotency(self):
        db=LocalDB();a.apply_variants(db,1298,a.snapshot(db,1),source(),'test',10000)
        with self.assertRaises(ValueError):a.apply_variants(db,1298,a.snapshot(db,1),source(),'test',10000)
        self.assertEqual(len(a.snapshot(db,1)['variants']),2)

    def test_report_uses_preserved_prices_and_recovers_unlogged(self):
        db=LocalDB();a.apply_variants(db,1298,a.snapshot(db,1),source(),'test',10000)
        with patch.object(a,'ZoneInfo',lambda _:timezone.utc):
            folder=Path('test-report-output');folder.mkdir(exist_ok=True)
            progress=folder/'progress.md';progress.write_text('# log\n',encoding='utf-8')
            a.report(db,folder,'apply','completed_batch','different-token',progress)
            self.assertIn('الجعبري#1298',progress.read_text(encoding='utf-8'))
            html=(folder/'changed-products.html').read_text(encoding='utf-8')
            self.assertIn('السعر الأساسي: 7 ₪',html)
            self.assertIn('16.5 ₪',html)
            data=json.loads(db.query('SELECT detail FROM jabari_variant_audit')[0]['detail'])
            self.assertTrue(data['prices_preserved'])
            self.assertEqual(data['added_variants'][0]['supplier_price'],1500)

if __name__=='__main__':unittest.main()
