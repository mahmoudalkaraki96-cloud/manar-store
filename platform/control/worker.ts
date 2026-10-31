import {publishingApi} from "./publishing-api";
import {groupProvisioningJobs} from "./job-history";
import {previewIdentity} from '../../worker/preview-access';
import {storeDraft,publicRecord,resourceNames} from './model';
import {html} from './ui';
interface Statement{bind(...values:unknown[]):Statement;all<T=Record<string,unknown>>():Promise<{results:T[]}>;first<T=Record<string,unknown>>():Promise<T|null>;run():Promise<{meta:{changes?:number}}>}
interface Env{PLATFORM_DB:{prepare(sql:string):Statement;batch(statements:Statement[]):Promise<unknown[]>};PREVIEW_ACCESS_TEAM?:string;PREVIEW_ACCESS_AUD?:string;PREVIEW_ALLOWED_EMAILS?:string;PLATFORM_VERSION?:string;PLATFORM_RELEASE_BUILD_HOOK?:string}
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff','x-robots-tag':'noindex, nofollow'}});
async function body(request:Request){const raw=await request.text();if(raw.length>6000)throw Error('الطلب أكبر من المسموح.');const value=JSON.parse(raw);if(!value||Array.isArray(value)||typeof value!=='object')throw Error('بيانات غير صالحة.');return value as Record<string,unknown>}
const audit=(env:Env,actor:string,action:string,id:string,details:unknown={})=>env.PLATFORM_DB.prepare('INSERT INTO platform_audit(id,actor,action,store_id,details_json,created_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),actor,action,id,JSON.stringify(details),Date.now());
export default {async fetch(request:Request,env:Env):Promise<Response>{
 const url=new URL(request.url),actor=await previewIdentity(request,env);
 if(!actor)return json({error:'هذه لوحة خاصة بمالك المنصة. سجّل الدخول باستخدام Cloudflare.'},401);
 if(!env.PLATFORM_DB)return json({error:'قاعدة إدارة المنصة غير مربوطة بعد.'},503);
 try{
 if(!['GET','HEAD'].includes(request.method)&&(request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')==='cross-site'))return json({error:'مصدر الطلب غير مسموح.'},403);
 if(request.method==='GET'&&url.pathname==='/')return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-robots-tag':'noindex, nofollow','x-frame-options':'DENY','referrer-policy':'no-referrer','content-security-policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"}});
 if(url.pathname.startsWith('/api/releases'))return publishingApi(request,env,actor);
 if(request.method==='GET'&&url.pathname==='/api/state'){
  const [stores,jobs,events]=await Promise.all([env.PLATFORM_DB.prepare('SELECT * FROM platform_stores ORDER BY created_at DESC,id').all(),env.PLATFORM_DB.prepare('SELECT id,store_id,operation,status,stage,error_code,attempts,created_at,updated_at FROM platform_jobs ORDER BY created_at DESC LIMIT 40').all(),env.PLATFORM_DB.prepare('SELECT actor,action,store_id,details_json,created_at FROM platform_audit ORDER BY created_at DESC LIMIT 25').all()]);
  return json({version:env.PLATFORM_VERSION||'0.3.0',actor,stores:stores.results.map(publicRecord),jobs:jobs.results,jobGroups:groupProvisioningJobs(jobs.results),events:events.results});
 }
 if(request.method==='POST'&&url.pathname==='/api/stores'){
  const draft=storeDraft(await body(request)),now=Date.now();
  await env.PLATFORM_DB.batch([env.PLATFORM_DB.prepare('INSERT INTO platform_stores(id,name_ar,name_en,owner_email,custom_domain,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(draft.id,draft.nameAr,draft.nameEn,draft.ownerEmail,draft.customDomain,now,now),audit(env,actor,'store.created',draft.id,{name:draft.nameAr})]);
  return json({ok:true,id:draft.id},201);
 }
 const match=url.pathname.match(/^\/api\/stores\/([a-z0-9-]+)(?:\/(prepare|retry|blueprint))?$/);
 if(match){
  const id=match[1],action=match[2],row=await env.PLATFORM_DB.prepare('SELECT * FROM platform_stores WHERE id=?').bind(id).first<Record<string,unknown>>();
  if(!row)return json({error:'المتجر غير موجود.'},404);
  if(request.method==='GET'&&action==='blueprint')return json({store:publicRecord(row),resources:resourceNames(id),isolation:'independent-database-and-media',temporaryDomain:true,ownerSetupPending:!row.owner_email});
  if(request.method==='PUT'&&!action){
   const draft=storeDraft({...await body(request),id});
   if(!['draft','failed','resources_ready'].includes(String(row.status)))return json({error:'تعديل بيانات متجر منشور يتم من لوحة المتجر؛ هذه الشاشة تعدّل بيانات التجهيز.'},409);
   await env.PLATFORM_DB.batch([env.PLATFORM_DB.prepare('UPDATE platform_stores SET name_ar=?,name_en=?,owner_email=?,custom_domain=?,updated_at=? WHERE id=?').bind(draft.nameAr,draft.nameEn,draft.ownerEmail,draft.customDomain,Date.now(),id),audit(env,actor,'store.updated',id)]);return json({ok:true});
  }
  if(request.method==='POST'&&['prepare','retry'].includes(action)){
   if(row.management_mode==='external'||row.status==='active')return json({error:'هذا متجر قائم؛ لا يُعاد تهيئته من معالج المتاجر الجديدة.'},409);
   const running=await env.PLATFORM_DB.prepare("SELECT id FROM platform_jobs WHERE store_id=? AND status IN ('queued','running')").bind(id).first<{id:string}>();
   if(running)return json({ok:true,jobId:running.id,alreadyQueued:true});
   const jobId=crypto.randomUUID(),now=Date.now();
   await env.PLATFORM_DB.batch([env.PLATFORM_DB.prepare("INSERT INTO platform_jobs(id,store_id,operation,requested_by,created_at,updated_at) VALUES(?,?,'prepare',?,?,?)").bind(jobId,id,actor,now,now),env.PLATFORM_DB.prepare("UPDATE platform_stores SET status='queued',updated_at=? WHERE id=?").bind(now,id),audit(env,actor,'store.prepare_requested',id,{jobId})]);
   return json({ok:true,jobId},202);
  }
 }
 return json({error:'المسار غير موجود.'},404);
 }catch(error){const message=error instanceof Error?error.message:'';if(/UNIQUE constraint|constraint failed/i.test(message))return json({error:'الرابط أو الدومين مستخدم، أو توجد عملية تجهيز قيد التنفيذ.'},409);if(error instanceof SyntaxError)return json({error:'بيانات غير صالحة.'},400);if(/اسم المتجر|الرابط المختصر|البريد|دومين|الطلب أكبر|بيانات غير صالحة/.test(message))return json({error:message},400);console.error('platform_operation_failed');return json({error:'تعذر تنفيذ العملية. راجع سجل التشغيل.'},500)}
}};
