// Web Push encryption (RFC 8291) and VAPID (RFC 8292), using Worker Web Crypto.
type Result={results:Record<string,unknown>[];meta:{changes?:number}};
type Statement={bind(...values:unknown[]):Statement;first<T=Record<string,unknown>>():Promise<T|null>;all<T=Record<string,unknown>>():Promise<{results:T[]}>;run():Promise<Result>};
export type PushEnv={DB:{prepare(sql:string):Statement};APP_SURFACE?:string};
const enc=new TextEncoder();
export function bytes64(value:string){return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))}
export function base64url(value:Uint8Array){return btoa(String.fromCharCode(...value)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
const join=(...parts:Uint8Array[])=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const p of parts){out.set(p,offset);offset+=p.length}return out};
async function hash(value:string){return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value))))}
async function hkdf(input:Uint8Array,salt:Uint8Array,info:Uint8Array,length:number){const key=await crypto.subtle.importKey('raw',input,'HKDF',false,['deriveBits']);return new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt,info},key,length*8))}
export async function encryptPush(subscription:{p256dh:string;auth:string},payload:string){
 const recipient=bytes64(subscription.p256dh),auth=bytes64(subscription.auth);
 const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const sender=new Uint8Array(await crypto.subtle.exportKey('raw',pair.publicKey));
 const pub=await crypto.subtle.importKey('raw',recipient,{name:'ECDH',namedCurve:'P-256'},false,[]);
 const shared=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:pub},pair.privateKey,256));
 const ikm=await hkdf(shared,auth,join(enc.encode('WebPush: info\0'),recipient,sender),32);
 const salt=crypto.getRandomValues(new Uint8Array(16));
 const cek=await hkdf(ikm,salt,enc.encode('Content-Encoding: aes128gcm\0'),16);
 const nonce=await hkdf(ikm,salt,enc.encode('Content-Encoding: nonce\0'),12);
 const content=join(enc.encode(payload),new Uint8Array([2]));if(content.length>3000)throw new Error('Notification too large');
 const key=await crypto.subtle.importKey('raw',cek,'AES-GCM',false,['encrypt']);
 const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce},key,content));
 return join(salt,new Uint8Array([0,0,16,0,65]),sender,encrypted);
}
async function signingKeys(env:PushEnv){
 let row=await env.DB.prepare('SELECT public_key,private_jwk FROM push_config WHERE id=1').first<{public_key:string;private_jwk:string}>();
 if(!row){const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const pub=base64url(new Uint8Array(await crypto.subtle.exportKey('raw',keys.publicKey))),priv=JSON.stringify(await crypto.subtle.exportKey('jwk',keys.privateKey));
  await env.DB.prepare('INSERT OR IGNORE INTO push_config(id,public_key,private_jwk) VALUES(1,?,?)').bind(pub,priv).run();
  row=await env.DB.prepare('SELECT public_key,private_jwk FROM push_config WHERE id=1').first<{public_key:string;private_jwk:string}>();
 }if(!row)throw new Error('Push configuration unavailable');return row;
}
export async function getPushPublicKey(env:PushEnv){return (await signingKeys(env)).public_key}
export async function vapidAuthorization(keys:{public_key:string;private_jwk:string},endpoint:string){
 const key=await crypto.subtle.importKey('jwk',JSON.parse(keys.private_jwk),{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
 const header=base64url(enc.encode(JSON.stringify({typ:'JWT',alg:'ES256'}))),claims=base64url(enc.encode(JSON.stringify({aud:new URL(endpoint).origin,exp:Math.floor(Date.now()/1000)+43200,sub:'https://manarstore.ps'})));
 const unsigned=header+'.'+claims,signature=base64url(new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,enc.encode(unsigned))));
 return 'vapid t='+unsigned+'.'+signature+', k='+keys.public_key;
}
export function validPushEndpoint(value:string){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(u.hostname==='fcm.googleapis.com'||u.hostname==='updates.push.services.mozilla.com'||u.hostname==='web.push.apple.com'||u.hostname.endsWith('.notify.windows.com'))&&value.length<2048}catch{return false}}
type Payload={title:string;body:string;url:string;tag:string};
async function queue(env:PushEnv,subscriptionId:string,payload:Payload,key:string){await env.DB.prepare("INSERT OR IGNORE INTO push_jobs(subscription_id,payload,dedupe_key,status,attempts,next_attempt,created_at) VALUES(?,?,?,'pending',0,?,?)").bind(subscriptionId,JSON.stringify(payload),key,Date.now(),Date.now()).run()}
export async function drainPushQueue(env:PushEnv){
 const now=Date.now(),rows=await env.DB.prepare("SELECT j.id,j.payload,j.attempts,s.id AS subscription_id,s.endpoint,s.p256dh,s.auth,s.disabled,s.orders_enabled,s.offers_enabled FROM push_jobs j JOIN push_subscriptions s ON s.id=j.subscription_id WHERE j.status='pending' AND j.next_attempt<=? ORDER BY j.id LIMIT 40").bind(now).all<Record<string,unknown>>();
 if(!rows.results.length)return;const keys=await signingKeys(env);
 await Promise.all(rows.results.map(async row=>{
  const claim=await env.DB.prepare("UPDATE push_jobs SET next_attempt=? WHERE id=? AND status='pending' AND next_attempt<=?").bind(now+60000,row.id,now).run();if(!claim.meta.changes)return;
  const payload=JSON.parse(String(row.payload));
  if(row.disabled||(String(payload.tag).startsWith("offer-")&&!row.offers_enabled)||(String(payload.tag).startsWith("order-")&&!row.orders_enabled)||!validPushEndpoint(String(row.endpoint))){await env.DB.prepare("UPDATE push_jobs SET status='cancelled' WHERE id=?").bind(row.id).run();return}
  const attempt=Number(row.attempts)+1;
  let stage='vapid_sign',responseStatus:number|null=null;
  try{
   const authorization=await vapidAuthorization(keys,String(row.endpoint));
   stage='payload_encrypt';
   const body=await encryptPush({p256dh:String(row.p256dh),auth:String(row.auth)},String(row.payload));
   stage='provider_fetch';
   const response=await fetch(String(row.endpoint),{method:'POST',redirect:'manual',signal:AbortSignal.timeout(15000),headers:{Authorization:authorization,'Content-Encoding':'aes128gcm','Content-Type':'application/octet-stream',TTL:'86400',Urgency:'normal'},body});
   responseStatus=response.status;\n   if(response.status===404||response.status===410){await env.DB.prepare('UPDATE push_subscriptions SET disabled=1 WHERE id=?').bind(row.subscription_id).run();await env.DB.prepare("UPDATE push_jobs SET status='expired',attempts=?,last_error=? WHERE id=?").bind(attempt,'push_http_'+response.status,row.id).run();return}
   if(!response.ok)throw new Error('push_http_'+response.status);
   await env.DB.prepare("UPDATE push_jobs SET status='sent',attempts=?,sent_at=?,last_error=NULL WHERE id=?").bind(attempt,Date.now(),row.id).run();
  }catch(error){const message=error&&typeof error==='object'&&'message'in error?String((error as {message:unknown}).message):'';const code=/^push_http_\d{3}$/.test(message)?message:error&&typeof error==='object'&&'name'in error&&String((error as {name:unknown}).name)==='TimeoutError'?'push_timeout':'push_network_error';const rawName=error&&typeof error==='object'&&'name'in error?String((error as {name:unknown}).name):'UnknownError';const errorName=/^[A-Za-z][A-Za-z0-9]{0,39}$/.test(rawName)?rawName:'UnknownError';console.error('web_push_delivery_failed',{jobId:Number(row.id),provider:new URL(String(row.endpoint)).hostname,attempt,error:code,stage,errorName,...(responseStatus===null?{}:{responseStatus})});await env.DB.prepare('UPDATE push_jobs SET status=?,attempts=?,next_attempt=?,last_error=? WHERE id=?').bind(attempt>=5?'failed':'pending',attempt,Date.now()+60000*Math.pow(2,attempt),code,row.id).run()}
 }));
}
async function device(env:PushEnv,id:unknown,token:unknown,role:string){if(typeof id!=='string'||typeof token!=='string'||token.length<32||token.length>128)return null;return env.DB.prepare('SELECT * FROM push_subscriptions WHERE id=? AND token_hash=? AND role=? AND disabled=0').bind(id,await hash(token),role).first<Record<string,unknown>>()}
export async function pushApi(request:Request,env:PushEnv,role:'customer'|'admin',accountId:number|null){
 const url=new URL(request.url),prefix=role==='admin'?'/api/admin/push':'/api/push';
 if(url.pathname===prefix+'/config'&&request.method==='GET')return Response.json({publicKey:await getPushPublicKey(env)},{headers:{'cache-control':'no-store'}});
 if(request.method!=='POST'||!url.pathname.startsWith(prefix+'/'))return null;
 if(request.headers.get('origin')!==url.origin)return Response.json({error:'مصدر الطلب غير مسموح'},{status:403});
 if(Number(request.headers.get('content-length')||0)>10000)return Response.json({error:'الطلب كبير جدًا'},{status:413});
 const text=await request.text();if(text.length>10000)return Response.json({error:'الطلب كبير جدًا'},{status:413});
 let body:Record<string,any>;try{body=JSON.parse(text)}catch{return Response.json({error:'بيانات غير صحيحة'},{status:400})}
 const id=String(body.deviceId||''),token=String(body.deviceToken||'');
 if(!/^[a-zA-Z0-9-]{20,80}$/.test(id)||!/^[a-zA-Z0-9-]{32,128}$/.test(token))return Response.json({error:'هوية الجهاز غير صحيحة'},{status:400});
 if(url.pathname===prefix+'/subscribe'){
  const sub=body.subscription,endpoint=String(sub?.endpoint||''),p256dh=String(sub?.keys?.p256dh||''),auth=String(sub?.keys?.auth||'');
  if(!validPushEndpoint(endpoint)||!/^[-_a-zA-Z0-9]{87}$/.test(p256dh)||!/^[-_a-zA-Z0-9]{22}$/.test(auth))return Response.json({error:'اشتراك الإشعارات غير صحيح'},{status:400});
  const tokenHash=await hash(token),existing=await env.DB.prepare('SELECT token_hash,role,account_id FROM push_subscriptions WHERE id=?').bind(id).first<{token_hash:string;role:string;account_id:number|null}>();
  if(existing&&(existing.token_hash!==tokenHash||existing.role!==role))return Response.json({error:'الجهاز غير مسموح'},{status:403});
  const owner=await env.DB.prepare('SELECT id FROM push_subscriptions WHERE endpoint=? AND id<>?').bind(endpoint,id).first();if(owner)return Response.json({error:'الاشتراك مستخدم؛ أعد الاشتراك من الجهاز الأصلي'},{status:409});
  if(existing?.account_id!=null&&existing.account_id!==accountId)await env.DB.prepare('DELETE FROM push_order_links WHERE subscription_id=?').bind(id).run();
  await env.DB.prepare('INSERT INTO push_subscriptions(id,token_hash,role,origin,endpoint,p256dh,auth,account_id,orders_enabled,offers_enabled,disabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,0,?,?) ON CONFLICT(id) DO UPDATE SET endpoint=excluded.endpoint,p256dh=excluded.p256dh,auth=excluded.auth,account_id=excluded.account_id,orders_enabled=excluded.orders_enabled,offers_enabled=excluded.offers_enabled,disabled=0,updated_at=excluded.updated_at').bind(id,tokenHash,role,url.origin,endpoint,p256dh,auth,accountId,body.ordersEnabled===true?1:0,role==='customer'&&body.offersEnabled===true?1:0,Date.now(),Date.now()).run();
  return Response.json({ok:true});
 }
 const current=await device(env,id,token,role);if(!current)return Response.json({error:'اشترك بالإشعارات أولًا'},{status:403});
 if(url.pathname===prefix+'/unsubscribe'){await env.DB.prepare('UPDATE push_subscriptions SET disabled=1 WHERE id=?').bind(id).run();return Response.json({ok:true})}
 if(url.pathname===prefix+'/status')return Response.json({ok:true,ordersEnabled:Boolean(current.orders_enabled),offersEnabled:Boolean(current.offers_enabled)});
 if(url.pathname===prefix+'/test'){await queue(env,id,{title:'إشعارات منار مفعّلة',body:'هذا إشعار تجريبي لجهازك فقط.',url:role==='admin'?'/admin':'/',tag:'manar-push-test'},'test:'+id+':'+crypto.randomUUID());return Response.json({ok:true})}
 return null;
}
export async function notifyNewOrder(env:PushEnv,orderId:number,orderNumber:number,origin:string,accountId:number|null,deviceId:unknown,deviceToken:unknown){
 const guest=await device(env,deviceId,deviceToken,'customer');
 if(guest&&guest.orders_enabled)await env.DB.prepare('INSERT OR IGNORE INTO push_order_links(order_id,subscription_id) VALUES(?,?)').bind(orderId,guest.id).run();
 const subscribers=await env.DB.prepare("SELECT id,origin FROM push_subscriptions WHERE role='admin' AND orders_enabled=1 AND disabled=0").all<{id:string;origin:string}>();
 for(const sub of subscribers.results)await queue(env,sub.id,{title:'طلب جديد #'+orderNumber,body:'وصل طلب جديد للمتجر. افتح لوحة التحكم لمراجعته.',url:sub.origin+'/admin',tag:'order-'+orderNumber},'new-order:'+orderId+':'+sub.id);
 await drainPushQueue(env);
}
export async function notifyOrderStatus(env:PushEnv,orderId:number,status:string){
 const order=await env.DB.prepare('SELECT order_number,customer_account_id FROM orders WHERE id=? AND deleted_at IS NULL').bind(orderId).first<{order_number:number;customer_account_id:number|null}>();if(!order)return;
 const labels:Record<string,string>={confirmed:'تم تأكيد طلبك',preparing:'طلبك قيد التجهيز',shipped:'طلبك في التوصيل',delivered:'تم تسليم طلبك',cancelled:'تم إلغاء طلبك',new:'تم استلام طلبك'};
 const rows=await env.DB.prepare("SELECT DISTINCT s.id FROM push_subscriptions s WHERE s.role='customer' AND s.orders_enabled=1 AND s.disabled=0 AND ((s.account_id IS NOT NULL AND s.account_id=?) OR s.id IN (SELECT subscription_id FROM push_order_links WHERE order_id=?))").bind(order.customer_account_id,orderId).all<{id:string}>();
 for(const sub of rows.results)await queue(env,sub.id,{title:labels[status]||'تحديث طلبك',body:'طلب منار رقم #'+order.order_number,url:'/account',tag:'order-'+order.order_number},'order-status:'+orderId+':'+status+':'+sub.id+':'+Date.now());
 await drainPushQueue(env);
}
export async function pushAdminSummary(env:PushEnv){
 const subscribers=await env.DB.prepare('SELECT role,COUNT(*) AS count,SUM(offers_enabled) AS offers,SUM(CASE WHEN orders_enabled=1 THEN 1 ELSE 0 END) AS orders FROM push_subscriptions WHERE disabled=0 GROUP BY role').all();
 const jobs=await env.DB.prepare('SELECT status,COUNT(*) AS count FROM push_jobs GROUP BY status').all();
 const latestTestError=await env.DB.prepare("SELECT last_error FROM push_jobs WHERE json_extract(payload,'$.tag')='manar-push-test' AND last_error IS NOT NULL ORDER BY created_at DESC,id DESC LIMIT 1").first<{last_error:string}>();
 return {subscribers:subscribers.results,jobs:jobs.results,latestTestError:latestTestError?.last_error||null};
}
export async function queueCampaign(request:Request,env:PushEnv){
 if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'مصدر الطلب غير مسموح'},{status:403});
 const body=await request.json() as {title?:string;body?:string;url?:string;confirmed?:boolean};
 if(body.confirmed!==true)return Response.json({error:'تأكيد إرسال العرض مطلوب'},{status:400});
 const title=String(body.title||'').trim().slice(0,80),message=String(body.body||'').trim().slice(0,240),url=String(body.url||'/').trim();
 if(!title||!message||!url.startsWith('/')||url.startsWith('//')||url.includes('\\')||/[\u0000-\u001f]/.test(url))return Response.json({error:'أكمل العنوان والنص ورابطًا داخل المتجر'},{status:400});
 const campaign=crypto.randomUUID(),payload=JSON.stringify({title,body:message,url,tag:'offer-'+campaign}),now=Date.now();
 const result=await env.DB.prepare("INSERT INTO push_jobs(subscription_id,payload,dedupe_key,status,attempts,next_attempt,created_at) SELECT id,?,?||id,'pending',0,?,? FROM push_subscriptions WHERE role='customer' AND offers_enabled=1 AND disabled=0").bind(payload,'campaign:'+campaign+':',now,now).run();
 return Response.json({ok:true,queued:result.meta.changes||0});
}
