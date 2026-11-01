
import {hashPassword,passwordInput} from '../../worker/admin-security';
import type {PublishingEnv} from './publishing-api';
type Row=Record<string,any>;
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9-]{36}$/.test(v);
async function wake(env:PublishingEnv,job:string,fetcher:typeof fetch){
 try{const u=new URL(env.PLATFORM_RELEASE_BUILD_HOOK||'');if(u.origin!=='https://api.cloudflare.com'||!/^\/client\/v4\/workers\/builds\/deploy_hooks\/[a-f0-9-]{36}$/.test(u.pathname)||u.search||u.hash||u.username||u.password)throw Error();
 const r=await fetcher(u,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(15000)}),d=await r.json() as any;if(!r.ok||d.success!==true||!uuid(d.result?.build_uuid))throw Error();
 await env.PLATFORM_DB.prepare('UPDATE platform_account_jobs SET build_id=?,error_code=NULL,updated_at=? WHERE id=? AND status=?').bind(d.result.build_uuid,Date.now(),job,'queued').run();return true;
 }catch{await env.PLATFORM_DB.prepare("UPDATE platform_account_jobs SET error_code='build_trigger_failed',updated_at=? WHERE id=? AND status='queued'").bind(Date.now(),job).run();return false}
}
export async function accountsApi(request:Request,env:PublishingEnv,actor:string,fetcher:typeof fetch=fetch){
 if(!actor)return json({error:'سجّل الدخول بحساب مالك المنصة.'},401);
 if(request.method!=='GET'&&(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('sec-fetch-site')==='cross-site'))return json({error:'مصدر الطلب غير مسموح.'},403);
 const path=new URL(request.url).pathname,match=path.match(/^\/api\/stores\/([a-z0-9-]+)\/admin-accounts(?:\/([a-f0-9-]{36})\/(reset-password|retry-create|disable|enable|retry-dispatch))?$/);
 if(!match)return json({error:'المسار غير موجود.'},404);
 const [,storeId,accountId,action]=match,db=env.PLATFORM_DB;
 try{
 const store=await db.prepare('SELECT * FROM platform_stores WHERE id=?').bind(storeId).first<Row>();if(!store)return json({error:'المتجر غير موجود.'},404);
 const r=JSON.parse(store.resources_json||'{}');
 if(request.method==='GET'&&!accountId){
 const accounts=await db.prepare('SELECT id,email,name,status,user_id,created_at,updated_at FROM platform_admin_accounts WHERE store_id=? ORDER BY created_at DESC').bind(storeId).all<Row>();
 const jobs=await db.prepare('SELECT id,account_id,operation,status,stage,error_code,updated_at FROM platform_account_jobs WHERE store_id=? ORDER BY created_at DESC LIMIT 100').bind(storeId).all<Row>();
 return json({accounts:accounts.results.map(a=>({...a,job:jobs.results.find(j=>j.account_id===a.id)})),adminUrl:r.adminUrl||'',ready:store.status==='active'&&Boolean(r.adminWorker&&r.databaseId&&r.mediaBucket)});
 }
 if(request.method!=='POST')return json({error:'الطريقة غير مسموحة.'},405);
 if(store.status!=='active'||!r.adminWorker||!r.databaseId||!r.mediaBucket)return json({error:'جهّز المتجر أولًا قبل إضافة حساب مدير.'},409);
 let account:Row|null=null;if(accountId){account=await db.prepare('SELECT * FROM platform_admin_accounts WHERE id=? AND store_id=?').bind(accountId,storeId).first<Row>();if(!account)return json({error:'الحساب غير موجود في هذا المتجر.'},404)}
 if(action==='retry-dispatch'){
 const job=await db.prepare("SELECT id,expires_at FROM platform_account_jobs WHERE account_id=? AND store_id=? AND status='queued' ORDER BY created_at DESC LIMIT 1").bind(accountId,storeId).first<Row>();
 if(!job)return json({error:'لا توجد عملية تنتظر المشغّل.'},409);if(job.expires_at<Date.now()){await db.batch([db.prepare("UPDATE platform_account_jobs SET status='failed',stage='needs_review',error_code='account_request_expired',password_hash=NULL,password_salt=NULL,updated_at=? WHERE id=? AND status='queued'").bind(Date.now(),job.id),db.prepare("UPDATE platform_admin_accounts SET status='failed',updated_at=? WHERE id=? AND store_id=? AND user_id IS NULL").bind(Date.now(),accountId,storeId)]);return json({error:'انتهت مهلة العملية؛ أعد فتح التفاصيل وجرّب بكلمة مرور جديدة.'},409)}return json({ok:true,started:await wake(env,job.id,fetcher)},202);
 }
 const raw=await request.text();if(raw.length>3000)return json({error:'البيانات أكبر من المسموح.'},413);let b:Row;try{b=JSON.parse(raw)}catch{return json({error:'بيانات غير صحيحة.'},400)}
 if(!b||!uuid(b.requestKey))return json({error:'معرّف الطلب غير صالح.'},400);
 const existing=await db.prepare('SELECT id,store_id,account_id FROM platform_account_jobs WHERE request_key=?').bind(b.requestKey).first<Row>();
 if(existing)return existing.store_id===storeId&&(!accountId||existing.account_id===accountId)?json({ok:true,jobId:existing.id,alreadyQueued:true},202):json({error:'معرّف الطلب مستخدم لعملية أخرى.'},409);
 let email=account?.email||String(b.email||'').trim().toLowerCase(),name=account?.name||String(b.name||'').trim();
 if(!/^\S+@\S+\.\S+$/.test(email)||email.length>254||!name||name.length>100)return json({error:'أدخل الاسم وبريدًا إلكترونيًا صحيحًا.'},400);
 if(accountId&&!['reset-password','retry-create','enable','disable'].includes(action||''))return json({error:'عملية غير صحيحة.'},400);
 if(account&&(action==='retry-create'?account.status!=='failed'||Boolean(account.user_id):!account.user_id||!['active','disabled'].includes(account.status)))return json({error:'الحساب لم يكتمل تجهيزه بعد.'},409);
 const pending=await db.prepare("SELECT id FROM platform_account_jobs WHERE store_id=? AND status IN ('queued','running') LIMIT 20").bind(storeId).all();
 if(pending.results.length>=20)return json({error:'انتظر اكتمال العمليات الحالية.'},429);
 const operation=action==='reset-password'?'reset':action==='retry-create'?'create':action||'create',now=Date.now(),id=accountId||crypto.randomUUID(),jobId=crypto.randomUUID();
 let hash:string|null=null,salt:string|null=null;
 if(operation==='create'||operation==='reset'){let password:string;try{password=passwordInput(b.password)}catch{return json({error:'كلمة المرور من 6 إلى 128 خانة، حروف أو أرقام.'},400)}salt=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');hash=await hashPassword(password,salt);password='';delete b.password;}
 const statements=[];if(account&&operation==='create')statements.push(db.prepare("UPDATE platform_admin_accounts SET status='pending',updated_at=? WHERE id=? AND store_id=?").bind(now,id,storeId));
 if(!account)statements.push(db.prepare("INSERT INTO platform_admin_accounts(id,store_id,email,name,status,created_at,updated_at) VALUES(?,?,?,?,'pending',?,?)").bind(id,storeId,email,name,now,now));
 statements.push(db.prepare('INSERT INTO platform_account_jobs(id,account_id,store_id,operation,password_hash,password_salt,snapshot_json,requested_by,request_key,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(jobId,id,storeId,operation,hash,salt,JSON.stringify({databaseId:r.databaseId,mediaBucket:r.mediaBucket,adminWorker:r.adminWorker}),actor,b.requestKey,now+1800000,now,now));
 statements.push(db.prepare('INSERT INTO platform_audit(id,actor,action,store_id,details_json,created_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),actor,'admin_account.'+operation+'_requested',storeId,JSON.stringify({accountId:id,jobId}),now));
 await db.batch(statements);return json({ok:true,jobId,accountId:id,started:await wake(env,jobId,fetcher)},202);
 }catch(error){if(/UNIQUE constraint|constraint failed/i.test(String(error)))return json({error:'البريد مسجل لهذا المتجر أو توجد عملية قيد التنفيذ للحساب.'},409);console.error('platform_account_operation_failed');return json({error:'تعذر حفظ عملية حساب المدير.'},500)}
}
