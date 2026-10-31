import fs from 'node:fs';
import path from 'node:path';
import{client,query,ROOT,PUBLISHING,sha256,wrangler,safeResources,verifyBindings,ReleaseFailure,safeError}from'./platform-publish-common.mjs';
// Explicitly reviewed, immutable source revisions; no arbitrary checkout from UI.
const candidates={legacy:{revision:'070137743e4bc34a66239017d576589a500a79bb',version:'1.1.5'},generic:{revision:'b772775dd3289c7ff7825668269ce52eaa730aaa',version:'1.2.2'}};
export async function prepare(){
 const cf=client(),id='favicon-2026-10-31',manifest={schemaVersion:1,variants:{},certifications:{}};
 // Fail rather than adopting an unrelated pre-existing bucket.
 const buckets=await cf.call('/r2/buckets'),exists=(buckets.buckets||[]).some(b=>b.name===PUBLISHING.artifactBucket);
 const existing=(await query(cf,'SELECT * FROM platform_releases WHERE id=?',[id]))[0];
 if(exists&&!existing)throw new ReleaseFailure('artifact_bucket_requires_review');
 if(!exists)await cf.call('/r2/buckets','POST',{name:PUBLISHING.artifactBucket});
 for(const[track,candidate]of Object.entries(candidates)){
  const dir=path.join(ROOT,'release-'+track),file=path.join(ROOT,track+'.tar.gz');
  if(fs.readFileSync(path.join(dir,'VERSION'),'utf8').trim()!==candidate.version)throw new ReleaseFailure('artifact_version_mismatch');
  const {execFileSync}=await import('node:child_process');
  if(execFileSync('git',['rev-parse','HEAD'],{cwd:dir,encoding:'utf8'}).trim()!==candidate.revision)throw new ReleaseFailure('artifact_source_mismatch');
  execFileSync('tar',['-czf',file,'-C',dir,'dist','VERSION']);
  const hash=sha256(file),key='releases/'+id+'/'+track+'-'+hash+'.tar.gz';
  wrangler(['r2','object','put',PUBLISHING.artifactBucket+'/'+key,'--file',file,'--remote']);
  manifest.variants[track]={...candidate,artifactKey:key,sha256:hash,surfaces:['storefront']};
 }
 const stores=await query(cf,"SELECT * FROM platform_stores WHERE status='active'"),registry=JSON.parse(fs.readFileSync(path.join(ROOT,'platform/stores.json')));
 for(const store of stores){
  const r=JSON.parse(store.resources_json||'{}'),legacy=registry.stores.find(s=>s.id===store.id);
  if(legacy){if(r.databaseId!==legacy.database.id||r.mediaBucket!==legacy.mediaBucket)throw new ReleaseFailure('resource_identity_mismatch');const config=fs.readFileSync(path.join(ROOT,legacy.storefrontConfig),'utf8');r.storefrontWorker=config.match(/"name"\s*:\s*"([^"]+)"/)?.[1];}
  const snapshot=safeResources({worker:r.storefrontWorker,...r});
  const settings=await cf.call('/workers/scripts/'+snapshot.worker+'/settings');verifyBindings(settings,snapshot);
  const db=await cf.call('/d1/database/'+r.databaseId);if(db.name!==r.databaseName)throw new ReleaseFailure('resource_identity_mismatch');
  const tables=await cf.query(r.databaseId,"SELECT name FROM sqlite_master WHERE type='table' AND name IN ('products','store_settings')");
  if((tables[0]?.results||[]).length!==2)throw new ReleaseFailure('unsupported_store_schema');
  const track=legacy?'legacy':r.schemaOwnedByStore?'generic':null;if(!track)continue;
  manifest.certifications[store.id]={track,worker:r.storefrontWorker,databaseId:r.databaseId,mediaBucket:r.mediaBucket};
  await query(cf,'UPDATE platform_stores SET resources_json=? WHERE id=?',[JSON.stringify(r),store.id]);
 }
 // An approved release is immutable; a repeated build may not replace its artifacts.
 if(existing?.status==='ready'&&JSON.stringify(JSON.parse(existing.manifest_json).variants)!==JSON.stringify(manifest.variants))throw new ReleaseFailure('release_already_approved');
 await query(cf,"INSERT INTO platform_releases(id,title,notes,manifest_json,status,created_at) VALUES(?,?,?,?,'ready',?) ON CONFLICT(id) DO UPDATE SET manifest_json=excluded.manifest_json,status='ready'",[id,'تصحيح أيقونة المتجر','تحديث واجهة المتجر فقط؛ يحافظ على قاعدة البيانات والصور والإعدادات. لكل متجر نسخة متوافقة مع مساره الحالي.',JSON.stringify(manifest),Date.now()]);
 console.log(JSON.stringify({releaseId:id,stores:Object.keys(manifest.certifications),status:'ready'}));
}
prepare().catch(e=>{console.error(safeError(e));process.exitCode=1});
