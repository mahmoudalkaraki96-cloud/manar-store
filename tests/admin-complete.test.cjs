const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),{DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
function load(file){const full=path.join(root,file),m=new Module(full,module);m.filename=full;m.paths=module.paths;m.require=name=>{if(/.css$/.test(name))return {};if(!name.startsWith('.'))return require(name);const base=path.resolve(path.dirname(full),name);const hit=[base,base+'.ts',base+'.tsx'].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());if(!hit)throw new Error('cannot resolve '+name);return load(path.relative(root,hit))};m._compile(ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,full);return m.exports}

test('1.10.0: visitor sources are grouped like the sample',()=>{
 const {sourceGroup}=load('worker/overview-extras.ts');
 assert.equal(sourceGroup('instagram',null),'instagram');
 assert.equal(sourceGroup(null,'l.instagram.com'),'instagram');
 assert.equal(sourceGroup(null,'m.facebook.com'),'facebook');
 assert.equal(sourceGroup(null,'www.google.com'),'google');
 assert.equal(sourceGroup(null,null),'direct');
 assert.equal(sourceGroup(null,'manarstore.ps','manarstore.ps'),'direct');
 assert.equal(sourceGroup(null,'example.org'),'other');
});
test('1.10.0: month window follows Palestine time and goal per day is honest',()=>{
 const {hebronMonth}=load('worker/overview-extras.ts');
 const m=hebronMonth(Date.UTC(2026,10,25,10,0));
 assert.equal(m.daysInMonth,30);assert.equal(m.day,25);assert.equal(m.daysLeft,6);
 assert.equal(new Date(m.start).toISOString(),'2026-10-31T22:00:00.000Z','1 Nov 00:00 in Palestine (UTC+2)');
});
test('1.10.0: overview extras read sources, cities, pending reviews and searches that found nothing',async()=>{
 const {readOverviewExtras}=load('worker/overview-extras.ts');
 const sql=new DatabaseSync(':memory:');
 sql.exec(`CREATE TABLE marketing_events(event_name TEXT,occurred_at INTEGER,visitor_hash TEXT,source TEXT,referrer_host TEXT);
 CREATE TABLE orders(id INTEGER,city TEXT,status TEXT,total_agorot INTEGER,created_at INTEGER,deleted_at INTEGER);
 CREATE TABLE product_reviews(id INTEGER,product_id INTEGER,rating INTEGER,body TEXT,status TEXT,created_at INTEGER);
 CREATE TABLE products(id INTEGER,name TEXT,item_number INTEGER,active INTEGER,deleted_at INTEGER);
 CREATE TABLE product_keywords(product_id INTEGER,keyword TEXT);
 CREATE TABLE marketing_search_terms(term TEXT,occurred_at INTEGER);`);
 const now=Date.UTC(2026,10,25,10,0),t=now-864e5;
 const ev=sql.prepare('INSERT INTO marketing_events VALUES(?,?,?,?,?)');ev.run('page_view',t,'a','instagram',null);ev.run('page_view',t,'b',null,'l.instagram.com');ev.run('page_view',t,'c',null,null);ev.run('add_to_cart',t,'d','facebook',null);
 const o=sql.prepare('INSERT INTO orders VALUES(?,?,?,?,?,?)');o.run(1,'نابلس','new',10000,t,null);o.run(2,'نابلس','delivered',5000,t,null);o.run(3,'رام الله','cancelled',9000,t,null);o.run(4,'الخليل','confirmed',2500,t,null);
 sql.exec("INSERT INTO products VALUES(1,'بالون ذهبي',101,1,NULL),(2,'شموع',102,0,NULL);INSERT INTO product_keywords VALUES(1,'هيليوم');INSERT INTO product_reviews VALUES(9,1,5,'حلو كتير','pending',1),(8,1,4,'تمام','approved',1)");
 const s=sql.prepare('INSERT INTO marketing_search_terms VALUES(?,?)');for(const term of ['بالون','بالون','شموع','زينة رمضان','هيليوم'])s.run(term,t);
 const db={prepare(q){const st=sql.prepare(q);let v=[];return {bind(...x){v=x;return this},async first(){return st.get(...v)||null},async all(){return {results:st.all(...v)}}}}};
 const x=await readOverviewExtras(db,{now,goal:1000});
 assert.deepEqual(x.traffic.sources.map(s=>[s.key,s.visitors]),[['instagram',2],['direct',1]],'only page views, grouped');
 assert.deepEqual(x.cities,[{city:'نابلس',orders:2},{city:'الخليل',orders:1}],'cancelled orders left out');
 assert.equal(x.reviews.pending,1);assert.equal(x.reviews.items[0].product,'بالون ذهبي');
 assert.deepEqual(x.failedSearches.map(f=>f.term).sort(),['زينة رمضان','شموع'],'hidden products do not count as found; keywords do');
 assert.equal(x.month.sales,175);assert.equal(x.month.perDayNeeded,Math.ceil((1000-175)/6));
});
test('1.10.0: customer summary groups by phone and labels segments',()=>{
 const {buildCustomerOverview}=load('app/admin/CustomersOverview.tsx');
 const now=Date.UTC(2026,10,25),day=864e5;
 const order=(id,name,phone,total,daysAgo,status='delivered')=>({id,customer_name:name,phone,city:'نابلس',status,total_agorot:total,created_at:now-daysAgo*day,deleted_at:null});
 const {rows,summary}=buildCustomerOverview([order(1,'هبة','054-111-2290',10000,1),order(2,'هبة','+972 54 111 2290',5000,40),order(3,'أحمد','059-1201',2000,2),order(4,'سامي','052-6610',3000,120),order(5,'ملغي','050-0',9000,1,'cancelled')],now);
 assert.equal(summary.total,3,'same phone in two formats is one customer; cancelled ignored');
 const by=Object.fromEntries(rows.map(r=>[r.name,r]));
 assert.equal(by['هبة'].orders,2);assert.equal(by['هبة'].segment,'back');
 assert.equal(by['أحمد'].segment,'new');assert.equal(by['سامي'].segment,'sleep');
 assert.equal(summary.returning,33);
});
test('1.10.0: discount status — active, scheduled, ended, paused',()=>{
 const {discountStatus}=load('app/admin/DiscountsPanel.tsx');
 const now=1000,r={enabled:true,startsAt:null,endsAt:null,limit:null,used:0};
 assert.equal(discountStatus(r,now),'active');
 assert.equal(discountStatus({...r,startsAt:2000},now),'scheduled');
 assert.equal(discountStatus({...r,endsAt:500},now),'ended');
 assert.equal(discountStatus({...r,limit:10,used:10},now),'ended');
 assert.equal(discountStatus({...r,enabled:false},now),'paused');
});
test('1.10.0: orders get payment method, bulk status and a day prep sheet',()=>{
 const p=read('app/admin/OrdersPanel.tsx'),w=read('worker/index.ts');
 assert.ok(w.includes('["cash_on_delivery","bank_transfer","cash_in_store","card","other"].includes(method)'));
 assert.ok(p.includes('const applyBulkStatus=async()=>')&&p.includes('className="ordersBulkBar"'));
 assert.ok(p.includes('className="dayPrepOrder"')&&p.includes('initialStatus==="dayprep"'));
 assert.ok(read('app/admin/admin.css').includes('.dayPrepOrder{break-after:page'));
});
test('1.10.0: products get «جديد», search-engine text and a low-stock threshold',()=>{
 const w=read('worker/index.ts'),prof=read('shared/store-profile.ts');
 assert.ok(w.includes('["is_new","integer DEFAULT 0 NOT NULL"],["seo_title","text DEFAULT \'\' NOT NULL"],["seo_description","text DEFAULT \'\' NOT NULL"]'));
 assert.ok(w.includes('title=(String(product.seo_title||"").trim()||name)+" – "+storeName;'));
 assert.ok(prof.includes('lowStockThreshold:5,monthlySalesGoal:0'));
 assert.ok(read('app/components/ProductCard.tsx').includes('p.isNew&&productAvailable(p)&&<span className="newProductBadge">'));
 assert.ok(read('shared/ui-message-defaults.ts').includes('"product.new_badge": {AR: "جديد", EN: "New", HE: "חדש"}'));
 const {normalizeStoreProfile}=load('shared/store-profile.ts');
 assert.equal(normalizeStoreProfile({}).lowStockThreshold,5);assert.equal(normalizeStoreProfile({lowStockThreshold:0}).lowStockThreshold,5);assert.equal(normalizeStoreProfile({lowStockThreshold:12}).lowStockThreshold,12);
 const {filterProducts,emptyProductFilters}=load('app/admin/product-filters.ts');
 const base={name:'x',itemNumber:1,categoryId:null,category:'',price:5,active:true,suppliers:[],variants:[]},list=[{...base,id:1,stock:4},{...base,id:2,stock:8}];
 assert.deepEqual(filterProducts(list,[],{...emptyProductFilters,status:'low'}).map(p=>p.id),[1]);
 assert.deepEqual(filterProducts(list,[],{...emptyProductFilters,status:'low',lowStock:10}).map(p=>p.id).sort(),[1,2]);
});
test('1.10.0: shipping keeps delivery time and free delivery saves the full settings',()=>{
 const sh=read('app/admin/ShippingPanel.tsx');
 assert.ok(sh.includes('JSON.stringify({...loaded.settings,freeShippingEnabled:enabled,freeShippingThreshold:threshold})'),'partial settings saves would reset other settings');
 assert.ok(read('worker/shipping-zones.ts').includes('UPDATE shipping_zones SET delivery_time=? WHERE code=?'));
});
test('1.10.0: settings side menu, phone bottom bar and overview route permission',()=>{
 assert.ok(read('app/admin/SettingsPanel.tsx').includes('className="editorTabs settingsNav" role="tablist" aria-orientation="vertical"'));
 assert.ok(read('app/admin/page.tsx').includes('<nav className="adminBottomBar" aria-label="التنقل السريع">'));
 assert.ok(read('worker/admin-security.ts').includes("path==='/api/admin/overview-extras'"));
});
test('1.10.1: phone bottom bar sits directly in the admin shell, not inside the side drawer',()=>{
 const s=read('app/admin/page.tsx'),open=s.indexOf('return <main className={`adminShell adminRedesign'),bar=s.indexOf('<nav className="adminBottomBar"'),side=s.indexOf('className={`adminSide');
 assert.ok(open>0&&bar>open,'bar inside the shell');
 assert.ok(side<0||bar<side,'bar rendered before the drawer opens');
 assert.equal((s.match(/<nav className="adminBottomBar"/g)||[]).length,1);
});
