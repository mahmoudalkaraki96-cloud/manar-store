import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {recordCart,readCartMetrics,cartSnapshot,CART_WINDOW_MS,readCartDetails} from "../worker/cart-metrics.ts";

function database(){
 const sqlite=new DatabaseSync(":memory:");
 sqlite.exec(readFileSync(new URL("../drizzle/0014_cart_snapshots.sql",import.meta.url),"utf8"));
 sqlite.exec(readFileSync(new URL("../drizzle/0016_cart_details.sql",import.meta.url),"utf8"));
 sqlite.exec("CREATE TABLE products(id INTEGER PRIMARY KEY,item_number INTEGER,name TEXT);CREATE TABLE product_variants(id INTEGER PRIMARY KEY,product_id INTEGER);CREATE TABLE variant_option_values(variant_id INTEGER,option_value_id INTEGER);CREATE TABLE product_option_values(id INTEGER PRIMARY KEY,value TEXT)");
 return {sqlite,async batch(statements){sqlite.exec("BEGIN");try{const result=await Promise.all(statements.map(s=>s.run()));sqlite.exec("COMMIT");return result}catch(error){sqlite.exec("ROLLBACK");throw error}},prepare(sql){const statement=sqlite.prepare(sql);let args=[];return{
  bind(...values){args=values;return this},
  async run(){return statement.run(...args)},
  async first(){return statement.get(...args)||null},
  async all(){return {results:statement.all(...args)}}
 }}};
}
function request(items,cookie,origin="https://manarstore.ps"){
 return new Request("https://manarstore.ps/api/analytics/cart",{method:"POST",headers:{"content-type":"application/json",origin,...(cookie?{cookie}:{})},body:JSON.stringify({items})});
}
test("cart snapshots replace quantities, keep browsers separate and remove emptied carts",async()=>{
 const db=database();
 try{
  const first=await recordCart(request([{productId:1,qty:3},{productId:1,qty:2}]),db);
  assert.equal(first.status,200);
  const cookie=first.headers.get("set-cookie").split(";")[0];
  assert.match(first.headers.get("set-cookie"),/Secure; HttpOnly; SameSite=Lax/);
  await recordCart(request([{productId:1,qty:1}],cookie),db);
  await recordCart(request([{productId:2,qty:4}]),db);
  let metrics=await readCartMetrics(db);
  assert.equal(metrics.cartQuantity,5);assert.equal(metrics.nonemptyCarts,2);
  await recordCart(request([],cookie),db);
  metrics=await readCartMetrics(db);
  assert.equal(metrics.cartQuantity,4);assert.equal(metrics.nonemptyCarts,1);
  await recordCart(request([]),db);
  assert.equal((await readCartMetrics(db)).nonemptyCarts,1);
 }finally{db.sqlite.close()}
});
test("expired carts are excluded and removed while recent carts stay",async()=>{
 const db=database();
 try{
  db.sqlite.prepare("INSERT INTO store_cart_snapshots VALUES (?,?,?,?)").run("old",9,1,Date.now()-CART_WINDOW_MS-1000);
  db.sqlite.prepare("INSERT INTO store_cart_snapshots VALUES (?,?,?,?)").run("recent",2,1,Date.now());
  const metrics=await readCartMetrics(db);
  assert.equal(metrics.cartQuantity,2);assert.equal(metrics.nonemptyCarts,1);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM store_cart_snapshots").get().count,1);
 }finally{db.sqlite.close()}
});
test("malformed carts and cross-origin writes do not change metrics",async()=>{
 const db=database();
 try{
  for(const items of [[{productId:1,qty:-1}],[{productId:1,qty:1.5}],[{productId:1,qty:100001}],[{productId:0,qty:1}]]){
   assert.equal((await recordCart(request(items),db)).status,400);
  }
  assert.equal((await recordCart(request([{productId:1,qty:1}],null,"https://other.example"),db)).status,403);
  assert.equal((await readCartMetrics(db)).cartQuantity,0);
  assert.deepEqual(cartSnapshot({items:[{productId:1,qty:3},{productId:1,qty:2}]}),{quantity:5,products:1,items:[{productId:1,variantId:null,qty:5}]});
 }finally{db.sqlite.close()}
});

test("cart details aggregate variants, replace snapshots and flag historical carts",async()=>{
 const db=database();
 try{
  db.sqlite.exec("INSERT INTO products VALUES(1,101,'ورد'),(2,102,'علب');INSERT INTO product_variants VALUES(10,1);INSERT INTO product_option_values VALUES(1,'أحمر');INSERT INTO variant_option_values VALUES(10,1)");
  const first=await recordCart(request([{productId:1,variantId:10,qty:2},{productId:1,variantId:10,qty:3},{productId:1,qty:1}]),db);
  const cookie=first.headers.get("set-cookie").split(";")[0];
  await recordCart(request([{productId:1,variantId:10,qty:4},{productId:2,qty:2}]),db);
  db.sqlite.prepare("INSERT INTO store_cart_snapshots VALUES(?,?,?,?)").run("legacy",9,1,Date.now());
  let details=await readCartDetails(db);
  assert.equal(details.missingDetailsCarts,1);
  assert.equal(details.items.length,3);
  assert.deepEqual(details.items[0],{productId:1,variantId:10,itemNumber:101,productName:"ورد",variantName:"أحمر",quantity:9,carts:2,lastSeen:details.items[0].lastSeen});
  await recordCart(request([{productId:2,qty:1}],cookie),db);
  details=await readCartDetails(db);
  assert.equal(details.items.find(i=>i.variantId===10).quantity,4);
  assert.equal(details.items.find(i=>i.productId===2).quantity,3);
  await recordCart(request([],cookie),db);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM store_cart_details").get().count,1);
  db.sqlite.prepare("UPDATE store_cart_snapshots SET updated_at=?").run(Date.now()-CART_WINDOW_MS-1000);
  await readCartMetrics(db);details=await readCartDetails(db);
  assert.deepEqual(details,{missingDetailsCarts:0,items:[]});
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM store_cart_details").get().count,0);
 }finally{db.sqlite.close()}
});
test("invalid variants are rejected and cart identifiers are not exposed",async()=>{
 const db=database();
 try{
  for(const variantId of [-1,0,1.5,"10"])assert.equal((await recordCart(request([{productId:1,variantId,qty:1}]),db)).status,400);
  await recordCart(request([{productId:999,variantId:20,qty:1}]),db);
  const details=await readCartDetails(db);
  assert.equal(details.items[0].productName,"منتج محذوف #999");
  assert.equal(details.items[0].variantName,"متغير #20");
  assert.equal(JSON.stringify(details).includes("cart_id"),false);
 }finally{db.sqlite.close()}
});
