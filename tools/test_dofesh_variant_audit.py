import sqlite3
import unittest
from pathlib import Path
import dofesh_variant_audit as a


def page(radios='', custom='', sid=1298):
    return f'''<div id="this-is-product"><h1>منتج</h1><div class="price">6₪</div>{radios}{custom}<input id="quantity" type="number" min="1"></div><p>رقم المنتج</p><span>{sid}</span>'''


def radio(id, value, price=None, disabled=False):
    click = f"changePrice('{price}','');" if price else 'showSize(0);'
    return f'''<input type="radio" id="{id}" value="{value}" onclick="{click}" {'disabled' if disabled else ''}>'''


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
        INSERT INTO product_keywords VALUES(1,'dofesh-1298');
        INSERT INTO product_media VALUES(1,1,'/media/original.webp',NULL,0,1);
        '''+a.SCHEMA)
        self.c.execute("UPDATE dofesh_variant_audit_lock SET token='test',expires_at=9999999999999")
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


class Tests(unittest.TestCase):
    def test_actual_supplier_html(self):
        s=a.parse_product(Path(__file__).with_name('fixture-1298.html').read_text(encoding='utf-8'),1298)
        self.assertEqual([v['price'] for v in s['variants']],[600,25000,50000])
        self.assertFalse(s['custom_fields'])

    def source(self):
        return a.parse_product(page(radio('s0','بالحبة','6')+radio('s1','50 حبة','250')),1298)

    def test_realistic_single_dimension(self):
        self.assertEqual([v['price'] for v in self.source()['variants']],[600,25000])

    def test_two_dimensions(self):
        s=a.parse_product(page(radio('c0','10 قطع')+radio('c0s0','ذهبي','18')+radio('c0s1','فضي','18')),1298)
        self.assertEqual(s['variants'][1]['name'],'10 قطعة / فضي')

    def test_equivalent_existing_labels_do_not_duplicate(self):
        self.assertEqual(a.norm('١٠ حبات'),a.norm('10 حبة'))
        self.assertEqual(a.norm('أبيض'),a.norm('ابيض'))

    def test_related_products_excluded(self):
        s=a.parse_product(page()+radio('s99','unrelated','99'),1298)
        self.assertEqual(s['variants'],[])

    def test_block(self):
        with self.assertRaises(a.SupplierBlocked):a.parse_product('403 Forbidden',1298)

    def test_bad_identity(self):
        with self.assertRaises(ValueError):a.parse_product(page(sid=1),1298)

    def test_unknown_structure(self):
        with self.assertRaises(ValueError):a.parse_product(page(radio('unexpected','x','1')),1298)

    def test_missing_price(self):
        with self.assertRaises(ValueError):a.parse_product(page(radio('s0','x')),1298)

    def test_custom_fields_stop(self):
        db=LocalDB();s=a.parse_product(page(custom='<input type="text" required>'),1298)
        self.assertEqual(a.decide(a.snapshot(db,1),s),'unsupported_customization_or_minimum')

    def test_sync_price_and_add_preserves_image_publish(self):
        db=LocalDB();before=a.snapshot(db,1)
        a.apply_variants(db,1298,before,self.source(),'test',10000)
        after=a.snapshot(db,1)
        self.assertEqual(after['price_agorot'],600)
        self.assertEqual(after['media'],before['media'])
        self.assertEqual(after['active'],1)
        self.assertEqual(len(after['variants']),2)

    def test_repeated_apply_cannot_duplicate(self):
        db=LocalDB();a.apply_variants(db,1298,a.snapshot(db,1),self.source(),'test',10000)
        with self.assertRaises(sqlite3.IntegrityError):a.apply_variants(db,1298,a.snapshot(db,1),self.source(),'test',10000)
        self.assertEqual(len(a.snapshot(db,1)['variants']),2)

    def test_concurrent_change_guard(self):
        db=LocalDB();before=a.snapshot(db,1)
        db.query('UPDATE products SET updated_at=101 WHERE id=1')
        with self.assertRaises(RuntimeError):a.apply_variants(db,1298,before,self.source(),'test',10000)
        self.assertEqual(len(a.snapshot(db,1)['variants']),0)
        self.assertEqual(db.query('SELECT * FROM product_options'),[])

    def test_batch_rolls_back_on_failure(self):
        db=LocalDB();db.query("INSERT INTO product_variants VALUES(99,99,'dofesh-audit-1298-1',1,NULL,1,1,1,1)")
        with self.assertRaises(sqlite3.IntegrityError):a.apply_variants(db,1298,a.snapshot(db,1),self.source(),'test',10000)
        self.assertEqual(db.query('SELECT * FROM product_options'),[])
        self.assertEqual(db.query('SELECT * FROM dofesh_variant_audit'),[])

    def test_disabled_keeps_unavailable(self):
        db=LocalDB();s=a.parse_product(page(radio('s0','فضي','6',True)),1298)
        a.apply_variants(db,1298,a.snapshot(db,1),s,'test',10000)
        v=a.snapshot(db,1)['variants'][0]
        self.assertEqual((v['active'],v['stock_quantity']),(0,0))

    def test_existing_variant_price_updates_without_stock_change(self):
        db=LocalDB();s=self.source();a.apply_variants(db,1298,a.snapshot(db,1),s,'test',10000)
        db.query("DELETE FROM dofesh_variant_audit")
        db.query('UPDATE product_variants SET stock_quantity=17 WHERE id=1')
        s['variants'][0]['price']=800
        a.apply_variants(db,1298,a.snapshot(db,1),s,'test',10000)
        after=a.snapshot(db,1)
        self.assertEqual(len(after['variants']),2)
        self.assertEqual((after['variants'][0]['price_agorot'],after['variants'][0]['stock_quantity']),(800,17))

    def test_simple_price_updates(self):
        db=LocalDB();s=a.parse_product(page(),1298)
        a.apply_variants(db,1298,a.snapshot(db,1),s,'test',10000)
        self.assertEqual(a.snapshot(db,1)['price_agorot'],600)
        self.assertEqual(db.query('SELECT * FROM product_options'),[])


if __name__=='__main__':unittest.main()
