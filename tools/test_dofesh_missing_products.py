import unittest
import json
from pathlib import Path
from unittest.mock import patch
import dofesh_missing_products as a

class DB:
    def query(self,sql,params=()):
        if 'FROM products WHERE' in sql:
            return [
                {'id':1,'item_number':1001,'name':'موجود','slug':'supplier-dofesh-1','active':0},
                {'id':2,'item_number':1002,'name':'اسم مطابق','slug':'manual','active':1}]
        if 'FROM product_keywords' in sql:return [{'product_id':1,'keyword':'dofesh-2'}]
        if 'FROM product_suppliers' in sql:return [{'product_id':1,'source_product_id':'3','source_url':'https://dofesh.ps/?app=product.show.4'}]
        raise AssertionError(sql)

class Tests(unittest.TestCase):
    def test_live_listing_fixture(self):
        cards,nxt=a.listing(Path(__file__).with_name('fixture-dofesh-listing.html').read_text(encoding='utf-8'),1)
        self.assertEqual([c['source_id'] for c in cards],[1421,1420,1419])
        self.assertEqual(nxt,2)
        self.assertIn('75',cards[0]['price'])

    def test_json_fragments_and_sale_price(self):
        card='<a id="link-4"><h2>اسم</h2><div class="price"><del>10</del>8₪</div></a>'
        cards,nxt=a.listing(json.dumps({'html':card}),1)
        self.assertEqual(cards[0]['price'],'8₪')
        self.assertIsNone(nxt)

    def test_block_empty_and_bad_pagination(self):
        with self.assertRaises(a.SupplierBlocked):a.listing('403 Forbidden',1)
        with self.assertRaises(ValueError):a.listing('<h1>Empty</h1>',1)
        with self.assertRaises(ValueError):a.listing('<a id="link-1"><h2>x</h2><div class="price">1</div></a><a class="pages-next-box" href="?app=product.all..1">next</a>',1)

    def test_all_mapping_paths_and_drafts_are_present(self):
        cards={str(i):{'source_id':i,'name':'other'} for i in range(1,5)}
        rows=a.compare(cards,{},DB())
        self.assertTrue(all(r['status']=='present' for r in rows))
        self.assertTrue(all(r['local_publication']=='draft' for r in rows))

    def test_same_name_is_not_confirmed_missing(self):
        cards={'5':{'source_id':5,'name':'اسم مطابق'},'6':{'source_id':6,'name':'ناقص'}}
        rows={r['source_id']:r for r in a.compare(cards,{},DB())}
        self.assertEqual(rows[5]['status'],'possible_name_match')
        self.assertEqual(rows[6]['status'],'missing')

    def test_readonly_rejects_writes_before_network(self):
        db=a.ReadOnlyD1.__new__(a.ReadOnlyD1)
        with self.assertRaises(ValueError):db.query('UPDATE products SET active=1')

    def page(self,body,sid=174):
        return '<div id="this-is-product"><h1>صندوق</h1>'+body+'</div><p>رقم المنتج</p><span>'+str(sid)+'</span>'

    def test_unavailable_banner_and_all_disabled(self):
        p=self.page('هذا المنتج لم يعد متوفر في متجرنا<input type="radio" disabled value=""><button id="addToCart">شراء</button>')
        with patch.object(a,'ZoneInfo',lambda _:__import__('datetime').timezone.utc):
            self.assertEqual(a.availability(p,174)['availability'],'unavailable')

    def test_available_and_identity_guard(self):
        p=self.page('<button id="addToCart">شراء</button>')
        with patch.object(a,'ZoneInfo',lambda _:__import__('datetime').timezone.utc):
            self.assertEqual(a.availability(p,174)['availability'],'available')
            with self.assertRaises(ValueError):a.availability(p,175)

if __name__=='__main__':unittest.main()
