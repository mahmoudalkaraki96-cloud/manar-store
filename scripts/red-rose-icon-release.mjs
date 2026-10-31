import fs from 'node:fs';import path from 'node:path';import {cloudflareClient}from'./platform-cloudflare.mjs';
const account='008c61df8c322c27b8d1c1137922e328',id='red-rose',revision='b772775dd3289c7ff7825668269ce52eaa730aaa',version='1.2.2';
const cf=cloudflareClient(account,process.env.CLOUDFLARE_API_TOKEN),control=JSON.parse(fs.readFileSync('platform/control/resources.json','utf8')).databaseId;
const result=await cf.query(control,'SELECT * FROM platform_stores WHERE id=?',[id]),store=result.flatMap(r=>r.results||[])[0],r=JSON.parse(store?.resources_json||'{}'),name=r.storefrontWorker,origin=r.storefrontUrl;
if(store?.status!=='active'||r.schemaOwnedByStore!==id||!name?.startsWith('tenant-'+id+'-')||!r.databaseId||!r.mediaBucket)throw Error('Unverified existing store');
function bindings(settings){if(settings.bindings.find(b=>b.name==='DB')?.id!==r.databaseId||settings.bindings.find(b=>b.name==='MEDIA')?.bucket_name!==r.mediaBucket)throw Error('Store resource mismatch')}
if(process.argv[2]==='preflight'){
 const runtime=path.resolve('runtime');if(fs.readFileSync(path.join(runtime,'VERSION'),'utf8').trim()!==version)throw Error('Runtime version mismatch');
 const settings=await cf.call('/workers/scripts/'+name+'/settings');bindings(settings);
 const allowed=new Set(['DB','MEDIA','IMAGES','ASSETS']);for(const b of settings.bindings)if(!['plain_text','json','secret_text'].includes(b.type)&&!allowed.has(b.name))throw Error('Unreviewed binding '+b.name);
 const cronResult=await cf.call('/workers/scripts/'+name+'/schedules'),crons=(Array.isArray(cronResult)?cronResult:cronResult.schedules||[]).map(s=>s.cron);
 const config={name,main:'./dist/server/index.js',compatibility_date:'2026-08-22',compatibility_flags:['nodejs_compat'],no_bundle:true,rules:[{type:'ESModule',globs:['**/*.js','**/*.mjs']}],assets:{directory:'./dist/client',binding:'ASSETS',run_worker_first:['/_store/favicon','/manifest.webmanifest','/admin-manifest.webmanifest']},workers_dev:true,preview_urls:false,d1_databases:[{binding:'DB',database_name:r.databaseName,database_id:r.databaseId}],r2_buckets:[{binding:'MEDIA',bucket_name:r.mediaBucket}],images:{binding:'IMAGES'},vars:{APP_SURFACE:'storefront',STORE_KEY:id},triggers:{crons},observability:{enabled:true}};
 fs.writeFileSync(path.join(runtime,'.existing-store-icon.jsonc'),JSON.stringify(config,null,2));console.log(JSON.stringify({store:id,worker:name,database:r.databaseName,bucket:r.mediaBucket,migrations:false,reinitialization:false,adminDeployment:false}));
}else if(process.argv[2]==='verify'){
 bindings(await cf.call('/workers/scripts/'+name+'/settings'));
 const settings=(await(await fetch(origin+'/api/storefront')).json()).settings;
 const icon=await fetch(origin+'/_store/favicon?v='+version,{redirect:'manual'});if(icon.status!==302||icon.headers.get('location')!==new URL(settings.faviconUrl||settings.logoUrl,origin).toString())throw Error('Icon does not match current store settings');
 const image=await fetch(icon.headers.get('location'));if(!image.ok||!image.headers.get('content-type')?.startsWith('image/'))throw Error('Configured image unavailable');
 await cf.query(control,"UPDATE platform_stores SET app_version=?,app_revision=?,resources_json=json_set(resources_json,'$.storefrontVersion',?,'$.storefrontRevision',?,'$.adminVersion',COALESCE(json_extract(resources_json,'$.adminVersion'),app_version)),updated_at=? WHERE id=?",[version,revision,version,revision,Date.now(),id]);
 await cf.query(control,"INSERT INTO platform_audit(id,actor,action,store_id,details_json,created_at) VALUES(?,?,'store.release_verified',?,?,?)",[crypto.randomUUID(),'platform-release',id,JSON.stringify({version,revision,surface:'storefront',operation:'favicon-fix'}),Date.now()]);
 console.log(JSON.stringify({store:id,version,revision,icon:icon.headers.get('location'),imageStatus:image.status,isolation:'verified',dataReinitialized:false}));
}else throw Error('Expected preflight or verify');
