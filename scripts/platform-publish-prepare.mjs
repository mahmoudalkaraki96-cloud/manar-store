import fs from 'node:fs';import path from 'node:path';import{execFileSync}from'node:child_process';
import{client,query,ROOT,PUBLISHING,sha256,wrangler,safeResources,verifyBindings,ReleaseFailure,safeError}from'./platform-publish-common.mjs';
export async function prepare(){
 if(process.env.GITHUB_REF!=='refs/heads/main')throw new ReleaseFailure('reviewed_main_required');
 const version=fs.readFileSync(path.join(ROOT,'VERSION'),'utf8').trim();if(version!=='1.4.2')throw new ReleaseFailure('unexpected_release_version');
 const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),cf=client(),id='runtime-'+version,manifest={schemaVersion:1,variants:{},certifications:{}};
 const existing=(await query(cf,'SELECT * FROM platform_releases WHERE id=?',[id]))[0];
 if(existing?.status==='ready'){const previous=JSON.parse(existing.manifest_json);if(previous.variants.shared?.revision!==revision)throw new ReleaseFailure('release_already_approved');console.log(JSON.stringify({releaseId:id,status:'already_ready'}));return}
 const stores=await query(cf,"SELECT * FROM platform_stores WHERE status='active'");
 if(!stores.length)throw new ReleaseFailure('no_ready_stores');
 const identities=new Set();
 for(const store of stores){
  const r=JSON.parse(store.resources_json||'{}');if(!r.unifiedRuntimeReady||r.runtimeSchemaVersion!=='1.3.0')throw new ReleaseFailure('store_upgrade_required');
  const snapshot=safeResources({worker:r.storefrontWorker,...r});
  for(const field of ['databaseId','mediaBucket','storefrontWorker','adminWorker']){const key=field+':'+r[field];if(identities.has(key))throw new ReleaseFailure('cross_store_resource_collision');identities.add(key)}
  for(const surface of ['storefront','admin']){const settings=await cf.call('/workers/scripts/'+r[surface+'Worker']+'/settings');verifyBindings(settings,snapshot,surface);if(surface==='admin'&&!['ADMIN_OWNER_EMAIL','ADMIN_CF_TEAM','ADMIN_CF_AUD'].every(name=>settings.bindings.some(b=>b.name===name&&b.text)))throw new ReleaseFailure('admin_auth_requires_review')}
  const db=await cf.call('/d1/database/'+r.databaseId);if(db.name!==r.databaseName)throw new ReleaseFailure('resource_identity_mismatch');
  manifest.certifications[store.id]={track:'shared',worker:r.storefrontWorker,adminWorker:r.adminWorker,databaseId:r.databaseId,mediaBucket:r.mediaBucket};
 }
 const buckets=await cf.call('/r2/buckets');if(!(buckets.buckets||[]).some(b=>b.name===PUBLISHING.artifactBucket))throw new ReleaseFailure('artifact_bucket_missing');
 const file=path.join(ROOT,'shared-runtime.tar.gz');execFileSync('tar',['-czf',file,'-C',ROOT,'dist','VERSION']);const hash=sha256(file),key='releases/'+id+'/shared-'+hash+'.tar.gz';
 wrangler(['r2','object','put',PUBLISHING.artifactBucket+'/'+key,'--file',file,'--remote']);
 manifest.variants.shared={version,revision,artifactKey:key,sha256:hash,surfaces:['storefront','admin']};
 await query(cf,"INSERT INTO platform_releases(id,title,notes,manifest_json,status,created_at) VALUES(?,?,?,?,'ready',?) ON CONFLICT(id) DO UPDATE SET manifest_json=excluded.manifest_json,status='ready'",[id,'الإصدار الموحّد '+version,'نفس المصدر ورقم الإصدار لواجهة المتجر ولوحة الإدارة. تبقى بيانات وإعدادات كل متجر مستقلة.',JSON.stringify(manifest),Date.now()]);
 await query(cf,"UPDATE platform_releases SET status='archived' WHERE id<>? AND status='ready'",[id]);
 console.log(JSON.stringify({releaseId:id,version,revision,stores:Object.keys(manifest.certifications),status:'ready'}));
}
prepare().catch(e=>{console.error(safeError(e));process.exitCode=1});
