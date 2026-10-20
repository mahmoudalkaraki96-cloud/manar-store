const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {stripTypeScriptTypes}=require("node:module");
const modulePromise=import("data:text/javascript;base64,"+Buffer.from(stripTypeScriptTypes(fs.readFileSync("worker/manual-order.ts","utf8"),{mode:"transform"})).toString("base64"));
function fixture(){
 const sql=new DatabaseSync(":memory:");
 sql.exec(`CREATE TABLE orders(id INTEGER PRIMARY KEY AUTOINCREMENT,order_number INTEGER UNIQUE,status TEXT,customer_name TEXT,phone TEXT,address TEXT,city TEXT,subtotal_agorot INTEGER,shipping_agorot INTEGER,discount_agorot INTEGER,total_agorot INTEGER,payment_method TEXT,payment_status TEXT,notes TEXT,created_at INTEGER,updated_at INTEGER,order_source TEXT,order_source_channel TEXT,inventory_committed INTEGER);
 CREATE TABLE order_items(id INTEGER PRIMARY KEY AUTOINCREMENT,order_id INTEGER,product_id INTEGER,variant_id INTEGER,item_number INTEGER,product_name TEXT,variant_label TEXT,customization_json TEXT,quantity INTEGER,unit_price_agorot INTEGER,line_total_agorot INTEGER);
 CREATE TABLE products(id INTEGER PRIMARY KEY,item_number INTEGER,name TEXT,active INTEGER,deleted_at INTEGER);
 CREATE TABLE product_variants(id INTEGER PRIMARY KEY,product_id INTEGER,active INTEGER);
 CREATE TABLE variant_option_values(variant_id INTEGER,option_value_id INTEGER);
 CREATE TABLE product_option_values(id INTEGER PRIMARY KEY,value TEXT);
 CREATE TABLE product_custom_fields(product_id INTEGER,label TEXT,max_length INTEGER,required INTEGER,sort_order INTEGER,id INTEGER);
 INSERT INTO products VALUES(1,120,'صنف تجريبي',1,NULL),(2,121,'متغير',1,NULL);
 INSERT INTO product_variants VALUES(22,2,1);
 INSERT INTO product_option_values VALUES(8,'أحمر');
 INSERT INTO variant_option_values VALUES(22,8);
 INSERT INTO product_custom_fields VALUES(1,'الاسم',30,1,0,1);`);
 const db={
  prepare(query){let values=[];const statement={query,get values(){return values},bind(...args){values=args;return statement},async first(){return sql.prepare(query).get(...values)||null},async all(){return{results:sql.prepare(query).all(...values)}},async run(){const result=sql.prepare(query).run(...values);return{meta:{last_row_id:Number(result.lastInsertRowid)}}}};return statement},
  async batch(statements){sql.exec("BEGIN IMMEDIATE");try{for(const statement of statements)sql.prepare(statement.query).run(...statement.values);sql.exec("COMMIT")}catch(error){sql.exec("ROLLBACK");throw error}}
 };
 return {sql,db};
}
const body={customerName:"زبون",phone:"0591234567",city:"رام الله",address:"وسط البلد",channel:"whatsapp",shipping:20,discount:2,items:[{productId:1,quantity:2,unitPrice:5,customizations:{"الاسم":"ليان"}}]};
test("creates order with manual source, channel and correct totals",async()=>{
 const {createManualOrder}=await modulePromise,{sql,db}=fixture();const result=await createManualOrder(db,body);
 const order=sql.prepare("SELECT * FROM orders").get(),line=sql.prepare("SELECT * FROM order_items").get();
 assert.equal(result.total,28);assert.equal(order.order_source,"manual");assert.equal(order.order_source_channel,"whatsapp");assert.equal(order.status,"new");assert.equal(order.inventory_committed,0);assert.equal(line.line_total_agorot,1000);assert.equal(line.customization_json,'{"الاسم":"ليان"}');
});
test("requires variant selection and required customizations",async()=>{
 const {createManualOrder}=await modulePromise,{db}=fixture();
 await assert.rejects(createManualOrder(db,{...body,items:[{productId:2,quantity:1,unitPrice:2}]}),/اختر متغير/);
 await assert.rejects(createManualOrder(db,{...body,items:[{productId:1,quantity:1,unitPrice:2,customizations:{}}]}),/مطلوب/);
});
test("rejects over-discount and missing address without persisting",async()=>{
 const {createManualOrder}=await modulePromise,{db,sql}=fixture();
 await assert.rejects(createManualOrder(db,{...body,discount:100}));
 await assert.rejects(createManualOrder(db,{...body,address:""}));
 assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM orders").get().n,0);
});
