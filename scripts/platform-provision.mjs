import fs from 'node:fs';import path from 'node:path';import {fileURLToPath}from'node:url';import{execFileSync}from'node:child_process';
import{cloudflareClient,splitSql,tenantNames,assertManagedStore,tenantConfig}from'./platform-cloudflare.mjs';
import{createHash}from'node:crypto';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const settings=JSON.parse(fs.readFileSync(path.join(ROOT,'platform/control/settings.json'),'utf8'));
const resourcesFile=path.join(ROOT,'platform/control/resources.json');
const cf=()=>cloudflareClient(settings.accountId,process.env.CLOUDFLARE_API_TOKEN);
const rows=result=>result.flatMap(r=>r.results||[]);
function controlId(){const r=JSON.parse(fs.readFileSync(resourcesFile,'utf8'));if(r.databaseName!==settings.databaseName)throw Error('platform_database_mismatch');return r.databaseId}
async function q(client,sql,params=[]){return rows(await client.query(controlId(),sql,params))}
async function bootstrap(){
 const client=cf();let resource;
 if(fs.existsSync(resourcesFile)){resource=JSON.parse(fs.readFileSync(resourcesFile,'utf8'));const found=await client.call('/d1/database/'+resource.databaseId);if(found.name!==settings.databaseName)throw Error('platform_database_mismatch')}
 else{const list=await client.call('/d1/database?per_page=100');if(list.some(r=>r.name===settings.databaseName))throw Error('platform_database_requires_explicit_adoption');const created=await client.call('/d1/database','POST',{name:settings.databaseName});resource={databaseName:settings.databaseName,databaseId:created.uuid};fs.writeFileSync(resourcesFile,JSON.stringify(resource,null,2)+'\n')}
 const schema=fs.readFileSync(path.join(ROOT,'platform/control/schema.sql'),'utf8');await client.query(resource.databaseId,schema);
 const accounts=path.join(ROOT,'platform/control/accounts-schema.sql');if(fs.existsSync(accounts))await client.query(resource.databaseId,fs.readFileSync(accounts,'utf8'));
 const publishing=path.join(ROOT,'platform/control/publishing-schema.sql');if(fs.existsSync(publishing))await client.query(resource.databaseId,fs.readFileSync(publishing,'utf8'));
 const registry=JSON.parse(fs.readFileSync(path.join(ROOT,'platform/stores.json'),'utf8'));
 for(const store of registry.stores){const now=Date.now(),owned={databaseName:store.database.name,databaseId:store.database.id,mediaBucket:store.mediaBucket,storefrontUrl:store.storefrontUrl,adminUrl:store.adminUrl};await client.query(resource.databaseId,"INSERT OR IGNORE INTO platform_stores(id,name_ar,status,resources_json,management_mode,created_at,updated_at) VALUES(?,?,'active',?,'external',?,?)",[store.id,store.name,JSON.stringify(owned),now,now])}
 const config={name:settings.workerName,main:'./platform/control/worker.ts',compatibility_date:'2026-08-22',compatibility_flags:['nodejs_compat'],workers_dev:true,preview_urls:false,d1_databases:[{binding:'PLATFORM_DB',database_name:resource.databaseName,database_id:resource.databaseId}],vars:{PREVIEW_ACCESS_TEAM:settings.team,PREVIEW_ACCESS_AUD:settings.audience,PREVIEW_ALLOWED_EMAILS:settings.allowedEmails.join(','),PLATFORM_VERSION:settings.version},observability:{enabled:true}};
 fs.writeFileSync(path.join(ROOT,'platform-control.generated.jsonc'),JSON.stringify(config,null,2)+'\n');console.log(JSON.stringify({platformDatabase:resource,config:'platform-control.generated.jsonc'}));
}
async function plan(){const client=cf(),jobs=await q(client,"SELECT store_id FROM platform_jobs WHERE status='queued' ORDER BY created_at LIMIT 1");if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,'needed='+(jobs.length?'true':'false')+'\n');console.log(JSON.stringify({queued:jobs.length,store:jobs[0]?.store_id||null}))}
async function prepare(){
 const client=cf(),job= (await q(client,"SELECT * FROM platform_jobs WHERE status='queued' ORDER BY created_at LIMIT 1"))[0];if(!job){console.log('No queued stores');return}
 const lease=crypto.randomUUID(),now=Date.now();const claimed=await q(client,"UPDATE platform_jobs SET status='running',stage='claim',lease_token=?,lease_until=?,attempts=attempts+1,updated_at=? WHERE id=? AND status='queued' RETURNING id",[lease,now+1800000,now,job.id]);if(!claimed.length)return;
 let stage='claim';const store=(await q(client,'SELECT * FROM platform_stores WHERE id=?',[job.store_id]))[0];let resources=JSON.parse(store.resources_json||'{}');
 const save=async(next)=>{stage=next;await q(client,"UPDATE platform_jobs SET stage=?,updated_at=? WHERE id=? AND lease_token=?",[stage,Date.now(),job.id,lease]);await q(client,"UPDATE platform_stores SET status='provisioning',resources_json=?,updated_at=? WHERE id=?",[JSON.stringify(resources),Date.now(),store.id])};
 try{
  const names=assertManagedStore(store),runtime=path.resolve(ROOT,process.env.PLATFORM_RUNTIME_DIR||'runtime'),release=JSON.parse(fs.readFileSync(path.join(ROOT,'platform/runtime-release.json'),'utf8'));
  if(release.reviewed!==true||!/^[a-f0-9]{40}$/.test(release.revision))throw Error('runtime_release_not_reviewed');
  if(execFileSync('git',['rev-parse','HEAD'],{cwd:runtime,encoding:'utf8'}).trim()!==release.revision||fs.readFileSync(path.join(runtime,'VERSION'),'utf8').trim()!==release.version)throw Error('runtime_revision_mismatch');
  const baseline=fs.readFileSync(path.join(runtime,'db/store-baseline.sql'),'utf8');if(/INSERT\s+(?:OR\s+\w+\s+)?INTO\s+[`"']?(products|orders|users|customer_accounts|admin_users)\b/i.test(baseline))throw Error('baseline_contains_customer_data');
  const sub=(await client.call('/workers/subdomain')).subdomain;if(!/^[a-z0-9-]+$/.test(sub))throw Error('worker_subdomain_missing');
  resources={...resources,...names,storeId:store.id,ownerEmail:store.owner_email||null,ownerSetupPending:!store.owner_email};
  await save('database');
  if(!resources.databaseId){const list=await client.call('/d1/database?per_page=100');if(list.some(r=>r.name===names.databaseName))throw Error('resource_name_conflict');const db=await client.call('/d1/database','POST',{name:names.databaseName});resources.databaseId=db.uuid;resources.schemaOwnedByStore=store.id;await save('database')}
  const dbInfo=await client.call('/d1/database/'+resources.databaseId);if(dbInfo.name!==names.databaseName)throw Error('resource_identity_mismatch');
  await save('media');
  if(!resources.mediaCreated){const listed=await client.call('/r2/buckets?per_page=1000');const buckets=Array.isArray(listed)?listed:listed.buckets||[];if(buckets.some(b=>b.name===names.mediaBucket))throw Error('resource_name_conflict');await client.call('/r2/buckets','POST',{name:names.mediaBucket});resources.mediaCreated=true;await save('media')}
  await save('schema');
  if(!resources.schemaInitialized){
   if(resources.schemaOwnedByStore!==store.id)throw Error('database_not_owned_by_provisioner');
   const digest=createHash('sha256').update(baseline).digest('hex');if(resources.baselineDigest&&resources.baselineDigest!==digest)throw Error('baseline_changed_during_resume');resources.baselineDigest=digest;await save('schema');
   const existing=rows(await client.query(resources.databaseId,"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('_cf_METADATA')"));
   for(const name of ['products','orders','users','customer_accounts'])if(existing.some(row=>row.name===name)){const counts=rows(await client.query(resources.databaseId,'SELECT COUNT(*) AS total FROM '+name));if(Number(counts[0]?.total))throw Error('new_database_contains_customer_data')}
   const statements=splitSql(baseline).map(sql=>sql.replace(/^CREATE TABLE\s+(?!IF NOT EXISTS)/i,'CREATE TABLE IF NOT EXISTS ').replace(/^CREATE (UNIQUE )?INDEX\s+(?!IF NOT EXISTS)/i,(_,unique)=>'CREATE '+(unique||'')+'INDEX IF NOT EXISTS ').replace(/^INSERT INTO (store_settings|store_profile|d1_migrations)\b/i,'INSERT OR IGNORE INTO $1'));
   for(let i=0;i<statements.length;i+=18)await client.query(resources.databaseId,statements.slice(i,i+18).join('\n'));resources.schemaInitialized=true;await save('schema');
  }
  const storefrontUrl='https://'+names.storefrontWorker+'.'+sub+'.workers.dev',adminUrl='https://'+names.adminWorker+'.'+sub+'.workers.dev';
  await save('identity');
  if(!resources.identityInitialized){await client.query(resources.databaseId,'UPDATE store_settings SET store_name=?,site_name_ar=?,site_name_en=?,primary_color=?,secondary_color=?,background_color=?,updated_at=? WHERE id=1',[store.name_ar,store.name_ar,store.name_en,'#475569','#94a3b8','#ffffff',Date.now()]);await client.query(resources.databaseId,'UPDATE store_profile SET settings_json=?,updated_at=? WHERE id=1',[JSON.stringify({publicOrigin:storefrontUrl,googleAnalyticsId:'',googleAnalyticsEnabled:false,metaPixelId:'',metaPixelEnabled:false}),Date.now()]);resources.identityInitialized=true;await save('identity')}
  const binary=path.join(runtime,'node_modules/wrangler/bin/wrangler.js');if(!fs.existsSync(path.join(runtime,'dist/server/index.js')))throw Error('runtime_build_missing');
  for(const surface of ['storefront','admin']){await save(surface);const config=tenantConfig(names,resources,surface,settings,sub),filename='.platform-'+surface+'.jsonc';fs.writeFileSync(path.join(runtime,filename),JSON.stringify(config,null,2)+'\n');execFileSync(process.execPath,[binary,'deploy','--config',filename,'--tag',release.version,'--message','New isolated store '+store.id],{cwd:runtime,stdio:['ignore','pipe','pipe'],timeout:180000});resources[surface+'Deployed']=true;await save(surface)}
  await save('verify');let verified=false;
  for(let attempt=0;attempt<6;attempt++){
   const responses=await Promise.all([fetch(storefrontUrl+'/',{redirect:'manual'}),fetch(storefrontUrl+'/api/catalog?setup='+job.id,{redirect:'manual'}),fetch(adminUrl+'/admin/login',{redirect:'manual'}),fetch(adminUrl+'/api/admin/orders',{redirect:'manual'})]);
   const statuses=responses.map(r=>r.status);
   if(statuses[0]===200&&statuses[1]===200&&statuses[2]===200&&statuses[3]===401){const publicCatalog=await responses[1].json();if(!Array.isArray(publicCatalog.products)||publicCatalog.products.length)throw Error('new_store_catalog_not_empty');verified=true;break}
   console.log(JSON.stringify({stage:'verify',attempt:attempt+1,statuses}));if(attempt<5)await new Promise(resolve=>setTimeout(resolve,10000));
  }
  if(!verified)throw Error('live_verification_failed');
  resources={...resources,storefrontUrl,adminUrl,ownerSetupPending:!store.owner_email,cloudflareLoginLinkPending:true,verifiedAt:Date.now()};
  await q(client,"UPDATE platform_stores SET status='active',resources_json=?,app_version=?,app_revision=?,updated_at=? WHERE id=?",[JSON.stringify(resources),release.version,release.revision,Date.now(),store.id]);
  await q(client,"UPDATE platform_jobs SET status='succeeded',stage='complete',lease_until=NULL,error_code=NULL,updated_at=? WHERE id=? AND lease_token=?",[Date.now(),job.id,lease]);await q(client,"INSERT INTO platform_audit(id,actor,action,store_id,details_json,created_at) VALUES(?,?,'runner.completed',?,?,?)",[crypto.randomUUID(),'platform-runner',store.id,JSON.stringify({revision:release.revision,version:release.version}),Date.now()]);console.log(JSON.stringify({store:store.id,status:'active',storefrontUrl,adminUrl,ownerSetupPending:!store.owner_email}));
 }catch(error){const code=String(error.code||error.message||'provision_failed').replace(/[^a-z0-9_]/gi,'_').slice(0,100);await q(client,"UPDATE platform_jobs SET status='failed',stage=?,error_code=?,lease_until=NULL,updated_at=? WHERE id=? AND lease_token=?",[stage,code,Date.now(),job.id,lease]);if(store?.management_mode==='managed'&&store.status!=='active')await q(client,"UPDATE platform_stores SET status='failed',resources_json=?,updated_at=? WHERE id=?",[JSON.stringify(resources),Date.now(),store.id]);await q(client,"INSERT INTO platform_audit(id,actor,action,store_id,details_json,created_at) VALUES(?,?,'runner.failed',?,?,?)",[crypto.randomUUID(),'platform-runner',store.id,JSON.stringify({stage,code}),Date.now()]);console.error(JSON.stringify({store:store.id,stage,code}));process.exitCode=1}
}
const action=process.argv[2];try{if(action==='bootstrap')await bootstrap();else if(action==='plan')await plan();else if(action==='prepare')await prepare();else throw Error('Expected bootstrap, plan or prepare')}catch(error){console.error(String(error.code||error.message||'platform_failed'));process.exitCode=1}
