type Row=Record<string,unknown>;
export interface Statement{bind(...values:unknown[]):Statement;first<T=Row>():Promise<T|null>;all<T=Row>():Promise<{results:T[]}>;run():Promise<{meta?:{changes?:number;last_row_id?:number|string}}>}
export interface Database{prepare(sql:string):Statement}
export class LedgerError extends Error{constructor(message:string,public status=400){super(message)}}
const clean=(value:unknown,max:number)=>typeof value==='string'?value.trim().slice(0,max):'';
const id=(value:unknown)=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<1)throw new LedgerError('الرقم غير صحيح');return n};
export function paymentAmount(value:unknown){if((typeof value!=='string'&&typeof value!=='number')||String(value).trim()==='')throw new LedgerError('أدخل قيمة الدفعة');const n=Number(value),c=Math.round(n*100);if(!Number.isFinite(n)||n<=0||n>10000000||Math.abs(n*100-c)>0.00001)throw new LedgerError('قيمة الدفعة يجب أن تكون أكبر من صفر وبمنزلتين عشريتين');return c}
export async function readCustomerLedger(db:Database){
 const [customers,orders,items,payments,accounts,addresses]=await Promise.all([
  db.prepare('SELECT id,name,phone,city,address,account_id,created_at FROM admin_customers ORDER BY name,id').all<Row>(),
  db.prepare("SELECT o.id,o.order_number,o.customer_name,o.phone,o.city,o.address,o.status,o.total_agorot,o.payment_status,o.customer_account_id,o.created_at,o.deleted_at,l.customer_id AS ledger_customer_id FROM orders o LEFT JOIN admin_customer_orders l ON l.order_id=o.id WHERE o.deleted_at IS NULL OR l.customer_id IS NOT NULL ORDER BY o.created_at DESC,o.id DESC").all<Row>(),
  db.prepare('SELECT oi.order_id,oi.product_name,oi.variant_label,oi.quantity,oi.line_total_agorot FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.deleted_at IS NULL OR EXISTS(SELECT 1 FROM admin_customer_orders l WHERE l.order_id=o.id) ORDER BY oi.id').all<Row>(),
  db.prepare('SELECT id,customer_id,order_id,amount_agorot,note,created_at FROM admin_customer_payments ORDER BY created_at DESC,id DESC').all<Row>(),
  db.prepare('SELECT id,name,email,phone,city,address,created_at FROM customer_accounts ORDER BY created_at DESC,id DESC').all<Row>(),
  db.prepare('SELECT id,account_id,label,recipient_name,phone,city,address,shipping_zone,is_default FROM customer_addresses ORDER BY is_default DESC,id').all<Row>()
 ]);
 return {customers:customers.results,orders:orders.results,items:items.results,payments:payments.results,accounts:accounts.results,addresses:addresses.results};
}
export async function createLedgerCustomer(db:Database,body:Row){
 const name=clean(body.name,200),phone=clean(body.phone,40),city=clean(body.city,120),address=clean(body.address,500),accountId=body.accountId==null||body.accountId===''?null:id(body.accountId),requestId=clean(body.requestId,80);
 const phoneDigits=phone.replace(/[٠-٩۰-۹]/g,char=>String('٠١٢٣٤٥٦٧٨٩'.includes(char)?'٠١٢٣٤٥٦٧٨٩'.indexOf(char):'۰۱۲۳۴۵۶۷۸۹'.indexOf(char))).replace(/\D/g,'');
 if(!name||phoneDigits.length<7)throw new LedgerError('أدخل اسم الزبون ورقم هاتف من 7 أرقام على الأقل');
 if(requestId&&!/^[a-zA-Z0-9-]{16,80}$/.test(requestId))throw new LedgerError('معرّف الزبون غير صحيح');
 if(requestId){const existing=await db.prepare('SELECT id,name,phone,city,address,account_id FROM admin_customers WHERE request_id=?').bind(requestId).first<Row>();if(existing){if(existing.name!==name||existing.phone!==phone||existing.city!==city||existing.address!==address||(existing.account_id==null?null:Number(existing.account_id))!==accountId)throw new LedgerError('حاول إنشاء الزبون مجددًا بعد تحديث البيانات',409);return {id:Number(existing.id)}}}
 if(accountId&&!await db.prepare('SELECT id FROM customer_accounts WHERE id=?').bind(accountId).first())throw new LedgerError('المستخدم المسجل غير موجود',404);
 if(accountId&&await db.prepare('SELECT id FROM admin_customers WHERE account_id=?').bind(accountId).first())throw new LedgerError('هذا المستخدم مرتبط مسبقًا بزبون',409);
 const now=Date.now();try{const result=await db.prepare('INSERT INTO admin_customers(name,phone,city,address,account_id,request_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(name,phone,city,address,accountId,requestId||null,now,now).run();return {id:Number(result.meta?.last_row_id)}}catch(error){if(String(error).includes('UNIQUE')){if(requestId){const saved=await db.prepare('SELECT id,name,phone,city,address,account_id FROM admin_customers WHERE request_id=?').bind(requestId).first<Row>();if(saved&&saved.name===name&&saved.phone===phone&&saved.city===city&&saved.address===address&&(saved.account_id==null?null:Number(saved.account_id))===accountId)return {id:Number(saved.id)}}throw new LedgerError('هذا المستخدم مرتبط مسبقًا بزبون أو تم الحفظ للتو؛ حدّث البيانات',409)}throw error}
}
export async function linkCustomerOrder(db:Database,customer:unknown,order:unknown){
 const customerId=id(customer),orderId=id(order),existing=await db.prepare('SELECT customer_id FROM admin_customer_orders WHERE order_id=?').bind(orderId).first<{customer_id:number}>();
 if(existing){if(Number(existing.customer_id)===customerId)return {ok:true};throw new LedgerError('الطلب مرتبط بزبون آخر',409)}
 const found=await db.prepare('SELECT status,payment_status,deleted_at FROM orders WHERE id=?').bind(orderId).first<Row>();
 if(!found||found.deleted_at!=null)throw new LedgerError('الطلب غير موجود',404);
 if(['cancelled','draft'].includes(String(found.status))||String(found.payment_status)==='paid')throw new LedgerError('الطلب ملغي أو مسودة أو مسجل كمدفوع؛ لا يمكن إضافته كذمة',409);
 if(!await db.prepare('SELECT id FROM admin_customers WHERE id=?').bind(customerId).first())throw new LedgerError('الزبون غير موجود',404);
 try{const result=await db.prepare("INSERT INTO admin_customer_orders(order_id,customer_id,linked_at) SELECT o.id,c.id,? FROM orders o JOIN admin_customers c ON c.id=? WHERE o.id=? AND o.deleted_at IS NULL AND o.status NOT IN ('draft','cancelled') AND o.payment_status!='paid'").bind(Date.now(),customerId,orderId).run();if(!Number(result.meta?.changes))throw new LedgerError('حالة الطلب تغيرت؛ حدّث الصفحة وحاول مجددًا',409);return {ok:true}}catch(error){if(String(error).includes('UNIQUE'))throw new LedgerError('الطلب مرتبط بزبون آخر أو تم ربطه للتو؛ حدّث الصفحة',409);throw error}
}
export async function recordCustomerPayment(db:Database,customer:unknown,body:Row){
 const customerId=id(customer),orderId=id(body.orderId),amount=paymentAmount(body.amount),requestId=clean(body.requestId,80),note=clean(body.note,500);
 if(!/^[a-zA-Z0-9-]{16,80}$/.test(requestId))throw new LedgerError('معرّف الدفعة غير صحيح');
 const previous=await db.prepare('SELECT id,customer_id,order_id,amount_agorot FROM admin_customer_payments WHERE request_id=?').bind(requestId).first<Row>();
 if(previous){if(Number(previous.customer_id)!==customerId||Number(previous.order_id)!==orderId||Number(previous.amount_agorot)!==amount)throw new LedgerError('معرّف الدفعة مستخدم لعملية أخرى',409);return {ok:true,id:Number(previous.id),duplicate:true}}
 const result=await db.prepare("INSERT OR IGNORE INTO admin_customer_payments(customer_id,order_id,amount_agorot,note,request_id,created_at) SELECT l.customer_id,o.id,?,?,?,? FROM admin_customer_orders l JOIN orders o ON o.id=l.order_id WHERE l.customer_id=? AND o.id=? AND o.deleted_at IS NULL AND o.status NOT IN ('draft','cancelled') AND o.payment_status!='paid' AND ? <= o.total_agorot-COALESCE((SELECT SUM(p.amount_agorot) FROM admin_customer_payments p WHERE p.order_id=o.id),0)").bind(amount,note,requestId,Date.now(),customerId,orderId,amount).run();
 const saved=await db.prepare('SELECT id,customer_id,order_id,amount_agorot FROM admin_customer_payments WHERE request_id=?').bind(requestId).first<Row>();
 if(saved&&Number(saved.customer_id)===customerId&&Number(saved.order_id)===orderId&&Number(saved.amount_agorot)===amount)return {ok:true,id:Number(saved.id),duplicate:!Number(result.meta?.changes)};
 if(saved)throw new LedgerError('معرّف الدفعة مستخدم لعملية أخرى',409);
 throw new LedgerError('تعذر تسجيل الدفعة: تحقق من الطلب والمبلغ المتبقي، ثم حدّث البيانات',409);
}

