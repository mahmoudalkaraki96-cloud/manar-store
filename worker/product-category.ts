interface Statement {bind(...values:unknown[]):Statement;first<T>():Promise<T|null>}
interface Database {prepare(sql:string):Statement;batch(statements:Statement[]):Promise<Array<{meta?:{changes?:number}}>>}
export class ProductCategoryError extends Error {constructor(message:string,public status=400){super(message)}}
export async function changeProductCategory(db:Database,id:number,body:Record<string,unknown>){
 const valid=(v:unknown)=>v===null||typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
 if(!valid(body.categoryId)||!valid(body.expectedCategoryId))throw new ProductCategoryError('القسم غير صحيح');
 const categoryId=body.categoryId as number|null,expected=body.expectedCategoryId as number|null;
 if(categoryId!==null&&!await db.prepare('SELECT id FROM categories WHERE id=?').bind(categoryId).first())throw new ProductCategoryError('القسم غير موجود');
 const product=await db.prepare('SELECT id,category_id FROM products WHERE id=? AND deleted_at IS NULL').bind(id).first<{id:number;category_id:number|null}>();
 if(!product)throw new ProductCategoryError('الصنف غير موجود',404);
 if(product.category_id!==expected)throw new ProductCategoryError('تغير قسم الصنف؛ حدّث القائمة وحاول مجددًا',409);
 const now=Date.now(),detail=JSON.stringify({before:expected,after:categoryId});
 const results=await db.batch([
  db.prepare("INSERT INTO audit_logs(entity_type,entity_id,action,details_json,created_at) SELECT 'product',CAST(id AS TEXT),'admin_category_change',?,? FROM products WHERE id=? AND deleted_at IS NULL AND category_id IS ?").bind(detail,now,id,expected),
  db.prepare('UPDATE products SET category_id=?,updated_at=? WHERE id=? AND deleted_at IS NULL AND category_id IS ?').bind(categoryId,now,id,expected)
 ]);
 if(results[1].meta?.changes!==1)throw new ProductCategoryError('تغير الصنف أثناء الحفظ؛ حدّث القائمة',409);
 return {ok:true,categoryId};
}
