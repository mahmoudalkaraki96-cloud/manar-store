import {currentActor,authApi,securityApi,routePermission,sameOrigin,SecurityError,safeAuditDetails,audit,type SecurityEnv,type AdminActor,initDefaultGroups} from './admin-security';

export async function adminRequest(request:Request,env:SecurityEnv,handler:()=>Promise<Response|null>):Promise<Response>{
 const url=new URL(request.url),path=url.pathname;
 if(path.startsWith('/api/admin/auth/'))return authApi(request,env);
 let actor:AdminActor|null=null;
 try{
  actor=await currentActor(request,env);
  if(!actor)throw new SecurityError('سجّل الدخول إلى لوحة الإدارة',401);
  if(request.method!=='GET'&&request.method!=='HEAD'&&!sameOrigin(request))throw new SecurityError('مصدر الطلب غير مسموح',403);
  if(actor.mustChangePassword)throw new SecurityError('عيّن كلمة مرور جديدة أولًا',428);
  const required=routePermission(path,request.method);
  if(required===null||required.length&&!actor.owner&&!required.some(p=>actor!.permissions.includes(p)))throw new SecurityError('لا تملك صلاحية الوصول لهذه العملية',403);
  if(path==='/api/admin/navigation'){
   const can=(p:string)=>actor!.owner||actor!.permissions.includes(p as any);
   const row=await env.DB.prepare('SELECT (SELECT COUNT(*) FROM orders WHERE deleted_at IS NULL) AS orders,(SELECT COUNT(*) FROM orders WHERE deleted_at IS NULL AND status=\'new\') AS newOrders,(SELECT COUNT(*) FROM categories) AS categories,(SELECT COUNT(*) FROM store_highlights) AS highlights').first<Record<string,number>>();
   return Response.json({orders:can('orders.read')?row?.orders:undefined,newOrders:can('orders.read')?row?.newOrders:undefined,categories:can('products.read')?row?.categories:undefined,highlights:can('content.write')?row?.highlights:undefined},{headers:{'cache-control':'no-store'}});
  }
  const mutation=!['GET','HEAD'].includes(request.method),record=mutation||['/api/admin/orders','/api/admin/customer-ledger','/api/admin/security/users','/api/admin/security/groups','/api/admin/security/audit'].includes(path),logId=crypto.randomUUID();let details:unknown={requestId:logId};
  if(mutation&&request.headers.get('content-type')?.includes('application/json')){const length=Number(request.headers.get('content-length')||0);if(length<32000){const text=await request.clone().text();if(text.length<=32000){try{details={requestId:logId,changes:safeAuditDetails(JSON.parse(text))}}catch{}}}}
  let auditId:number|string|undefined;
  if(record){const logged=await env.DB.prepare('INSERT INTO admin_audit_log(actor_id,actor_label,action,target,status,details,created_at) VALUES(?,?,?,?,102,?,?)').bind(actor.id,actor.email,request.method,path,JSON.stringify(details).slice(0,12000),Date.now()).run();auditId=logged.meta.last_row_id;}
  try{
   if(actor.owner&&path.startsWith('/api/admin/security/'))await initDefaultGroups(env);
   const result=await securityApi(request,env,actor)||await handler()||Response.json({error:'Not Found'},{status:404});
   if(auditId!=null)await env.DB.prepare('UPDATE admin_audit_log SET status=? WHERE id=?').bind(result.status,auditId).run().catch(()=>console.error('audit_completion_failed'));
   const headers=new Headers(result.headers);headers.set('cache-control','no-store');return new Response(result.body,{status:result.status,headers});
  }catch(error){if(auditId!=null)await env.DB.prepare('UPDATE admin_audit_log SET status=? WHERE id=?').bind(error instanceof SecurityError?error.status:500,auditId).run().catch(()=>console.error('audit_completion_failed'));throw error}
 }catch(error){if(error instanceof SecurityError){if(actor)await audit(env,actor,request.method+'.denied',path,error.status);return Response.json({error:error.message},{status:error.status,headers:{'cache-control':'no-store'}})}throw error}
}
