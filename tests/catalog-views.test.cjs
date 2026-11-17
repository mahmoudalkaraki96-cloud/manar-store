const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),ts=require("typescript");
const load=(file,deps={})=>{const m={exports:{}};new Function("module","exports","require",ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(m,m.exports,n=>n in deps?deps[n]:require(n));return m.exports};
const catalog=load("app/catalog-types.ts"),views=load("worker/catalog-views.ts",{"../app/catalog-types":catalog});

// 3 roots with subcategories, 120 products with varied flags so every home row has more candidates than its limit.
const categories=[{id:1,parentId:null,slug:"a",name:"A"},{id:2,parentId:1,slug:"a-sub",name:"A sub"},{id:3,parentId:null,slug:"b",name:"B"},{id:4,parentId:3,slug:"b-sub",name:"B sub"},{id:5,parentId:4,slug:"b-sub-sub",name:"B deep"},{id:6,parentId:null,slug:"c",name:"C"}].map(c=>({...c,active:true}));
const products=Array.from({length:120},(_,i)=>({id:i+1,itemNumber:1000+i,name:i%7===0?"شمعة "+i:"Item "+i,category:"",categoryId:[1,2,3,4,5,6,null][i%7],price:5+i%17,oldPrice:i%5===0?50:undefined,featured:i%6===0,createdAt:1_000_000+((i*37)%120)*1000,orders:i%4===0?(i*13)%29:0,ratingCount:i%3===0?1:0,rating:(i*7)%5,inStock:true,active:true,variants:[],translations:i%7===0?{EN:{name:"Candle "+i}}:{}}));
const data={categories,products};

const homeRows=(d,limit)=>{const tree=root=>{const ids=new Set([root]);let added=true;while(added){added=false;for(const c of d.categories)if(c.parentId!=null&&ids.has(c.parentId)&&!ids.has(c.id)){ids.add(c.id);added=true}}return ids};
 const rows={offers:d.products.filter(p=>p.oldPrice),featured:d.products.filter(p=>p.featured),newest:[...d.products].sort((a,b)=>b.createdAt-a.createdAt),most:d.products.filter(p=>p.orders>0).sort((a,b)=>b.orders-a.orders),top:d.products.filter(p=>p.ratingCount>0).sort((a,b)=>b.rating-a.rating)};
 for(const r of d.categories.filter(c=>c.parentId==null)){const ids=tree(r.id);rows["cat"+r.id]=d.products.filter(p=>p.categoryId!=null&&ids.has(p.categoryId))}
 return Object.fromEntries(Object.entries(rows).map(([k,v])=>[k,v.slice(0,limit).map(p=>p.id)]));};

test("home view: every row computed from the slice equals the row from the full catalog",()=>{
 for(const limit of [1,6,12]){const slice=views.homeView(data,limit);assert.deepEqual(homeRows(slice,limit),homeRows(data,limit),"limit "+limit);assert.ok(slice.products.length<data.products.length);assert.equal(new Set(slice.products.map(p=>p.id)).size,slice.products.length,"no duplicates")}
});

test("category, collection, product, items and search views",()=>{
 assert.deepEqual(new Set(views.categoryView(data,"b").products.map(p=>p.categoryId)),new Set([3,4,5]));
 assert.equal(views.categoryView(data,"missing"),null);
 assert.ok(views.collectionView(data,"offers").products.every(p=>p.oldPrice));
 assert.equal(views.collectionView(data,"nope"),null);
 const byId=views.productView(data,8),byItem=views.productView(data,1007);
 const product=byId.products.find(p=>p.id===8);assert.ok(product&&byItem.products.some(p=>p.id===8));
 // The product page takes related = same category, first 12 in catalog order: identical from the slice and the full list.
 const related=d=>d.products.filter(p=>p.id!==8&&p.categoryId===product.categoryId).slice(0,12).map(p=>p.id);
 assert.deepEqual(related(byId),related(data));
 assert.deepEqual(views.itemsView(data,[3,1,3,-2,999]).products.map(p=>p.id),[1,3]);
 assert.ok(views.searchView(data,"candle","EN").products.length>0,"translated name found");
 assert.ok(views.searchView(data,"شمعة","EN").products.length>0,"base text still found");
 assert.deepEqual(views.searchView(data,"  ","EN").products,[]);
 assert.ok(views.categoriesView(data).products.length===0&&views.categoriesView(data).categories.length===6);
});

test("view requests are parsed and normalised; anything else is rejected",()=>{
 const p=(path,q="")=>views.catalogViewRequest(path,new URLSearchParams(q));
 assert.deepEqual(p("/api/catalog/items","ids=9,2,x,2"),{view:"items",arg:"2,2,9"});
 assert.deepEqual(p("/api/catalog/search","q= شمعة &lang=en"),{view:"search",arg:"شمعة",lang:"EN"});
 assert.deepEqual(p("/api/catalog/category/%D9%88%D8%B1%D8%AF"),{view:"category",arg:"ورد"});
 for(const bad of ["/api/catalog/product/abc","/api/catalog/collection/all","/api/catalog/unknown","/api/catalog/category"])assert.equal(p(bad),null,bad);
});

test("only the all-products and search pages still load the full catalog",()=>{
 const users=[];(function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=d+"/"+e.name;if(e.isDirectory()){if(e.name!=="admin")walk(f)}else if(/\.tsx?$/.test(e.name)&&/\bloadCatalog\(\)/.test(fs.readFileSync(f,"utf8"))&&!f.endsWith("catalog-types.ts"))users.push(f)}})("app");
 assert.deepEqual(users.sort(),["app/products/[collection]/page.tsx","app/search/SearchResultsClient.tsx"]);
 assert.match(fs.readFileSync("app/products/[collection]/page.tsx","utf8"),/params\.collection==="all"\?loadCatalog\(\)/);
});
