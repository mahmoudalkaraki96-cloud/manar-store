import {scrypt,randomBytes,timingSafeEqual} from 'node:crypto';
import {permissions,defaultGroups,validPermissions,modulePermission,type Permission} from '../shared/admin-permissions';

interface Statement {bind(...values:unknown[]):Statement;first<T=Record<string,unknown>>():Promise<T|null>;all<T=Record<string,unknown>>():Promise<{results:T[]}>;run():Promise<{meta:{changes?:number;last_row_id?:number|string}}>}
export interface SecurityDb {prepare(sql:string):Statement;batch(statements:Statement[]):Promise<unknown[]>}
export interface SecurityEnv {DB:SecurityDb;ADMIN_OWNER_EMAIL?:string;ADMIN_OWNER_CF_EMAIL?:string;ADMIN_CF_TEAM?:string;ADMIN_CF_AUD?:string}
type Row=Record<string,any>;
export type AdminActor={id:number;email:string;name:string;owner:boolean;permissions:Permission[];mustChangePassword:boolean;hasPassword:boolean;method:string;version:number};
export class SecurityError extends Error {constructor(message:string,public status=400){super(message)}}
const COOKIE='__Host-manar_admin_session',MAX_AGE=8*60*60;
const response=(body:unknown,status=200,headers:HeadersInit={})=>Response.json(body,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff',...headers}});
const hex=()=>randomBytes(32).toString('hex');
export async function digest(text:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('')}
export async function hashPassword(password:string,salt:string){return new Promise<string>((resolve,reject)=>scrypt(password,Buffer.from(salt,'hex'),32,{N:16384,r:8,p:1,maxmem:64*1024*1024},(error,key)=>error?reject(error):resolve('scrypt$'+key.toString('hex'))))}
async function matches(password:string,salt:string,stored:string){const value=await hashPassword(password,salt);const a=Buffer.from(value),b=Buffer.from(stored);return a.length===b.length&&timingSafeEqual(a,b)}
export function passwordInput(value:unknown){if(typeof value!=='string'||value.length<12||value.length>128)throw new SecurityError('كلمة المرور يجب أن تكون من 12 إلى 128 خانة');return value}
const emailInput=(value:unknown)=>{const valueText=String(value||'').trim().toLowerCase();if(valueText.length>254||!/^\S+@\S+\.\S+$/.test(valueText))throw new SecurityError('البريد الإلكتروني غير صحيح');return valueText};
const integer=(v:unknown)=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<1)throw new SecurityError('المعرف غير صحيح');return n};
export async function jsonBody(request:Request){if(Number(request.headers.get('content-length')||0)>32000)throw new SecurityError('البيانات كبيرة جدًا',413);const s=await request.text();if(s.length>32000)throw new SecurityError('البيانات كبيرة جدًا',413);try{const b=JSON.parse(s);if(!b||Array.isArray(b)||typeof b!=='object')throw Error();return b as Row}catch{throw new SecurityError('بيانات غير صحيحة')}}
export function sameOrigin(request:Request){return request.headers.get('origin')===new URL(request.url).origin&&request.headers.get('sec-fetch-site')!=='cross-site'}
function cookie(token:string,maxAge=MAX_AGE){return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`}
function readCookie(request:Request){return (request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||''}

let keysCache:{team:string;keys:(JsonWebKey&{kid?:string})[];until:number}|null=null;
const decode=(s:string)=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
export async function verifyAccessToken(token:string,team:string,audience:string,fetcher:typeof fetch=fetch,diagnostic:(reason:string)=>void=()=>{}):Promise<string|null>{
 try{
  if(!/^[a-z0-9-]+$/.test(team)||!audience||token.length>12000)return null;
  const parts=token.split('.');if(parts.length!==3)return null;
  const head=JSON.parse(new TextDecoder().decode(decode(parts[0]))),claims=JSON.parse(new TextDecoder().decode(decode(parts[1]))),now=Date.now()/1000;
  if(head.alg!=='RS256'||typeof head.kid!=='string'||claims.iss!==`https://${team}.cloudflareaccess.com`||!Array.isArray(claims.aud)||!claims.aud.includes(audience)||typeof claims.exp!=='number'||claims.exp<=now||typeof claims.iat!=='number'||claims.iat>now+30||claims.nbf&&claims.nbf>now+30||typeof claims.email!=='string')return null;
  if(!keysCache||keysCache.team!==team||keysCache.until<Date.now()||!keysCache.keys.some(k=>k.kid===head.kid)){
   const r=await fetcher(`https://${team}.cloudflareaccess.com/cdn-cgi/access/certs`,{redirect:'manual'});if(!r.ok){diagnostic('key_fetch_'+r.status);return null}const data=await r.json() as {keys:(JsonWebKey&{kid?:string})[]};if(!Array.isArray(data.keys)){diagnostic('key_format');return null}keysCache={team,keys:data.keys,until:Date.now()+300000};
  }
  const jwk=keysCache.keys.find(k=>k.kid===head.kid&&k.kty==='RSA');if(!jwk){diagnostic('key_missing');return null}
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]))){diagnostic('signature');return null}
  return claims.email.toLowerCase();
 }catch(error){diagnostic('verification_'+(error instanceof Error?error.name:'error'));return null}
}
async function bootstrapOwner(env:SecurityEnv){
 if(!env.ADMIN_OWNER_EMAIL)return;
 const now=Date.now(),email=emailInput(env.ADMIN_OWNER_EMAIL);
 await env.DB.prepare('INSERT OR IGNORE INTO admin_users(email,name,is_owner,active,created_at,updated_at) VALUES(?,?,1,1,?,?)').bind(email,'المدير الرئيسي',now,now).run();
}
async function actorFromUser(env:SecurityEnv,user:Row,method:string):Promise<AdminActor>{
 const direct=await env.DB.prepare('SELECT permission FROM admin_user_permissions WHERE user_id=? UNION SELECT gp.permission FROM admin_group_permissions gp JOIN admin_group_members gm ON gm.group_id=gp.group_id WHERE gm.user_id=?').bind(user.id,user.id).all<{permission:string}>();
 return {id:Number(user.id),email:user.email,name:user.name,owner:!!user.is_owner,permissions:user.is_owner?[...permissions]:direct.results.map(r=>r.permission).filter(p=>permissions.includes(p as Permission)) as Permission[],mustChangePassword:!!user.must_change_password&&(method!=='cloudflare'||!!user.password_hash),hasPassword:!!user.password_hash,method,version:Number(user.auth_version)};
}
export async function currentActor(request:Request,env:SecurityEnv):Promise<AdminActor|null>{
 const token=readCookie(request);
 if(token&&/^[a-f0-9]{64}$/.test(token)){
  const user=await env.DB.prepare('SELECT u.*,s.method FROM admin_sessions s JOIN admin_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? AND s.auth_version=u.auth_version AND u.active=1').bind(await digest(token),Date.now()).first<Row>();
  if(user)return actorFromUser(env,user,String(user.method));
  // A revoked local session must not silently reauthenticate through Access.
  return null;
 }
 if(token)return null;
 const assertion=request.headers.get('cf-access-jwt-assertion')||(request.headers.get('cookie')||'').split(';').map(value=>value.trim()).find(value=>value.startsWith('CF_Authorization='))?.slice('CF_Authorization='.length);
 if(!assertion||!env.ADMIN_CF_TEAM||!env.ADMIN_CF_AUD)return null;
 const email=await verifyAccessToken(assertion,env.ADMIN_CF_TEAM,env.ADMIN_CF_AUD);if(!email)return null;
 await bootstrapOwner(env);
 const ownerCf=(env.ADMIN_OWNER_CF_EMAIL||env.ADMIN_OWNER_EMAIL||'').toLowerCase();
 const loginEmail=email===ownerCf?(env.ADMIN_OWNER_EMAIL||email):email;
 const user=await env.DB.prepare('SELECT * FROM admin_users WHERE email=? AND active=1').bind(loginEmail).first<Row>();
 return user?actorFromUser(env,user,'cloudflare'):null;
}
async function session(env:SecurityEnv,actor:AdminActor){const token=hex(),now=Date.now();await env.DB.prepare('INSERT INTO admin_sessions(token_hash,user_id,auth_version,method,created_at,expires_at) VALUES(?,?,?,?,?,?)').bind(await digest(token),actor.id,actor.version,actor.method,now,now+MAX_AGE*1000).run();return cookie(token)}
export function requirePermission(actor:AdminActor,permission:Permission){if(!actor.owner&&!actor.permissions.includes(permission))throw new SecurityError('لا تملك صلاحية تنفيذ هذه العملية',403)}
export function safeAuditDetails(value:unknown,depth=0):unknown{
 if(depth>4)return '[مختصر]';if(value==null||typeof value==='boolean'||typeof value==='number')return value;
 if(typeof value==='string')return value.slice(0,300);
 if(Array.isArray(value))return value.slice(0,30).map(v=>safeAuditDetails(v,depth+1));
 if(typeof value==='object')return Object.fromEntries(Object.entries(value as Row).filter(([k])=>!/(password|secret|salt|token|cookie|authorization|credential|hash|image.*base64)/i.test(k)&&! /^(auth|endpoint|p256dh)$/i.test(k)).slice(0,50).map(([k,v])=>[k,safeAuditDetails(v,depth+1)]));
 return undefined;
}
export async function audit(env:SecurityEnv,actor:AdminActor|null,action:string,target:string,status:number,details:unknown={}){await env.DB.prepare('INSERT INTO admin_audit_log(actor_id,actor_label,action,target,status,details,created_at) VALUES(?,?,?,?,?,?,?)').bind(actor?.id||null,actor?.email||'غير مسجل',action.slice(0,100),target.slice(0,300),status,JSON.stringify(safeAuditDetails(details)).slice(0,12000),Date.now()).run()}
async function limitLogin(request:Request,env:SecurityEnv,email:string){
 const now=Date.now(),keys=['email:'+email,'ip:'+(request.headers.get('cf-connecting-ip')||'unknown')];
 for(let i=0;i<keys.length;i++){
  const key=await digest(keys[i]);await env.DB.prepare('INSERT INTO admin_login_limits(key_hash,count,reset_at) VALUES(?,1,?) ON CONFLICT(key_hash) DO UPDATE SET count=CASE WHEN reset_at<=? THEN 1 ELSE count+1 END,reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END').bind(key,now+900000,now,now).run();
  const row=await env.DB.prepare('SELECT count FROM admin_login_limits WHERE key_hash=?').bind(key).first<{count:number}>();if(Number(row?.count)>(i===0?10:50))throw new SecurityError('محاولات كثيرة؛ انتظر 15 دقيقة',429);
 }
}
export async function authApi(request:Request,env:SecurityEnv):Promise<Response>{
 const path=new URL(request.url).pathname;
 try{
  if(request.method!=='GET'&&!sameOrigin(request))throw new SecurityError('مصدر الطلب غير مسموح',403);
  if(path==='/api/admin/auth/login'&&request.method==='POST'){
   const body=await jsonBody(request),email=emailInput(body.email),password=typeof body.password==='string'?body.password:'';await limitLogin(request,env,email);
   const user=await env.DB.prepare('SELECT * FROM admin_users WHERE email=? AND active=1').bind(email).first<Row>();
   const okay=password.length<=128&&await matches(password,user?.password_salt||'00'.repeat(16),user?.password_hash||'scrypt$'+'00'.repeat(32));
   if(!user||!okay||user.password_expires_at&&user.password_expires_at<Date.now()){await audit(env,null,'auth.login.failed','admin',401);throw new SecurityError('البريد أو كلمة المرور غير صحيحة أو انتهت صلاحية الكلمة المؤقتة',401)}
   const actor=await actorFromUser(env,user,'password');await audit(env,actor,'auth.login','admin',200);
   return response({actor},200,{'set-cookie':await session(env,actor)});
  }
  const actor=await currentActor(request,env);
  if(!actor)throw new SecurityError('سجّل الدخول إلى لوحة الإدارة',401);
  if(path==='/api/admin/auth/me'&&request.method==='GET')return response({actor});
  if(path==='/api/admin/auth/activity'&&request.method==='POST'){
   const body=await jsonBody(request),module=String(body.module||'');if(!modulePermission[module])throw new SecurityError('الصفحة غير صحيحة');requirePermission(actor,modulePermission[module]);await audit(env,actor,'page.open',module,200);return response({ok:true});
  }
  if(path==='/api/admin/auth/logout'&&request.method==='POST'){
   const token=readCookie(request);if(token)await env.DB.prepare('UPDATE admin_sessions SET revoked_at=? WHERE token_hash=?').bind(Date.now(),await digest(token)).run();
   await audit(env,actor,'auth.logout','admin',200);return response({ok:true},200,{'set-cookie':cookie('signedout')});
  }
  if(path==='/api/admin/auth/password'&&request.method==='POST'){
   const body=await jsonBody(request),password=passwordInput(body.newPassword),row=await env.DB.prepare('SELECT password_hash,password_salt FROM admin_users WHERE id=?').bind(actor.id).first<Row>();
   if(actor.method!=='cloudflare'&&(!row?.password_hash||!await matches(String(body.currentPassword||''),row.password_salt,row.password_hash)))throw new SecurityError('كلمة المرور الحالية غير صحيحة',403);
   const salt=randomBytes(16).toString('hex'),hash=await hashPassword(password,salt),now=Date.now();
   const guard=hex();const updates=[env.DB.prepare('INSERT INTO admin_mutation_guards(token,valid) VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM admin_users WHERE id=? AND auth_version=? AND active=1) THEN 1 ELSE 0 END)').bind(guard,actor.id,actor.version),env.DB.prepare('UPDATE admin_users SET password_hash=?,password_salt=?,must_change_password=0,password_expires_at=NULL,auth_version=auth_version+1,updated_at=? WHERE id=? AND auth_version=?').bind(hash,salt,now,actor.id,actor.version),env.DB.prepare('UPDATE admin_sessions SET revoked_at=? WHERE user_id=?').bind(now,actor.id),env.DB.prepare('DELETE FROM admin_mutation_guards WHERE token=?').bind(guard)];await env.DB.batch(updates);
   const fresh=await env.DB.prepare('SELECT * FROM admin_users WHERE id=? AND active=1').bind(actor.id).first<Row>();if(!fresh)throw new SecurityError('الحساب غير متاح',401);
   const next=await actorFromUser(env,fresh,'password');await audit(env,next,'auth.password.changed','admin',200);
   return response({actor:next},200,{'set-cookie':await session(env,next)});
  }
  throw new SecurityError('Not Found',404);
 }catch(error){if(error instanceof SecurityError)return response({error:error.message},error.status);throw error}
}

export function routePermission(path:string,method:string):Permission[]|null{
 const read=method==='GET';
 if(path==='/api/admin/navigation')return [];
 if(path==='/api/admin/dashboard'||path==='/api/admin/live-activity'||path==='/api/admin/carts'||path==='/api/admin/cart-metrics')return ['dashboard.read'];
 if(path==='/api/admin/marketing-analytics')return ['analytics.read'];
 if(path==='/api/admin/catalog')return ['products.read','orders.write','content.write','suppliers.write','settings.write'];
 if(path==='/api/admin/orders/customers')return ['orders.write'];
 if(path.startsWith('/api/admin/orders'))return [method==='DELETE'||path.endsWith('/restore')?'orders.delete':read?'orders.read':'orders.write'];
 if(path.startsWith('/api/admin/customer-ledger'))return [read?'customers.read':'customers.write'];
 if(path.startsWith('/api/admin/customer-accounts'))return ['customers.password'];
 if(path.startsWith('/api/admin/security/users'))return ['users.manage'];
 if(path.startsWith('/api/admin/security/groups'))return ['groups.manage'];
 if(path.startsWith('/api/admin/security/audit'))return ['audit.read'];
 if(path==='/api/admin/security/options')return ['users.manage','groups.manage'];
 if(path.startsWith('/api/admin/push/'))return path.endsWith('/campaign')?['notifications.write']:path.endsWith('/summary')?['dashboard.read','notifications.write']:path.endsWith('/subscribe')?['orders.read']:[];
 if(path.includes('/suppliers')||path.includes('/purchases')||path.includes('/supplier-import')||path==='/api/admin/import-products'||path==='/api/admin/operations')return ['suppliers.write'];
 if(path.includes('/shipping-zones'))return ['shipping.write'];
 if(path.includes('/products/')||path==='/api/admin/products'||path==='/api/admin/ai-image')return ['products.write'];
 if(path.includes('/categories'))return ['categories.write'];
 if(path.includes('/media'))return ['products.write','content.write','categories.write','settings.write'];
 if(path.includes('/storefront')||path.includes('/highlights')||path.includes('/policies')||path.includes('/sliders')||path.includes('/popup'))return ['content.write','settings.write'];
 if(path==='/api/admin/settings')return ['settings.write'];
 return null;
}

async function groupPermissions(env:SecurityEnv,ids:number[]){if(!ids.length)return [] as Permission[];const result=await env.DB.prepare(`SELECT permission FROM admin_group_permissions WHERE group_id IN (${ids.map(()=>'?').join(',')})`).bind(...ids).all<{permission:Permission}>();return result.results.map(r=>r.permission)}
function canGrant(actor:AdminActor,grants:Permission[]){if(!actor.owner&&grants.some(p=>!actor.permissions.includes(p)))throw new SecurityError('لا يمكنك منح صلاحية لا تملكها',403)}
async function editableUser(env:SecurityEnv,actor:AdminActor,id:number){const row=await env.DB.prepare('SELECT * FROM admin_users WHERE id=?').bind(id).first<Row>();if(!row)throw new SecurityError('المستخدم غير موجود',404);if(row.is_owner)throw new SecurityError('حساب المدير الرئيسي يُعدّل من حسابه فقط',403);if(id===actor.id)throw new SecurityError('لا يمكنك تغيير صلاحيات حسابك أو تعطيله بنفسك',403);const target=await actorFromUser(env,row,'password');canGrant(actor,target.permissions);return row}
export async function securityApi(request:Request,env:SecurityEnv,actor:AdminActor):Promise<Response|null>{
 const path=new URL(request.url).pathname;
 if(!path.startsWith('/api/admin/security/'))return null;
 try{
  const idMatch=path.match(/^\/api\/admin\/security\/users\/(\d+)(\/password)?$/),groupMatch=path.match(/^\/api\/admin\/security\/groups\/(\d+)$/);
  if(path==='/api/admin/security/options'&&request.method==='GET'){
   const groups=await env.DB.prepare('SELECT id,name FROM admin_groups ORDER BY name').all();return response({groups:groups.results,permissions});
  }
  if(path==='/api/admin/security/users'&&request.method==='GET'){
   const [users,members,direct]=await Promise.all([env.DB.prepare('SELECT id,email,name,active,is_owner,must_change_password,created_at FROM admin_users ORDER BY is_owner DESC,id').all(),env.DB.prepare('SELECT user_id,group_id FROM admin_group_members').all(),env.DB.prepare('SELECT user_id,permission FROM admin_user_permissions').all()]);return response({users:users.results,members:members.results,direct:direct.results});
  }
  if(path==='/api/admin/security/groups'&&request.method==='GET'){
   const [groups,grants]=await Promise.all([env.DB.prepare('SELECT id,name FROM admin_groups ORDER BY name').all(),env.DB.prepare('SELECT group_id,permission FROM admin_group_permissions').all()]);return response({groups:groups.results,grants:grants.results});
  }
  if(path==='/api/admin/security/audit'&&request.method==='GET'){
   const url=new URL(request.url),before=Number(url.searchParams.get('before')||Number.MAX_SAFE_INTEGER);if(!Number.isSafeInteger(before)||before<1)throw new SecurityError('صفحة غير صحيحة');
   const rows=await env.DB.prepare('SELECT * FROM admin_audit_log WHERE id<? ORDER BY id DESC LIMIT 100').bind(before).all();return response({events:rows.results});
  }
  if(request.method==='POST'&&path==='/api/admin/security/users'){
   const b=await jsonBody(request),email=emailInput(b.email),name=String(b.name||'').trim().slice(0,100);if(!name)throw new SecurityError('الاسم مطلوب');
   const grants=validPermissions(b.permissions||[]),groups=Array.isArray(b.groupIds)?[...new Set(b.groupIds.map(integer))]:[];canGrant(actor,[...grants,...await groupPermissions(env,groups)]);
   const salt=randomBytes(16).toString('hex'),temporary=hex().slice(0,20),hash=await hashPassword(temporary,salt),now=Date.now();
   if(await env.DB.prepare('SELECT id FROM admin_users WHERE email=?').bind(email).first())throw new SecurityError('البريد مستخدم مسبقًا',409);
   const statements=[env.DB.prepare('INSERT INTO admin_users(email,name,password_hash,password_salt,created_at,updated_at,password_expires_at) VALUES(?,?,?,?,?,?,?)').bind(email,name,hash,salt,now,now,now+86400000),...groups.map(groupId=>env.DB.prepare('INSERT INTO admin_group_members(user_id,group_id) SELECT id,? FROM admin_users WHERE email=?').bind(groupId,email)),...grants.map(p=>env.DB.prepare('INSERT INTO admin_user_permissions(user_id,permission) SELECT id,? FROM admin_users WHERE email=?').bind(p,email))];await env.DB.batch(statements);return response({ok:true,temporaryPassword:temporary});
  }
  if(idMatch&&request.method==='PUT'){
   const id=integer(idMatch[1]);await editableUser(env,actor,id);const b=await jsonBody(request),now=Date.now();
   if(idMatch[2]){const temporary=hex().slice(0,20),salt=randomBytes(16).toString('hex'),hash=await hashPassword(temporary,salt);await env.DB.batch([env.DB.prepare('UPDATE admin_users SET password_hash=?,password_salt=?,must_change_password=1,password_expires_at=?,auth_version=auth_version+1,updated_at=? WHERE id=?').bind(hash,salt,now+86400000,now,id),env.DB.prepare('UPDATE admin_sessions SET revoked_at=? WHERE user_id=?').bind(now,id)]);return response({ok:true,temporaryPassword:temporary})}
   const name=String(b.name||'').trim().slice(0,100);if(!name)throw new SecurityError('الاسم مطلوب');const grants=validPermissions(b.permissions||[]),groups=Array.isArray(b.groupIds)?[...new Set(b.groupIds.map(integer))]:[];canGrant(actor,[...grants,...await groupPermissions(env,groups)]);
   await env.DB.batch([env.DB.prepare('UPDATE admin_users SET name=?,active=?,auth_version=auth_version+1,updated_at=? WHERE id=?').bind(name,b.active===false?0:1,now,id),env.DB.prepare('DELETE FROM admin_group_members WHERE user_id=?').bind(id),env.DB.prepare('DELETE FROM admin_user_permissions WHERE user_id=?').bind(id),...groups.map(g=>env.DB.prepare('INSERT INTO admin_group_members(user_id,group_id) VALUES(?,?)').bind(id,g)),...grants.map(p=>env.DB.prepare('INSERT INTO admin_user_permissions(user_id,permission) VALUES(?,?)').bind(id,p))]);return response({ok:true});
  }
  if((path==='/api/admin/security/groups'&&request.method==='POST')||(groupMatch&&request.method==='PUT')){
   const b=await jsonBody(request),name=String(b.name||'').trim().slice(0,100),grants=validPermissions(b.permissions||[]);if(!name)throw new SecurityError('اسم المجموعة مطلوب');canGrant(actor,grants);const now=Date.now();
   if(groupMatch){const id=integer(groupMatch[1]);canGrant(actor,await groupPermissions(env,[id]));if(!await env.DB.prepare('SELECT id FROM admin_groups WHERE id=?').bind(id).first())throw new SecurityError('المجموعة غير موجودة',404);await env.DB.batch([env.DB.prepare('UPDATE admin_groups SET name=?,updated_at=? WHERE id=?').bind(name,now,id),env.DB.prepare('DELETE FROM admin_group_permissions WHERE group_id=?').bind(id),...grants.map(p=>env.DB.prepare('INSERT INTO admin_group_permissions(group_id,permission) VALUES(?,?)').bind(id,p))])}
   else await env.DB.batch([env.DB.prepare('INSERT INTO admin_groups(name,created_at,updated_at) VALUES(?,?,?)').bind(name,now,now),...grants.map(p=>env.DB.prepare('INSERT INTO admin_group_permissions(group_id,permission) SELECT id,? FROM admin_groups WHERE name=?').bind(p,name))]);return response({ok:true});
  }
  throw new SecurityError('Not Found',404);
 }catch(error){if(error instanceof SecurityError)return response({error:error.message},error.status);if(String(error).includes('UNIQUE'))return response({error:'الاسم أو البريد مستخدم مسبقًا'},409);throw error}
}

export async function initDefaultGroups(env:SecurityEnv){
 const count=await env.DB.prepare('SELECT COUNT(*) AS count FROM admin_groups').first<{count:number}>();if(Number(count?.count)>0)return;
 for(const [name,grants] of Object.entries(defaultGroups)){
  if(await env.DB.prepare('SELECT id FROM admin_groups WHERE name=?').bind(name).first())continue;
  const now=Date.now();await env.DB.batch([env.DB.prepare('INSERT OR IGNORE INTO admin_groups(name,created_at,updated_at) VALUES(?,?,?)').bind(name,now,now),...grants.map(p=>env.DB.prepare('INSERT OR IGNORE INTO admin_group_permissions(group_id,permission) SELECT id,? FROM admin_groups WHERE name=?').bind(p,name))]);
 }
}

export async function cloudflareLogin(request:Request,env:SecurityEnv){
 const assertion=request.headers.get('cf-access-jwt-assertion')||(request.headers.get('cookie')||'').split(';').map(value=>value.trim()).find(value=>value.startsWith('CF_Authorization='))?.slice('CF_Authorization='.length);
 if(!env.ADMIN_CF_TEAM||!env.ADMIN_CF_AUD)return response({error:'إعداد Cloudflare غير مكتمل',code:'access_config'},503);
 if(!assertion)return response({error:'لم تصل جلسة Cloudflare إلى التطبيق؛ أعد تسجيل الدخول عبر Cloudflare',code:'access_token_missing'},403);
 let flags:Record<string,boolean>={};try{const parts=assertion.split('.'),head=JSON.parse(new TextDecoder().decode(decode(parts[0]))),claims=JSON.parse(new TextDecoder().decode(decode(parts[1])));flags={algorithm:head.alg==='RS256',issuer:claims.iss===`https://${env.ADMIN_CF_TEAM}.cloudflareaccess.com`,audience:Array.isArray(claims.aud)&&claims.aud.includes(env.ADMIN_CF_AUD),time:typeof claims.exp==='number'&&claims.exp>Date.now()/1000,identity:typeof claims.email==='string',issued:typeof claims.iat==='number'&&claims.iat<=Date.now()/1000+30,notBefore:!claims.nbf||claims.nbf<=Date.now()/1000+30}}catch{return response({error:'جلسة Cloudflare غير صالحة',code:'access_token_format'},403)}
 let failure='claims';const verifiedEmail=await verifyAccessToken(assertion,env.ADMIN_CF_TEAM,env.ADMIN_CF_AUD,fetch,reason=>{failure=reason});if(!verifiedEmail)return response({error:'تعذر التحقق من جلسة Cloudflare',code:failure,checks:flags},403);
 const cleanHeaders=new Headers(request.headers);const remaining=(request.headers.get('cookie')||'').split(';').filter(value=>!value.trim().startsWith(COOKIE+'=')).join(';');if(remaining)cleanHeaders.set('cookie',remaining);else cleanHeaders.delete('cookie');const actor=await currentActor(new Request(request,{headers:cleanHeaders}),env);
 if(!actor||actor.method!=='cloudflare')return response({error:'لم يتم التحقق من حساب Cloudflare أو الحساب غير مخوّل',code:'access_verification',checks:flags},403);
 await audit(env,actor,'auth.cloudflare','admin',200);return new Response(null,{status:302,headers:{location:'/admin','set-cookie':await session(env,actor),'cache-control':'no-store'}});
}
