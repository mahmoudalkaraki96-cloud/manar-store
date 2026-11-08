import {radiusOptions,themes,validateTheme} from '../../shared/store-theme';
import type {PublishingEnv} from './publishing-api';
type Row=Record<string,any>;
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9-]{36}$/.test(v);

// First store release that reads each theme. Older stores ignore theme settings, so the platform does not offer them.
export const themeSince:Record<string,string>={standard:'1.7.0'};
const atLeast=(version:string,minimum:string)=>{const a=version.split('.').map(Number),b=minimum.split('.').map(Number);for(let i=0;i<3;i++)if(a[i]!==b[i])return a[i]>b[i];return true};
export function themeSupport(store:Row){
 const version=String(store.app_version||'');
 if(!/^\d+\.\d+\.\d+$/.test(version))return {allowed:[] as string[],reason:'نسخة المتجر غير معروفة للمنصة؛ انشر نسخة 1.7.0 أو أحدث من المنصة أولًا.'};
 const allowed=Object.keys(themes).filter(id=>themeSince[id]&&atLeast(version,themeSince[id]));
 return {allowed,reason:allowed.length?'':'نسخة المتجر '+version+' لا تدعم الثيمات؛ انشر نسخة 1.7.0 أو أحدث أولًا.'};
}
const ready=(store:Row,r:Row)=>store.status==='active'&&Boolean(r.adminWorker&&r.databaseId&&r.mediaBucket);

async function wake(env:PublishingEnv,job:string,fetcher:typeof fetch){
 try{const u=new URL(env.PLATFORM_RELEASE_BUILD_HOOK||'');if(u.origin!=='https://api.cloudflare.com'||!/^\/client\/v4\/workers\/builds\/deploy_hooks\/[a-f0-9-]{36}$/.test(u.pathname)||u.search||u.hash||u.username||u.password)throw Error();
 const r=await fetcher(u,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(15000)}),d=await r.json() as any;if(!r.ok||d.success!==true||!uuid(d.result?.build_uuid))throw Error();
 await env.PLATFORM_DB.prepare('UPDATE platform_theme_jobs SET build_id=?,error_code=NULL,updated_at=? WHERE id=? AND status=?').bind(d.result.build_uuid,Date.now(),job,'queued').run();return true;
 }catch{await env.PLATFORM_DB.prepare("UPDATE platform_theme_jobs SET error_code='build_trigger_failed',updated_at=? WHERE id=? AND status='queued'").bind(Date.now(),job).run();return false}
}

export async function themesApi(request:Request,env:PublishingEnv,actor:string,fetcher:typeof fetch=fetch){
 if(!actor)return json({error:'سجّل الدخول بحساب مالك المنصة.'},401);
 if(request.method!=='GET'&&(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('sec-fetch-site')==='cross-site'))return json({error:'مصدر الطلب غير مسموح.'},403);
 const match=new URL(request.url).pathname.match(/^\/api\/stores\/([a-z0-9-]+)\/theme(?:\/(retry-dispatch))?$/);
 if(!match)return json({error:'المسار غير موجود.'},404);
 const [,storeId,action]=match,db=env.PLATFORM_DB;
 try{
 const store=await db.prepare('SELECT * FROM platform_stores WHERE id=?').bind(storeId).first<Row>();if(!store)return json({error:'المتجر غير موجود.'},404);
 const r=JSON.parse(store.resources_json||'{}'),support=themeSupport(store);
 if(request.method==='GET'&&!action){
  const jobs=(await db.prepare('SELECT id,theme_json,status,stage,error_code,created_at,updated_at FROM platform_theme_jobs WHERE store_id=? ORDER BY created_at DESC LIMIT 10').bind(storeId).all<Row>()).results.map((job:Row):Row=>({...job,theme:JSON.parse(job.theme_json),theme_json:undefined}));
  return json({ready:ready(store,r),version:store.app_version||null,allowed:support.allowed,reason:support.reason,applied:jobs.find(job=>job.status==='succeeded')?.theme||null,jobs,
   themes:Object.entries(themes).map(([id,theme])=>({id,label:theme.label,since:themeSince[id]||null})),radius:Object.entries(radiusOptions).map(([id,option])=>({id,label:option.label}))});
 }
 if(request.method!=='POST')return json({error:'الطريقة غير مسموحة.'},405);
 if(action==='retry-dispatch'){
  const job=await db.prepare("SELECT id,expires_at FROM platform_theme_jobs WHERE store_id=? AND status='queued' ORDER BY created_at DESC LIMIT 1").bind(storeId).first<Row>();
  if(!job)return json({error:'لا يوجد تغيير ثيم ينتظر المشغّل.'},409);
  if(job.expires_at<Date.now()){await db.prepare("UPDATE platform_theme_jobs SET status='failed',stage='needs_review',error_code='theme_request_expired',updated_at=? WHERE id=? AND status='queued'").bind(Date.now(),job.id).run();return json({error:'انتهت مهلة الطلب؛ اختر الثيم من جديد.'},409)}
  return json({ok:true,started:await wake(env,job.id,fetcher)},202);
 }
 const raw=await request.text();if(raw.length>2000)return json({error:'البيانات أكبر من المسموح.'},413);let b:Row;try{b=JSON.parse(raw)}catch{return json({error:'بيانات غير صحيحة.'},400)}
 if(!b||!uuid(b.requestKey))return json({error:'معرّف الطلب غير صالح.'},400);
 const existing=await db.prepare('SELECT id,store_id FROM platform_theme_jobs WHERE request_key=?').bind(b.requestKey).first<Row>();
 if(existing)return existing.store_id===storeId?json({ok:true,jobId:existing.id,alreadyQueued:true},202):json({error:'معرّف الطلب مستخدم لعملية أخرى.'},409);
 if(!ready(store,r))return json({error:'المتجر غير مربوط بالمنصة بشكل كامل بعد.'},409);
 let theme;try{theme=validateTheme({id:b.id,radius:b.radius})}catch(error){return json({error:error instanceof Error?error.message:'الثيم غير صالح.'},400)}
 if(!support.allowed.includes(theme.id))return json({error:support.reason||'هذا الثيم غير متاح لنسخة المتجر الحالية.'},409);
 const now=Date.now(),jobId=crypto.randomUUID();
 await db.batch([
  db.prepare('INSERT INTO platform_theme_jobs(id,store_id,theme_json,snapshot_json,requested_by,request_key,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(jobId,storeId,JSON.stringify(theme),JSON.stringify({databaseId:r.databaseId,mediaBucket:r.mediaBucket,adminWorker:r.adminWorker}),actor,b.requestKey,now+1800000,now,now),
  db.prepare('INSERT INTO platform_audit(id,actor,action,store_id,details_json,created_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),actor,'theme.change_requested',storeId,JSON.stringify({jobId,theme}),now)
 ]);
 return json({ok:true,jobId,started:await wake(env,jobId,fetcher)},202);
 }catch(error){if(/UNIQUE constraint|constraint failed/i.test(String(error)))return json({error:'يوجد تغيير ثيم قيد التنفيذ لهذا المتجر؛ انتظر اكتماله.'},409);console.error('platform_theme_operation_failed');return json({error:'تعذر حفظ طلب تغيير الثيم.'},500)}
}
