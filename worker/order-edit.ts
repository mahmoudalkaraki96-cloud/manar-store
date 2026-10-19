/** Atomic administrator order edits. Money is validated and calculated in agorot. */
interface Statement {
 bind(...values:unknown[]):Statement;
 first<T=Record<string,unknown>>():Promise<T|null>;
 all<T=Record<string,unknown>>():Promise<{results:T[]}>;
 run():Promise<unknown>;
}
interface Database {prepare(sql:string):Statement;batch(statements:Statement[]):Promise<unknown>}
type Row=Record<string,unknown>;
type Line={productId:number|null;variantId:number|null;itemNumber:number|null;productName:string;variantLabel:string|null;customizations:string;notes:string|null;quantity:number;unit:number};
export class OrderEditError extends Error {constructor(message:string,public status=400){super(message)}}
const text=(value:unknown)=>typeof value==="string"?value.trim():"";
export function money(value:unknown,label:string):number{
 if((typeof value!=="number"&&typeof value!=="string")||String(value).trim()===""||!Number.isFinite(Number(value))||Number(value)<0||Number(value)>10000000)throw new OrderEditError(label+" غير صحيح");
 const cents=Math.round(Number(value)*100);
 if(Math.abs(Number(value)*100-cents)>0.00001)throw new OrderEditError(label+" يقبل منزلتين عشريتين فقط");
 return cents;
}
function qty(value:unknown){if(typeof value!=="number"&&typeof value!=="string")throw new OrderEditError("الكمية غير صحيحة");const n=Number(value);if(!Number.isInteger(n)||n<1||n>9999)throw new OrderEditError("الكمية يجب أن تكون عدداً صحيحاً من 1 إلى 9999");return n}
function snapshot(row:Row):Line{return {productId:row.product_id==null?null:Number(row.product_id),variantId:row.variant_id==null?null:Number(row.variant_id),itemNumber:row.item_number==null?null:Number(row.item_number),productName:String(row.product_name),variantLabel:row.variant_label==null?null:String(row.variant_label),customizations:String(row.customization_json||"{}"),notes:row.notes==null?null:String(row.notes),quantity:Number(row.quantity),unit:Number(row.unit_price_agorot)}}
function totals(lines:Line[]){const map=new Map<string,{productId:number;variantId:number|null;quantity:number}>();for(const l of lines){if(l.productId==null)continue;const key=l.productId+":"+l.variantId,v=map.get(key)||{productId:l.productId,variantId:l.variantId,quantity:0};v.quantity+=l.quantity;map.set(key,v)}return map}
export async function saveOrderEdit(db:Database,id:number,body:Row){
 const current=await db.prepare("SELECT * FROM orders WHERE id=? AND deleted_at IS NULL").bind(id).first<Row>();
 if(!current)throw new OrderEditError("الطلب غير موجود",404);
 const version=Number(current.edit_version||0);
 if(body.editVersion!=null&&Number(body.editVersion)!==version)throw new OrderEditError("تم تعديل الطلب من جهاز آخر؛ أعد فتحه قبل الحفظ",409);
 if(body.items!==undefined&&body.editVersion==null)throw new OrderEditError("أعد فتح الطلب لتحميل أحدث نسخة",409);
 const status=text(body.status)||String(current.status);
 if(!["new","confirmed","preparing","shipped","delivered","cancelled"].includes(status))throw new OrderEditError("حالة الطلب غير صحيحة");
 const oldRows=(await db.prepare("SELECT * FROM order_items WHERE order_id=? ORDER BY id").bind(id).all<Row>()).results;
 const oldLines=oldRows.map(snapshot),lines:Line[]=[];
 if(body.items!==undefined){
  if(!Array.isArray(body.items)||body.items.length<1||body.items.length>100)throw new OrderEditError("الطلب يجب أن يحتوي من 1 إلى 100 صنف");
  const seen=new Set<number>();
  for(const value of body.items){
   if(!value||typeof value!=="object")throw new OrderEditError("بيانات الصنف غير صحيحة");
   const item=value as Row,quantity=qty(item.quantity),unit=money(item.unitPrice,"سعر القطعة");
   if(item.id!=null&&Number(item.id)>0){
    const itemId=Number(item.id),existing=oldRows.find(row=>Number(row.id)===itemId);
    if(!existing||seen.has(itemId))throw new OrderEditError("الصنف لا يتبع هذا الطلب أو مكرر");
    seen.add(itemId);const line=snapshot(existing);
    if(line.productId==null&&item.productName!==undefined){line.productName=text(item.productName);if(!line.productName||line.productName.length>200)throw new OrderEditError("اسم الصنف اليدوي مطلوب وبحد أقصى 200 حرف")}
    lines.push({...line,quantity,unit});continue;
   }
   if(item.productId==null){
    const name=text(item.productName);
    if(!name||name.length>200)throw new OrderEditError("اسم الصنف اليدوي مطلوب وبحد أقصى 200 حرف");
    lines.push({productId:null,variantId:null,itemNumber:null,productName:name,variantLabel:null,customizations:"{}",notes:null,quantity,unit});continue;
   }
   const productId=Number(item.productId);
   if(!Number.isSafeInteger(productId)||productId<1)throw new OrderEditError("رقم المنتج غير صحيح");
   const product=await db.prepare("SELECT id,item_number,name FROM products WHERE id=? AND deleted_at IS NULL").bind(productId).first<Row>();
   if(!product)throw new OrderEditError("المنتج لم يعد موجوداً",409);
   const variantId=item.variantId==null?null:Number(item.variantId);
   let label:string|null=null;
   if(variantId!=null){
    if(!Number.isSafeInteger(variantId)||variantId<1)throw new OrderEditError("الخيار غير صحيح");
    const variant=await db.prepare("SELECT v.id,GROUP_CONCAT(pov.value,' / ') AS label FROM product_variants v LEFT JOIN variant_option_values vov ON vov.variant_id=v.id LEFT JOIN product_option_values pov ON pov.id=vov.option_value_id WHERE v.id=? AND v.product_id=? AND v.active=1 GROUP BY v.id").bind(variantId,productId).first<Row>();
    if(!variant)throw new OrderEditError("الخيار لا يتبع المنتج أو لم يعد متاحاً",409);
    label=String(variant.label||"");
   }else{
    const count=await db.prepare("SELECT COUNT(*) AS count FROM product_variants WHERE product_id=? AND active=1").bind(productId).first<{count:number}>();
    if(Number(count?.count))throw new OrderEditError("اختر متغير المنتج أولاً");
   }
   const definitions=(await db.prepare("SELECT label,max_length,required FROM product_custom_fields WHERE product_id=? ORDER BY sort_order,id").bind(productId).all<Row>()).results;
   const submitted=item.customizations&&typeof item.customizations==="object"?item.customizations as Row:{},customizations:Record<string,string>={};
   for(const field of definitions){const label=String(field.label),value=text(submitted[label]);if(Number(field.required)&&!value)throw new OrderEditError("الحقل "+label+" مطلوب");if(value.length>Number(field.max_length||60))throw new OrderEditError("الحقل "+label+" أطول من المسموح");if(value)customizations[label]=value}
   lines.push({productId,variantId,itemNumber:Number(product.item_number),productName:String(product.name),variantLabel:label,customizations:JSON.stringify(customizations),notes:null,quantity,unit});
  }
 }else lines.push(...oldLines);
 const shipping=body.shipping===undefined?Number(current.shipping_agorot):money(body.shipping,"التوصيل");
 const discount=body.discount===undefined?Number(current.discount_agorot):money(body.discount,"الخصم");
 const oldFees=(await db.prepare("SELECT label,amount_agorot FROM order_extra_fees WHERE order_id=?").bind(id).all<Row>()).results;
 let fees=oldFees.map(f=>({label:String(f.label),amount:Number(f.amount_agorot)}));
 if(body.extraFees!==undefined){
  if(!Array.isArray(body.extraFees)||body.extraFees.length>20)throw new OrderEditError("الرسوم الإضافية غير صحيحة");
  fees=body.extraFees.map((value:Row)=>{if(!value||typeof value!=="object")throw new OrderEditError("بيانات الرسوم غير صحيحة");const label=text(value.label),amount=money(value.amount,"الرسم");if(!label||label.length>100||amount===0)throw new OrderEditError("سبب ومبلغ كل رسم إضافي مطلوبان");return {label,amount}});
 }
 const subtotal=lines.reduce((sum,l)=>sum+l.unit*l.quantity,0),feeTotal=fees.reduce((sum,f)=>sum+f.amount,0),total=subtotal+shipping+feeTotal-discount;
 if(!Number.isSafeInteger(total)||total<0||total>1000000000)throw new OrderEditError("الإجمالي أو الخصم يتجاوز المبلغ المسموح");
 const unknown=current.inventory_committed==null,wasCommitted=Number(current.inventory_committed)===1,willCommit=unknown?false:!["new","cancelled"].includes(status);
 // Catalog edits can recreate variant IDs; resolve historical labels before first commitment.
 if(willCommit&&!wasCommitted)for(const line of lines){
  if(line.productId==null)continue;
  if(line.variantId!=null){const existing=await db.prepare("SELECT id FROM product_variants WHERE id=? AND product_id=? AND active=1").bind(line.variantId,line.productId).first<Row>();if(existing)continue}
  if(line.variantLabel){const replacement=await db.prepare("SELECT v.id FROM product_variants v JOIN variant_option_values vov ON vov.variant_id=v.id JOIN product_option_values pov ON pov.id=vov.option_value_id WHERE v.product_id=? AND pov.value=? AND v.active=1 LIMIT 1").bind(line.productId,line.variantLabel).first<Row>();if(!replacement)throw new OrderEditError("خيار "+line.productName+" لم يعد موجوداً؛ استبدله بالخيار الصحيح",409);line.variantId=Number(replacement.id)}
 }
 const oldStock=totals(oldLines),newStock=totals(lines);
 if(unknown&&(status!==String(current.status)||JSON.stringify([...oldStock])!==JSON.stringify([...newStock])))throw new OrderEditError("حركة مخزون هذا الطلب الملغي القديم تحتاج مراجعة قبل تغيير الأصناف أو الحالة",409);
 const deltas=new Map<string,{productId:number;variantId:number|null;quantity:number}>();
 for(const [key,l] of oldStock)deltas.set(key,{...l,quantity:wasCommitted?-l.quantity:0});
 for(const [key,l] of newStock){const old=deltas.get(key);deltas.set(key,{...l,quantity:(old?.quantity||0)+(willCommit?l.quantity:0)})}
 if(wasCommitted)for(const line of oldLines)if(line.productId!=null&&line.variantId==null&&line.variantLabel&&[...deltas.values()].some(d=>d.productId===line.productId&&d.quantity!==0))throw new OrderEditError("متغير قديم لهذا الطلب تغيّر في الكتالوج؛ حركة مخزونه تحتاج مراجعة",409);
 const now=Date.now(),token=crypto.randomUUID(),statements:Statement[]=[];
 // A failed CHECK rolls back the entire D1 batch, including stock and item writes.
 statements.push(db.prepare("INSERT INTO order_edit_guards(token,valid) VALUES (?,CASE WHEN EXISTS(SELECT 1 FROM orders WHERE id=? AND edit_version=? AND deleted_at IS NULL) THEN 1 ELSE 0 END)").bind(token,id,version));
 for(const delta of deltas.values()){
  if(!delta.quantity)continue;
  const table=delta.variantId==null?"products":"product_variants",stockId=delta.variantId??delta.productId;
  statements.push(db.prepare(`INSERT INTO order_edit_guards(token,valid) VALUES (?,CASE WHEN EXISTS(SELECT 1 FROM ${table} WHERE id=? AND (stock_quantity>=? OR ?<0)) THEN 1 ELSE 0 END)`).bind(token+":"+table+stockId,stockId,delta.quantity,delta.quantity));
  statements.push(db.prepare(`UPDATE ${table} SET stock_quantity=stock_quantity-?,updated_at=? WHERE id=?`).bind(delta.quantity,now,stockId));
 }
 const productDeltas=new Map<number,number>();
 for(const l of deltas.values())productDeltas.set(l.productId,(productDeltas.get(l.productId)||0)+l.quantity);
 for(const [productId,delta] of productDeltas)if(delta)statements.push(db.prepare("UPDATE products SET order_count=MAX(0,order_count+?),updated_at=? WHERE id=?").bind(delta,now,productId));
 if(body.items!==undefined||lines.some((line,index)=>line.variantId!==oldLines[index]?.variantId)){
  statements.push(db.prepare("DELETE FROM order_items WHERE order_id=?").bind(id));
  for(const l of lines)statements.push(db.prepare("INSERT INTO order_items(order_id,product_id,variant_id,item_number,product_name,variant_label,customization_json,notes,quantity,unit_price_agorot,line_total_agorot) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(id,l.productId,l.variantId,l.itemNumber,l.productName,l.variantLabel,l.customizations,l.notes,l.quantity,l.unit,l.unit*l.quantity));
 }
 if(body.extraFees!==undefined){
  statements.push(db.prepare("DELETE FROM order_extra_fees WHERE order_id=?").bind(id));
  for(const fee of fees)statements.push(db.prepare("INSERT INTO order_extra_fees(order_id,label,amount_agorot,created_at) VALUES (?,?,?,?)").bind(id,fee.label,fee.amount,now));
 }
 statements.push(db.prepare("UPDATE orders SET status=?,subtotal_agorot=?,shipping_agorot=?,discount_agorot=?,total_agorot=?,inventory_committed=?,edit_version=edit_version+1,updated_at=? WHERE id=?").bind(status,subtotal,shipping,discount,total,unknown?null:willCommit?1:0,now,id));
 statements.push(db.prepare("DELETE FROM order_edit_guards WHERE token=? OR token LIKE ?").bind(token,token+":%"));
 try{await db.batch(statements)}catch(error){
  if(String(error).includes("CHECK constraint failed"))throw new OrderEditError("تغيّر الطلب أو المخزون أثناء الحفظ؛ أعد تحميل الطلب وراجع الكميات",409);
  throw error;
 }
 return {previousStatus:String(current.status),status};
}
