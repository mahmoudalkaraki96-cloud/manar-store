const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),ts=require("typescript");
function load(){const m={exports:{}};new Function("module","exports",ts.transpileModule(fs.readFileSync("app/catalog-types.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(m,m.exports);return m.exports}

test("data is reused for a minute, then refreshed in the background, and pages hear only about real changes",async()=>{
 const events=[];global.window={dispatchEvent:e=>events.push(e.detail)};global.CustomEvent=class{constructor(type,o){this.type=type;this.detail=o.detail}};
 const realNow=Date.now;let now=1_000_000;Date.now=()=>now;
 try{
  const {freshCache,STORE_DATA_MAX_AGE_MS}=load();
  let calls=0,payload={products:[1]};
  const cache=freshCache("catalog",async()=>{calls++;return JSON.parse(JSON.stringify(payload))});
  assert.deepEqual(await cache.get(),{products:[1]});assert.equal(calls,1);
  now+=STORE_DATA_MAX_AGE_MS-1;await cache.get();assert.equal(calls,1,"fresh copy reused within a minute");
  now+=2;const stale=await cache.get();assert.deepEqual(stale,{products:[1]},"stale copy returned at once");
  await new Promise(r=>setTimeout(r,0));assert.equal(calls,2,"background refresh started");assert.deepEqual(events,[],"no event when nothing changed");
  payload={products:[1,2]};now+=STORE_DATA_MAX_AGE_MS+1;await cache.get();await new Promise(r=>setTimeout(r,0));
  assert.deepEqual(events,["catalog"],"event once data changed");assert.deepEqual(cache.current(),{products:[1,2]});
  payload={products:[3]};assert.deepEqual(await cache.refresh(),{products:[3]},"refresh waits for fresh data");
  const a=cache.refresh(),b=cache.refresh();assert.equal(a,b,"concurrent refreshes share one request");await a;
 }finally{Date.now=realNow;delete global.window;delete global.CustomEvent}
});

test("a failed first load can be retried",async()=>{
 const {freshCache}=load();let fail=true;
 const cache=freshCache("x",async()=>{if(fail)throw new Error("offline");return 1});
 await assert.rejects(cache.get());fail=false;assert.equal(await cache.get(),1);
});

test("pages that show products or settings reload when store data changes",()=>{
 for(const file of ["app/page.tsx","app/category/[slug]/page.tsx","app/products/[collection]/page.tsx","app/product/[id]/page.tsx","app/search/SearchResultsClient.tsx","app/components/StoreHeader.tsx","app/components/StoreShell.tsx","app/components/ShoppingOverlay.tsx","app/components/WhatsAppButton.tsx"])
  assert.match(fs.readFileSync(file,"utf8"),/,?storeDataVersion\]\)/,file);
 const layout=fs.readFileSync("app/layout.tsx","utf8");assert.match(layout,/<StoreRefresh\/>/);
});
