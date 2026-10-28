import {randomBytes} from 'node:crypto';
import {hashPassword,jsonBody,SecurityError,type SecurityDb} from './admin-security';
type Row=Record<string,any>;
const clean=(value:unknown,max:number)=>String(value||'').trim().slice(0,max);
export async function customerAccountAdmin(request:Request,db:SecurityDb):Promise<Response|null>{
 const path=new URL(request.url).pathname;
 if(!path.startsWith('/api/admin/customer-accounts'))return null;
 try{
  const reset=path.match(/^\/api\/admin\/customer-accounts\/(\d+)\/password$/);
  if(reset&&request.method==='POST'){
   const id=Number(reset[1]);if(!await db.prepare('SELECT id FROM customer_accounts WHERE id=?').bind(id).first())throw new SecurityError('الحساب غير موجود',404);
   const temporary=randomBytes(15).toString('hex'),salt=randomBytes(16).toString('hex'),hash=await hashPassword(temporary,salt),now=Date.now();
   await db.batch([db.prepare('UPDATE customer_accounts SET password_hash=?,password_salt=?,updated_at=? WHERE id=?').bind(hash,salt,now,id),db.prepare('UPDATE customer_sessions SET revoked_at=? WHERE account_id=?').bind(now,id),db.prepare('INSERT INTO customer_password_resets(account_id,expires_at) VALUES(?,?) ON CONFLICT(account_id) DO UPDATE SET expires_at=excluded.expires_at').bind(id,now+86400000)]);
   return Response.json({ok:true,temporaryPassword:temporary},{headers:{'cache-control':'no-store'}});
  }
  if(path==='/api/admin/customer-accounts'&&request.method==='POST'){
   const b=await jsonBody(request),name=clean(b.name,100),email=clean(b.email,254).toLowerCase(),phone=clean(b.phone,40),city=clean(b.city,120),address=clean(b.address,500),requestId=clean(b.requestId,80),ledgerId=b.customerId==null?null:Number(b.customerId);
   if(!name||!phone||!/^\S+@\S+\.\S+$/.test(email)||!requestId)throw new SecurityError('الاسم والهاتف والبريد مطلوبة');
   if(ledgerId!=null&&(!Number.isSafeInteger(ledgerId)||ledgerId<1))throw new SecurityError('رقم الزبون غير صحيح');
   if(ledgerId!=null){const c=await db.prepare('SELECT id,account_id FROM admin_customers WHERE id=?').bind(ledgerId).first<Row>();if(!c)throw new SecurityError('الزبون غير موجود',404);if(c.account_id)throw new SecurityError('الزبون مرتبط بحساب دخول مسبقًا',409)}
   if(await db.prepare('SELECT id FROM customer_accounts WHERE lower(email)=?').bind(email).first())throw new SecurityError('البريد مسجل مسبقًا؛ اربط المستخدم الموجود من شاشة الزبائن',409);
   const temporary=randomBytes(15).toString('hex'),salt=randomBytes(16).toString('hex'),hash=await hashPassword(temporary,salt),now=Date.now();
   const guard=randomBytes(16).toString('hex');const statements=ledgerId?[db.prepare('INSERT INTO admin_mutation_guards(token,valid) VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM admin_customers WHERE id=? AND account_id IS NULL) THEN 1 ELSE 0 END)').bind(guard,ledgerId)]:[];
   statements.push(db.prepare('INSERT INTO customer_accounts(email,password_hash,password_salt,name,phone,city,address,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(email,hash,salt,name,phone,city,address,now,now),db.prepare('INSERT INTO customer_password_resets(account_id,expires_at) SELECT id,? FROM customer_accounts WHERE email=?').bind(now+86400000,email));
   if(ledgerId)statements.push(db.prepare('UPDATE admin_customers SET account_id=(SELECT id FROM customer_accounts WHERE email=?),updated_at=? WHERE id=? AND account_id IS NULL').bind(email,now,ledgerId));
   else statements.push(db.prepare('INSERT INTO admin_customers(name,phone,city,address,account_id,request_id,created_at,updated_at) SELECT ?,?,?,?,id,?,?,? FROM customer_accounts WHERE email=?').bind(name,phone,city,address,requestId,now,now,email));
   if(ledgerId)statements.push(db.prepare('DELETE FROM admin_mutation_guards WHERE token=?').bind(guard));await db.batch(statements);const customer=await db.prepare('SELECT id FROM admin_customers WHERE account_id=(SELECT id FROM customer_accounts WHERE email=?)').bind(email).first<{id:number}>();return Response.json({ok:true,id:customer?.id,temporaryPassword:temporary},{headers:{'cache-control':'no-store'}});
  }
  throw new SecurityError('Not Found',404);
 }catch(error){if(error instanceof SecurityError)return Response.json({error:error.message},{status:error.status});if(String(error).includes('UNIQUE'))return Response.json({error:'الحساب موجود مسبقًا؛ حدّث القائمة قبل المحاولة مجددًا'},{status:409});throw error}
}
