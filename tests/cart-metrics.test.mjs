import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {recordCart,readCartMetrics,cartSnapshot,CART_WINDOW_MS} from "../worker/cart-metrics.ts";

function database(){
 const sqlite=new DatabaseSync(":memory:");
 sqlite.exec(readFileSync(new URL("../drizzle/0014_cart_snapshots.sql",import.meta.url),"utf8"));
 return {sqlite,prepare(sql){const statement=sqlite.prepare(sql);let args=[];return{
  bind(...values){args=values;return this},
  async run(){return statement.run(...args)},
  async first(){return statement.get(...args)||null}
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
  assert.deepEqual(cartSnapshot({items:[{productId:1,qty:3},{productId:1,qty:2}]}),{quantity:5,products:1});
 }finally{db.sqlite.close()}
});
