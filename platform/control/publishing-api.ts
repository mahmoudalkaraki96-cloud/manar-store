import{buildReleasePlan,planHash,publicRelease,PublishingError,selection,type Row}from'./publishing-model';
interface Statement{bind(...values:unknown[]):Statement;first<T=Row>():Promise<T|null>;all<T=Row>():Promise<{results:T[]}>;run():Promise<{meta:{changes?:number}}>}
export interface PublishingEnv{PLATFORM_DB:{prepare(sql:string):Statement;batch(statements:Statement[]):Promise<unknown[]>};PLATFORM_RELEASE_BUILD_HOOK?:string}
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff','x-robots-tag':'noindex, nofollow'}});
function hookUrl(env:PublishingEnv){try{const u=new URL(env.PLATFORM_RELEASE_BUILD_HOOK||'');if(u.protocol==='https:'&&u.hostname==='api.cloudflare.com'&&!u.username&&!u.password&&!u.search&&!u.hash&&/^\/client\/v4\/workers\/builds\/deploy_hooks\/[a-f0-9-]{36}$/.test(u.pathname))return u.toString()}catch{}return null}
async function input(request:Request){const text=await request.text();if(text.length>10000)throw new PublishingError('بيانات الطلب أكبر من المسموح.');try{const value=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value as Row}catch{throw new PublishingError('بيانات الطلب غير صالحة.')}}
async function readPlan(env:PublishingEnv,body:Row){const chosen=selection(body),release=await env.PLATFORM_DB.prepare('SELECT * FROM platform_releases WHERE id=?').bind(chosen.releaseId).first();if(!release)throw new PublishingError('الإصدار غير موجود.',404);const stores=await env.PLATFORM_DB.prepare('SELECT * FROM platform_stores ORDER BY id').all();const plan=buildReleasePlan(release,stores.results,chosen),manifest=String(release.manifest_json);return {chosen,plan,manifest,hash:await planHash(plan,manifest)}}
const event=(env:PublishingEnv,actor:string,action:string,id:string,details:unknown)=>env.PLATFORM_DB.prepare('INSERT INTO platform_audit(id,actor,action,store_id,details_json,created_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),actor,action,null,JSON.stringify({batchId:id,...details as object}),Date.now());
async function dispatch(env:PublishingEnv,id:string,fetcher:typeof fetch){
 const hook=hookUrl(env);if(!hook)throw new PublishingError('ربط مشغّل النشر لم يكتمل بعد.',503);
 try{
  const response=await fetcher(hook,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(15000)});
  const data=await response.json() as {success?:boolean;result?:{build_uuid?:string}};
  if(!response.ok||data.success!==true||!/^[a-f0-9-]{36}$/.test(data.result?.build_uuid||''))throw Error('trigger_failed');
  await env.PLATFORM_DB.prepare("UPDATE platform_release_batches SET build_id=?,error_code=NULL,updated_at=? WHERE id=? AND status IN ('queued','dispatch_failed')").bind(data.result!.build_uuid,Date.now(),id).run();
  return {ok:true,batchId:id,dispatch:'started'};
 }catch{
  const result=await env.PLATFORM_DB.prepare("UPDATE platform_release_batches SET status='dispatch_failed',error_code='build_trigger_failed',updated_at=? WHERE id=? AND status='queued'").bind(Date.now(),id).run();
  return {ok:true,batchId:id,dispatch:result.meta.changes?'needs_retry':'running'};
 }
}
export async function publishingApi(request:Request,env:PublishingEnv,actor:string,fetcher:typeof fetch=fetch):Promise<Response>{
 if(!actor)return json({error:'سجّل الدخول بحساب مالك المنصة.'},401);
 const url=new URL(request.url);
 if(!['GET','HEAD'].includes(request.method)&&(request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')==='cross-site'))return json({error:'مصدر الطلب غير مسموح.'},403);
 try{
  if(request.method==='GET'&&url.pathname==='/api/releases'){
   const[releases,batches,targets]=await Promise.all([env.PLATFORM_DB.prepare("SELECT * FROM platform_releases WHERE status='ready' ORDER BY created_at DESC").all(),env.PLATFORM_DB.prepare('SELECT id,release_id,selector,actor,status,build_id,error_code,created_at,updated_at FROM platform_release_batches ORDER BY created_at DESC LIMIT 20').all(),env.PLATFORM_DB.prepare('SELECT t.id,t.batch_id,t.store_id,s.name_ar AS store_name,t.version,t.status,t.stage,t.error_code,t.worker_version_id,t.verified_at,t.updated_at FROM platform_release_targets t JOIN platform_stores s ON s.id=t.store_id WHERE t.batch_id IN (SELECT id FROM platform_release_batches ORDER BY created_at DESC LIMIT 20) ORDER BY t.created_at,t.store_id').all()]);
   return json({ready:Boolean(hookUrl(env)),scope:'storefront',releases:releases.results.map(publicRelease),batches:batches.results.map(b=>({...b,targets:targets.results.filter(t=>t.batch_id===b.id)}))});
  }
  if(request.method==='POST'&&url.pathname==='/api/releases/preview'){
   const {plan,hash}=await readPlan(env,await input(request));return json({plan,planHash:hash,ready:Boolean(hookUrl(env))});
  }
  if(request.method==='POST'&&url.pathname==='/api/releases/publish'){
   if(!hookUrl(env))throw new PublishingError('ربط مشغّل النشر لم يكتمل بعد؛ المعاينة متاحة دون نشر.',503);
   const body=await input(request),requestKey=String(body.requestKey||'');if(!/^[a-f0-9-]{36}$/.test(requestKey))throw new PublishingError('معرّف الطلب غير صالح.');
   const existing=await env.PLATFORM_DB.prepare('SELECT id,plan_hash FROM platform_release_batches WHERE request_key=?').bind(requestKey).first();
   if(existing){if(existing.plan_hash!==body.planHash)throw new PublishingError('معرّف الطلب مستخدم لخطة مختلفة.',409);return json({ok:true,batchId:existing.id,alreadyQueued:true},202)}
   const {chosen,plan,hash,manifest}=await readPlan(env,body);
   if(body.planHash!==hash)throw new PublishingError('تغيّر الإصدار أو المتاجر بعد المعاينة؛ راجع الخطة مجددًا.',409);
   if(plan.blocked)throw new PublishingError('بعض المتاجر غير متوافقة مع الإصدار. راجع أسباب المنع في المعاينة.',409);
   if(!plan.deployCount)return json({ok:true,alreadyCurrent:true});
   const id=crypto.randomUUID(),now=Date.now(),statements=[env.PLATFORM_DB.prepare("INSERT INTO platform_release_batches(id,release_id,selector,actor,plan_hash,request_key,manifest_snapshot_json,force_redeploy,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(id,chosen.releaseId,chosen.selector,actor,hash,requestKey,manifest,chosen.forceRedeploy?1:0,now,now)];
   for(const target of plan.targets)statements.push(env.PLATFORM_DB.prepare('INSERT INTO platform_release_targets(id,batch_id,store_id,track,version,revision,snapshot_json,status,stage,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),id,target.storeId,target.track,target.version,target.revision,JSON.stringify(target.snapshot),target.willDeploy?'queued':'skipped',target.willDeploy?'queued':'already_current',now,now));
   statements.push(event(env,actor,'release.requested',id,{releaseId:chosen.releaseId,stores:plan.targets.map(t=>t.storeId),force:chosen.forceRedeploy}));
   await env.PLATFORM_DB.batch(statements);return json(await dispatch(env,id,fetcher),202);
  }
  const match=url.pathname.match(/^\/api\/releases\/batches\/([a-f0-9-]{36})\/(retry-dispatch|cancel)$/);
  if(request.method==='POST'&&match){
   const[id,action]=[match[1],match[2]],batch=await env.PLATFORM_DB.prepare('SELECT * FROM platform_release_batches WHERE id=?').bind(id).first();
   if(!batch)throw new PublishingError('عملية النشر غير موجودة.',404);
   if(!['queued','dispatch_failed'].includes(String(batch.status)))throw new PublishingError('العملية بدأت أو انتهت؛ لا يمكن تغييرها من هنا.',409);
   if(action==='cancel'){
    const now=Date.now();
    await env.PLATFORM_DB.batch([env.PLATFORM_DB.prepare("UPDATE platform_release_batches SET status='cancelled',updated_at=? WHERE id=? AND status IN ('queued','dispatch_failed')").bind(now,id),env.PLATFORM_DB.prepare("UPDATE platform_release_targets SET status='cancelled',stage='cancelled',updated_at=? WHERE batch_id=? AND status='queued' AND EXISTS(SELECT 1 FROM platform_release_batches WHERE id=? AND status='cancelled' AND updated_at=?)").bind(now,id,id,now),env.PLATFORM_DB.prepare("INSERT INTO platform_audit(id,actor,action,store_id,details_json,created_at) SELECT ?,?,'release.cancelled',NULL,?,? WHERE EXISTS(SELECT 1 FROM platform_release_batches WHERE id=? AND status='cancelled' AND updated_at=?)").bind(crypto.randomUUID(),actor,JSON.stringify({batchId:id}),now,id,now)]);
    const current=await env.PLATFORM_DB.prepare('SELECT status FROM platform_release_batches WHERE id=?').bind(id).first();
    if(current?.status!=='cancelled')throw new PublishingError('بدأت العملية قبل الإلغاء؛ راجع حالتها الحالية.',409);return json({ok:true});
   }
   if(!hookUrl(env))throw new PublishingError('ربط مشغّل النشر لم يكتمل بعد.',503);
   await env.PLATFORM_DB.prepare("UPDATE platform_release_batches SET status='queued',error_code=NULL,updated_at=? WHERE id=? AND status='dispatch_failed'").bind(Date.now(),id).run();return json(await dispatch(env,id,fetcher),202);
  }
  return json({error:'مسار نشر غير موجود.'},404);
 }catch(error){if(error instanceof PublishingError)return json({error:error.message},error.status);if(/UNIQUE constraint|constraint failed/i.test(String(error)))return json({error:'هناك نشر جارٍ لأحد المتاجر المختارة. انتظر اكتماله أو راجع العملية السابقة.'},409);console.error('platform_publish_operation_failed');return json({error:'تعذر تنفيذ عملية النشر. راجع سجل التشغيل.'},500)}
}
