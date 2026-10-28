const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {stripTypeScriptTypes}=require("node:module");
const {DatabaseSync}=require("node:sqlite");
const modulePromise=import("data:text/javascript;base64,"+Buffer.from(stripTypeScriptTypes(fs.readFileSync("worker/order-edit.ts","utf8"),{mode:"transform"})).toString("base64"));
function fixture(){
 const sql=new DatabaseSync(":memory:");
 sql.exec(`CREATE TABLE orders(id INTEGER PRIMARY KEY,status TEXT,subtotal_agorot INTEGER,shipping_agorot INTEGER,discount_agorot INTEGER,total_agorot INTEGER,updated_at INTEGER,deleted_at INTEGER);
 CREATE TABLE products(id INTEGER PRIMARY KEY,item_number INTEGER,name TEXT,stock_quantity INTEGER,order_count INTEGER,updated_at INTEGER,deleted_at INTEGER);
 CREATE TABLE product_variants(id INTEGER PRIMARY KEY,product_id INTEGER,active INTEGER,stock_quantity INTEGER,updated_at INTEGER);
 CREATE TABLE product_option_values(id INTEGER PRIMARY KEY,value TEXT);
 CREATE TABLE variant_option_values(variant_id INTEGER,option_value_id INTEGER);
 CREATE TABLE product_custom_fields(product_id INTEGER,label TEXT,max_length INTEGER,required INTEGER,sort_order INTEGER,id INTEGER);
 CREATE TABLE order_items(id INTEGER PRIMARY KEY AUTOINCREMENT,order_id INTEGER,product_id INTEGER,variant_id INTEGER,item_number INTEGER,product_name TEXT,variant_label TEXT,customization_json TEXT,notes TEXT,quantity INTEGER,unit_price_agorot INTEGER,line_total_agorot INTEGER);
 CREATE TABLE order_extra_fees(order_id INTEGER,label TEXT,amount_agorot INTEGER,created_at INTEGER);
 INSERT INTO orders VALUES(1,'new',2500,0,0,2500,1,NULL);
 INSERT INTO products VALUES(1,100,'منتج',10,0,1,NULL),(2,101,'خيارات',20,0,1,NULL);
 INSERT INTO product_variants VALUES(10,2,1,10,1),(11,2,1,8,1);
 INSERT INTO product_option_values VALUES(1,'أحمر'),(2,'أزرق');
 INSERT INTO variant_option_values VALUES(10,1),(11,2);
 INSERT INTO order_items VALUES(1,1,1,NULL,100,'اسم محفوظ',NULL,'{"نص":"ذكرى"}','ملاحظة محفوظة',2,1250,2500);`);
 sql.exec(fs.readFileSync("drizzle/0026_admin_order_edit.sql","utf8"));
 const db={sql,beforeBatch:null,prepare(query){return {values:[],bind(...values){this.values=values;return this},async first(){return sql.prepare(query).get(...this.values)||null},async all(){return {results:sql.prepare(query).all(...this.values)}},async run(){return sql.prepare(query).run(...this.values)},query}},async batch(statements){if(this.beforeBatch){const fn=this.beforeBatch;this.beforeBatch=null;fn()}sql.exec("BEGIN IMMEDIATE");try{for(const s of statements)sql.prepare(s.query).run(...s.values);sql.exec("COMMIT")}catch(e){sql.exec("ROLLBACK");throw e}}};return db;
}
const row=db=>db.sql.prepare("SELECT * FROM orders WHERE id=1").get();
const items=db=>db.sql.prepare("SELECT * FROM order_items WHERE order_id=1").all();
const stock=(db,id=1)=>db.sql.prepare("SELECT stock_quantity FROM products WHERE id=?").get(id).stock_quantity;
test("manual items, fractional prices, discount and customizations are saved accurately",async()=>{
 const {saveOrderEdit}=await modulePromise,db=fixture();
 await saveOrderEdit(db,1,{editVersion:0,items:[{id:1,quantity:3,unitPrice:1.25},{productId:null,productName:"صنف يدوي",quantity:2,unitPrice:2.35}],shipping:5,discount:1.25,extraFees:[{label:"تغليف",amount:1.5}]});
 assert.equal(row(db).subtotal_agorot,845);assert.equal(row(db).total_agorot,1370);assert.equal(stock(db),10);
 assert.equal(items(db)[0].customization_json,'{"نص":"ذكرى"}');assert.equal(items(db)[0].notes,"ملاحظة محفوظة");assert.equal(items(db)[1].product_id,null);
});
test("confirmation, quantity edits, cancellation and reconfirmation apply only stock differences",async()=>{
 const {saveOrderEdit}=await modulePromise,db=fixture();
 await saveOrderEdit(db,1,{status:"confirmed"});assert.equal(stock(db),8);
 await saveOrderEdit(db,1,{editVersion:1,items:[{id:1,quantity:4,unitPrice:12.5}]});assert.equal(stock(db),6);
 const line=items(db)[0];
 await saveOrderEdit(db,1,{editVersion:2,items:[{id:line.id,quantity:1,unitPrice:12.5}]});assert.equal(stock(db),9);
 await saveOrderEdit(db,1,{status:"cancelled"});assert.equal(stock(db),10);
 await saveOrderEdit(db,1,{status:"confirmed"});assert.equal(stock(db),9);
 await saveOrderEdit(db,1,{status:"preparing"});assert.equal(stock(db),9);
});
test("duplicate variant lines aggregate stock and insufficient stock rolls back header/items/stock",async()=>{
 const {saveOrderEdit}=await modulePromise,db=fixture();
 const body={editVersion:0,status:"confirmed",items:[{productId:2,variantId:10,quantity:6,unitPrice:2},{productId:2,variantId:10,quantity:6,unitPrice:2}]};
 await assert.rejects(saveOrderEdit(db,1,body),e=>e.status===409);
 assert.equal(row(db).edit_version,0);assert.equal(items(db)[0].id,1);assert.equal(stock(db),10);assert.equal(db.sql.prepare("SELECT stock_quantity FROM product_variants WHERE id=10").get().stock_quantity,10);
});
test("concurrent version change rolls back entire edit and stale requests are rejected",async()=>{
 const {saveOrderEdit}=await modulePromise,db=fixture();
 db.beforeBatch=()=>db.sql.exec("UPDATE orders SET edit_version=1");
 await assert.rejects(saveOrderEdit(db,1,{editVersion:0,status:"confirmed",items:[{id:1,quantity:3,unitPrice:12.5}]}),e=>e.status===409);
 assert.equal(row(db).status,"new");assert.equal(stock(db),10);assert.equal(items(db)[0].quantity,2);
 await assert.rejects(saveOrderEdit(db,1,{editVersion:0,shipping:5}),e=>e.status===409);
});
test("rejects foreign variants, foreign order items, invalid quantities, invalid prices and over-discount",async()=>{
 const {saveOrderEdit}=await modulePromise;
 for(const body of [
 {items:[{productId:1,variantId:10,quantity:1,unitPrice:1}]},
 {items:[{id:99,quantity:1,unitPrice:1}]},
 {items:[{id:1,quantity:1.5,unitPrice:1}]},
 {items:[{id:1,quantity:1,unitPrice:-1}]},
 {items:[{id:1,quantity:1,unitPrice:Infinity}]},
 {items:[{id:1,quantity:1,unitPrice:0.001}]},
 {items:[]},{discount:1000}
 ]){const db=fixture();await assert.rejects(saveOrderEdit(db,1,{editVersion:0,...body}));assert.equal(row(db).edit_version,0)}
});
test("new personalized products require their fields, variants and preserve base stock",async()=>{
 const {saveOrderEdit}=await modulePromise,db=fixture();
 db.sql.exec("INSERT INTO product_custom_fields VALUES(2,'الاسم',20,1,0,1)");
 await assert.rejects(saveOrderEdit(db,1,{editVersion:0,items:[{productId:2,variantId:10,quantity:2,unitPrice:4}]}));
 await saveOrderEdit(db,1,{editVersion:0,status:"confirmed",items:[{productId:2,variantId:10,quantity:2,unitPrice:4,customizations:{"الاسم":"منار"}}]});
 assert.equal(items(db)[0].variant_label,"أحمر");assert.equal(items(db)[0].customization_json,'{"الاسم":"منار"}');assert.equal(stock(db,2),20);
 assert.equal(db.sql.prepare("SELECT stock_quantity FROM product_variants WHERE id=10").get().stock_quantity,8);
});
test("legacy cancelled orders with unknown inventory cannot change stock silently",async()=>{
 const {saveOrderEdit}=await modulePromise,db=fixture();
 db.sql.exec("UPDATE orders SET status='cancelled',inventory_committed=NULL");
 await assert.rejects(saveOrderEdit(db,1,{editVersion:0,status:"confirmed"}),e=>e.status===409);
 await saveOrderEdit(db,1,{editVersion:0,shipping:5});assert.equal(row(db).inventory_committed,null);assert.equal(stock(db),10);
});

test("confirmation resolves a recreated historical variant by its saved label",async()=>{
 const {saveOrderEdit}=await modulePromise,db=fixture();
 db.sql.exec("UPDATE order_items SET product_id=2,variant_id=NULL,variant_label='أحمر'");
 await saveOrderEdit(db,1,{status:"confirmed"});
 assert.equal(items(db)[0].variant_id,10);assert.equal(stock(db,2),20);
 assert.equal(db.sql.prepare("SELECT stock_quantity FROM product_variants WHERE id=10").get().stock_quantity,8);
});

test("status-only changes retain all prices, fees, line details and reject a stale list version",async()=>{const {saveOrderEdit}=await modulePromise,db=fixture();db.sql.exec("UPDATE orders SET shipping_agorot=500,discount_agorot=100,total_agorot=3100;INSERT INTO order_extra_fees VALUES(1,'تغليف',200,1)");const before=items(db),fees=db.sql.prepare('SELECT * FROM order_extra_fees').all();await saveOrderEdit(db,1,{status:'confirmed',editVersion:0});assert.equal(row(db).status,'confirmed');assert.equal(row(db).shipping_agorot,500);assert.equal(row(db).discount_agorot,100);assert.equal(row(db).total_agorot,3100);assert.deepEqual(items(db),before);assert.deepEqual(db.sql.prepare('SELECT * FROM order_extra_fees').all(),fees);assert.equal(stock(db),8);await assert.rejects(()=>saveOrderEdit(db,1,{status:'shipped',editVersion:0}),/جهاز آخر/);assert.equal(row(db).status,'confirmed')});
