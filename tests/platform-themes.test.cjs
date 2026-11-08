const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),{DatabaseSync}=require('node:sqlite');
const modules=new Map();function load(file){file=path.resolve(file);if(modules.has(file))return modules.get(file);const m={exports:{}};modules.set(file,m.exports);new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>n.startsWith('.')?load(path.resolve(path.dirname(file),n+'.ts')):require(n),m,m.exports);return m.exports}
const{themesApi}=load('platform/control/themes-api.ts');
const ORIGIN='https://platform.test',CONTROL=JSON.parse(fs.readFileSync('platform/control/resources.json')).databaseId;
function adapter(sql){return{prepare(query){return{values:[],bind(...v){this.values=v;return this},async first(){return sql.prepare(query).get(...this.values)||null},async all(){return{results:sql.prepare(query).all(...this.values)}},async run(){const r=sql.prepare(query).run(...this.values);return{meta:{changes:Number(r.changes)}}},execute(){return sql.prepare(query).run(...this.values)}}},async batch(statements){sql.exec('BEGIN');try{const result=statements.map(s=>s.execute());sql.exec('COMMIT');return result}catch(e){sql.exec('ROLLBACK');throw e}}}}
function fixture(){
 const control=new DatabaseSync(':memory:');control.exec(fs.readFileSync('platform/control/schema.sql','utf8'));control.exec(fs.readFileSync('platform/control/themes-schema.sql','utf8'));
 const stores=new Map(),resources={};
 for(const [id,version] of [['store-a','1.7.0'],['store-b','1.1.5']]){const db=new DatabaseSync(':memory:',{enableForeignKeyConstraints:false});db.exec(fs.readFileSync('db/store-baseline.sql','utf8'));db.prepare('UPDATE store_profile SET settings_json=? WHERE id=1').run(JSON.stringify({publicOrigin:'https://'+id+'.test',metaPixelId:'',mobileProductColumns:3}));stores.set(id,db);resources[id]={databaseId:id,mediaBucket:id+'-media',adminWorker:id+'-admin',adminUrl:'https://'+id+'.test'};control.prepare("INSERT INTO platform_stores(id,name_ar,status,resources_json,app_version,created_at,updated_at) VALUES(?,?,'active',?,?,0,0)").run(id,id,JSON.stringify(resources[id]),version)}
 const env={PLATFORM_DB:adapter(control),PLATFORM_RELEASE_BUILD_HOOK:'https://api.cloudflare.com/client/v4/workers/builds/deploy_hooks/11111111-1111-4111-8111-111111111111'};
 const cf={bindingsFor:null,async query(id,sql,params=[]){const db=id===CONTROL?control:stores.get(id);if(!db)throw Error('wrong store');return[{results:db.prepare(sql).all(...params)}]},async call(route){const id=route.includes('store-a-admin')?'store-a':'store-b',r=resources[id];return{bindings:this.bindingsFor||[{name:'DB',id:r.databaseId},{name:'MEDIA',bucket_name:r.mediaBucket},{name:'APP_SURFACE',text:'admin'}]}}};
 return{env,control,stores,cf};
}
const fetcher=async()=>Response.json({success:true,result:{build_uuid:'22222222-2222-4222-8222-222222222222'}});
function request(route,body,origin=ORIGIN){return new Request(ORIGIN+route,{method:body===undefined?'GET':'POST',headers:{origin,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})})}
const change=(id='standard',radius='round')=>({id,radius,requestKey:crypto.randomUUID()});
const profile=db=>JSON.parse(db.prepare('SELECT settings_json FROM store_profile').get().settings_json);

test('theme API rejects unauthenticated and cross-origin requests before reading data',async()=>{
 const env={PLATFORM_DB:{prepare(){throw Error('must not read')}}};
 assert.equal((await themesApi(request('/api/stores/store-a/theme',change()),env,'')).status,401);
 assert.equal((await themesApi(request('/api/stores/store-a/theme',change(),'https://evil.test'),env,'owner')).status,403);
});

test('only themes supported by the store release can be queued, one change at a time',async()=>{
 const{env,control}=fixture();
 let r=await themesApi(request('/api/stores/store-b/theme'),env,'owner');let data=await r.json();assert.deepEqual(data.allowed,[]);assert.match(data.reason,/1\.1\.5/);
 assert.equal((await themesApi(request('/api/stores/store-b/theme',change()),env,'owner',fetcher)).status,409);
 for(const body of [change('modern'),change('standard','huge'),change('__proto__')])assert.equal((await themesApi(request('/api/stores/store-a/theme',body),env,'owner',fetcher)).status,400);
 const body=change();r=await themesApi(request('/api/stores/store-a/theme',body),env,'owner',fetcher);assert.equal(r.status,202);
 const job=control.prepare('SELECT * FROM platform_theme_jobs').get();assert.equal(job.status,'queued');assert.equal(job.build_id,'22222222-2222-4222-8222-222222222222');assert.deepEqual(JSON.parse(job.theme_json),{id:'standard',radius:'round'});assert.deepEqual(JSON.parse(job.snapshot_json),{databaseId:'store-a',mediaBucket:'store-a-media',adminWorker:'store-a-admin'});
 assert.equal((await (await themesApi(request('/api/stores/store-a/theme',body),env,'owner',fetcher)).json()).alreadyQueued,true);
 assert.equal((await themesApi(request('/api/stores/store-a/theme',change('standard','sharp')),env,'owner',fetcher)).status,409);
 assert.equal(control.prepare('SELECT COUNT(*) n FROM platform_theme_jobs').get().n,1);
 assert.equal(control.prepare("SELECT COUNT(*) n FROM platform_audit WHERE action='theme.change_requested'").get().n,1);
});

test('runner changes only the theme of its own store and proves other settings are untouched',async()=>{
 const{env,control,stores,cf}=fixture(),a=stores.get('store-a'),b=stores.get('store-b'),bBefore=profile(b);
 await themesApi(request('/api/stores/store-a/theme',change()),env,'owner',fetcher);
 const{runThemeJobs}=await import('../scripts/platform-theme-engine.mjs');await runThemeJobs(cf);
 assert.deepEqual(profile(a),{publicOrigin:'https://store-a.test',metaPixelId:'',mobileProductColumns:3,theme:{id:'standard',radius:'round'}});
 assert.deepEqual(profile(b),bBefore);
 assert.equal(control.prepare('SELECT status FROM platform_theme_jobs').get().status,'succeeded');
 assert.equal(a.prepare("SELECT COUNT(*) n FROM admin_audit_log WHERE action='platform.theme.change'").get().n,1);
 const data=await (await themesApi(request('/api/stores/store-a/theme'),env,'owner')).json();assert.deepEqual(data.applied,{id:'standard',radius:'round'});
 // A second change replaces only the theme again.
 await themesApi(request('/api/stores/store-a/theme',change('standard','sharp')),env,'owner',fetcher);await runThemeJobs(cf);
 assert.deepEqual(profile(a).theme,{id:'standard',radius:'sharp'});assert.equal(profile(a).publicOrigin,'https://store-a.test');
});

test('mismatched resources, invalid stored settings and expired requests never write to the store',async()=>{
 const{runThemeJobs}=await import('../scripts/platform-theme-engine.mjs');
 for(const scenario of ['bindings','invalid','expired']){
  const{env,control,stores,cf}=fixture(),a=stores.get('store-a');
  if(scenario==='invalid')a.prepare("UPDATE store_profile SET settings_json='{broken' WHERE id=1").run();
  const before=a.prepare('SELECT settings_json FROM store_profile').get().settings_json;
  await themesApi(request('/api/stores/store-a/theme',change()),env,'owner',fetcher);
  if(scenario==='bindings')cf.bindingsFor=[{name:'DB',id:'store-b'},{name:'MEDIA',bucket_name:'store-a-media'},{name:'APP_SURFACE',text:'admin'}];
  if(scenario==='expired')control.exec('UPDATE platform_theme_jobs SET expires_at=0');
  await runThemeJobs(cf);
  const job=control.prepare('SELECT status,error_code FROM platform_theme_jobs').get();
  assert.equal(job.status,'failed',scenario);assert.equal(job.error_code,{bindings:'resource_identity_mismatch',invalid:'store_profile_invalid',expired:'theme_request_expired'}[scenario]);
  assert.equal(a.prepare('SELECT settings_json FROM store_profile').get().settings_json,before,scenario);
 }
});

test('theme UI script parses and uses safe DOM text rather than innerHTML',()=>{const{themesScript}=load('platform/control/themes-ui.ts');new Function(themesScript);assert.equal(themesScript.includes('innerHTML'),false)});
