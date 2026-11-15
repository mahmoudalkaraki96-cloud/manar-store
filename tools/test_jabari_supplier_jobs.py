import unittest
from jabari_reprice_once import price,plan
from jabari_weekly import listing,stock_plan,extract
class Checks(unittest.TestCase):
    def test_price(self):
        self.assertEqual([price(x) for x in (1900,2000,2010)],[2100,2200,2300])
    def test_simple(self):
        html='<main id="this-is-product"><h1>Item</h1><div class="price"><del>20₪</del>15₪</div><img src="/upload/test.jpg"><button id="addToCart">Buy</button></main>رقم المنتج 123'
        source=extract(html,123)
        self.assertEqual(plan({'variants':[]},source),(2200,[]))
        self.assertEqual(stock_plan(html,123,[]),(False,[]))
        self.assertEqual(stock_plan(html.replace('Buy','هذا المنتج لم يعد متوفر'),123,[{'id':7}]),(True,[7]))
        with self.assertRaises(ValueError):stock_plan(html,124,[])
    def test_mapping(self):
        local={'variants':[{'id':1,'name':'A','price_agorot':1}]}
        self.assertEqual(plan(local,{'variants':[{'name':'A','price':1900}]})[1][0][1],2100)
        with self.assertRaises(ValueError):plan(local,{'variants':[{'name':'B','price':1900}]})
    def test_listing(self):
        rows,nxt=listing('<a id="link-123"><h2>Item</h2><b class="price">5₪</b></a><a class="pages-next-box" href="?app=product.all..2">Next</a>',1)
        self.assertEqual((rows[0]['source_id'],nxt),(123,2))
if __name__=='__main__':unittest.main()
