import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {client,query,ROOT,PUBLISHING,ReleaseFailure,safeResources,verifyBindings,verifyArtifact,storefrontConfig,wrangler,command,safeError} from './platform-publish-common.mjs';
import {parseManifest} from '../platform/control/publishing-model.ts';

export async function executeTargets(targets,adapter){
 // Complete every preflight before activating any store.
 const prepared=[];
 for(const target of targets)prepared.push(await adapter.prepare(target));
 const results=[];
 for(let i=0;i<targets.length;i++){
  try{results.push({id:targets[i].id,ok:true,...await adapter.activate(targets[i],prepared[i])})}
  catch(error){await adapter.failed(targets[i],error);results.push({id:targets[i].id,ok:false})}
 }
 return results;
}
export async function run(){
 const cf=client(),lease=crypto.randomUUID();
 // Never retry a crashed activation automatically: its live outcome needs review.
 await query(cf,"UPDATE platform_release_targets SET status='failed',stage='needs_review',error_code='runner_interrupted',updated_at=? WHERE status='running' AND batch_id IN (SELECT id FROM platform_release_batches WHERE status='running' AND lease_until<?)",[Date.now(),Date.now()]);
 await query(cf,"UPDATE platform_release_targets SET status='failed',stage='not_started',error_code='runner_interrupted',updated_at=? WHERE status='queued' AND batch_id IN (SELECT id FROM platform_release_batches WHERE status='running' AND lease_until<?)",[Date.now(),Date.now()]);
 await query(cf,"UPDATE platform_release_batches SET status='failed',error_code='runner_interrupted',updated_at=? WHERE status='running' AND lease_until<?",[Date.now(),Date.now()]);
 for(let count=0;count<20;count++){
 const batch=(await query(cf,"UPDATE platform_release_batches SET status='running',lease_token=?,lease_until=?,updated_at=? WHERE id=(SELECT id FROM platform_release_batches WHERE status IN ('queued','dispatch_failed') ORDER BY created_at LIMIT 1) AND status IN ('queued','dispatch_failed') RETURNING *",[lease,Date.now()+3600000,Date.now()]))[0];
 if(!batch)break;
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'store-release-'));
 const targets=await query(cf,"SELECT * FROM platform_release_targets WHERE batch_id=? AND status='queued' ORDER BY store_id",[batch.id]);
 const update=async(t,status,stage,code=null)=>query(cf,'UPDATE platform_release_targets SET status=?,stage=?,error_code=?,updated_at=? WHERE id=?',[status,stage,code,Date.now(),t.id]);
 try{
  const manifest=parseManifest(batch.manifest_snapshot_json),artifacts=new Map();
  const adapter={
   async prepare(t){
    await update(t,'running','preflight');
    const snapshot=safeResources(JSON.parse(t.snapshot_json)),cert=manifest.certifications[t.store_id],v=manifest.variants[t.track];
    if(!cert||!v||cert.worker!==snapshot.worker||cert.databaseId!==snapshot.databaseId||cert.mediaBucket!==snapshot.mediaBucket||cert.track!==t.track||v.version!==t.version||v.revision!==t.revision)throw new ReleaseFailure('resource_identity_mismatch');
    const store=(await query(cf,'SELECT * FROM platform_stores WHERE id=?',[t.store_id]))[0],r=JSON.parse(store?.resources_json||'{}');
    if(store?.status!=='active'||r.storefrontWorker!==snapshot.worker||r.databaseId!==snapshot.databaseId||r.mediaBucket!==snapshot.mediaBucket||store.app_version!==snapshot.currentVersion||store.app_revision!==snapshot.currentRevision)throw new ReleaseFailure('store_changed_after_preview');
    const settings=await cf.call('/workers/scripts/'+snapshot.worker+'/settings');verifyBindings(settings,snapshot);
    const previous=await cf.call('/workers/scripts/'+snapshot.worker+'/deployments');
    if(!previous.deployments?.length)throw new ReleaseFailure('missing_previous_deployment');
    await query(cf,'UPDATE platform_release_targets SET previous_versions_json=? WHERE id=?',[JSON.stringify(previous.deployments[0].versions),t.id]);
    if(!artifacts.has(t.track)){
     const archive=path.join(temp,t.track+'.tar.gz'),dir=path.join(temp,t.track);fs.mkdirSync(dir);
     wrangler(['r2','object','get',PUBLISHING.artifactBucket+'/'+v.artifactKey,'--remote','--file',archive]);verifyArtifact(archive,v);
     command('tar',['-xzf',archive,'-C',dir]);
     if(fs.readFileSync(path.join(dir,'VERSION'),'utf8').trim()!==v.version||!fs.existsSync(path.join(dir,'dist/server/index.js')))throw new ReleaseFailure('artifact_version_mismatch');
     artifacts.set(t.track,dir);
    }
    return {snapshot,settings,dir:artifacts.get(t.track)};
   },
   async activate(t,p){
    await update(t,'running','upload');
    const config=path.join(p.dir,t.store_id+'.jsonc');fs.writeFileSync(config,JSON.stringify(storefrontConfig(t.store_id,p.snapshot,p.settings)));
    const tag='release-'+t.id,output=wrangler(['versions','upload','--config',config,'--keep-vars','--tag',tag,'--message',tag]);
    const id=output.match(/Worker Version ID:\s*([a-f0-9-]{36})/i)?.[1];
    if(!id)throw new ReleaseFailure('uploaded_version_unknown');
    // Recheck current identities immediately before activation.
    verifyBindings(await cf.call('/workers/scripts/'+p.snapshot.worker+'/settings'),p.snapshot);
    await query(cf,'UPDATE platform_release_targets SET worker_version_id=?,stage=\'activate\' WHERE id=?',[id,t.id]);
    await cf.call('/workers/scripts/'+p.snapshot.worker+'/deployments','POST',{strategy:'percentage',versions:[{version_id:id,percentage:100}]});
    await update(t,'running','verify');
    verifyBindings(await cf.call('/workers/scripts/'+p.snapshot.worker+'/settings'),p.snapshot);
    let verified=false;
    for(let attempt=0;attempt<6&&!verified;attempt++){
     const deployments=await cf.call('/workers/scripts/'+p.snapshot.worker+'/deployments');
     const active=deployments.deployments?.[0]?.versions?.some(v=>v.version_id===id&&v.percentage===100);
     const response=await fetch(p.snapshot.storefrontUrl+'?release-check='+t.id,{redirect:'manual',signal:AbortSignal.timeout(20000)});
     const catalog=await fetch(new URL('/api/catalog',p.snapshot.storefrontUrl),{redirect:'manual',signal:AbortSignal.timeout(20000)});
     verified=Boolean(active&&response.ok&&catalog.ok);await response.body?.cancel();await catalog.body?.cancel();
     if(!verified)await new Promise(resolve=>setTimeout(resolve,5000));
    }
    if(!verified)throw new ReleaseFailure('live_verification_failed');
    const store=(await query(cf,'SELECT resources_json FROM platform_stores WHERE id=?',[t.store_id]))[0],resources=JSON.parse(store.resources_json);resources.storefrontVersion=t.version;resources.storefrontRevision=t.revision;
    await query(cf,'UPDATE platform_stores SET app_version=?,app_revision=?,resources_json=?,updated_at=? WHERE id=?',[t.version,t.revision,JSON.stringify(resources),Date.now(),t.store_id]);
    await query(cf,"INSERT INTO platform_audit(id,actor,action,store_id,details_json,created_at) VALUES(?,?,'release.verified',?,?,?)",[crypto.randomUUID(),batch.actor,t.store_id,JSON.stringify({batchId:batch.id,version:t.version,revision:t.revision,workerVersion:id}),Date.now()]);
    await query(cf,"UPDATE platform_release_targets SET status='succeeded',stage='complete',verified_at=?,updated_at=? WHERE id=?",[Date.now(),Date.now(),t.id]);return {workerVersion:id};
   },
   async failed(t,error){await update(t,'failed','needs_review',safeError(error))}
  };
  const results=await executeTargets(targets,adapter);await query(cf,'UPDATE platform_release_batches SET status=?,updated_at=? WHERE id=? AND lease_token=?',[results.every(r=>r.ok)?'succeeded':results.some(r=>r.ok)?'partial':'failed',Date.now(),batch.id,lease]);
 }catch(error){await query(cf,"UPDATE platform_release_targets SET status='failed',stage='preflight_failed',error_code=?,updated_at=? WHERE batch_id=? AND status IN ('queued','running')",[safeError(error),Date.now(),batch.id]);await query(cf,"UPDATE platform_release_batches SET status='failed',error_code=?,updated_at=? WHERE id=?",[safeError(error),Date.now(),batch.id]);}
 finally{fs.rmSync(temp,{recursive:true,force:true})}
 }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))run().catch(error=>{console.error(safeError(error));process.exitCode=1});
