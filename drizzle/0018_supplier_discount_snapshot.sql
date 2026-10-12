-- Keep discounted snapshot prices, excluding crossed-out homepage prices.
UPDATE supplier_import_seed SET data=json_set(data,'$.price','1.5₪') WHERE source='jabari' AND source_id=4347;
UPDATE products SET purchase_price_agorot=150,price_agorot=200 WHERE slug='supplier-jabari-4347' AND active=0;
UPDATE product_suppliers SET supplier_price_agorot=150 WHERE source_product_id='4347' AND supplier_id=(SELECT id FROM suppliers WHERE supplier_number=9102);
UPDATE supplier_import_seed SET data=json_set(data,'$.price','1.5₪') WHERE source='jabari' AND source_id=4346;
UPDATE products SET purchase_price_agorot=150,price_agorot=200 WHERE slug='supplier-jabari-4346' AND active=0;
UPDATE product_suppliers SET supplier_price_agorot=150 WHERE source_product_id='4346' AND supplier_id=(SELECT id FROM suppliers WHERE supplier_number=9102);
UPDATE supplier_import_seed SET data=json_set(data,'$.price','20₪') WHERE source='jabari' AND source_id=4246;
UPDATE products SET purchase_price_agorot=2000,price_agorot=2150 WHERE slug='supplier-jabari-4246' AND active=0;
UPDATE product_suppliers SET supplier_price_agorot=2000 WHERE source_product_id='4246' AND supplier_id=(SELECT id FROM suppliers WHERE supplier_number=9102);
UPDATE supplier_import_seed SET data=json_set(data,'$.price','20₪') WHERE source='jabari' AND source_id=4244;
UPDATE products SET purchase_price_agorot=2000,price_agorot=2150 WHERE slug='supplier-jabari-4244' AND active=0;
UPDATE product_suppliers SET supplier_price_agorot=2000 WHERE source_product_id='4244' AND supplier_id=(SELECT id FROM suppliers WHERE supplier_number=9102);
UPDATE supplier_import_seed SET data=json_set(data,'$.price','10₪') WHERE source='jabari' AND source_id=3733;
UPDATE products SET purchase_price_agorot=1000,price_agorot=1100 WHERE slug='supplier-jabari-3733' AND active=0;
UPDATE product_suppliers SET supplier_price_agorot=1000 WHERE source_product_id='3733' AND supplier_id=(SELECT id FROM suppliers WHERE supplier_number=9102);
