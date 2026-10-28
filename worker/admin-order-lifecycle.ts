import {SecurityError,type SecurityDb} from './admin-security';
export async function archiveOrder(db:SecurityDb,id:number,restore=false){
 const order=await db.prepare('SELECT id,deleted_at,edit_version FROM orders WHERE id=?').bind(id).first<{id:number;deleted_at:number|null;edit_version:number}>();
 if(!order)throw new SecurityError('الطلب غير موجود',404);
 if(restore?order.deleted_at==null:order.deleted_at!=null)return {ok:true,duplicate:true};
 const now=Date.now(),result=await db.prepare(`UPDATE orders SET deleted_at=?,updated_at=?,edit_version=edit_version+1 WHERE id=? AND edit_version=? AND deleted_at IS ${restore?'NOT ':''}NULL`).bind(restore?null:now,now,id,Number(order.edit_version||0)).run();
 if(!Number(result.meta.changes))throw new SecurityError('تغيّر الطلب؛ حدّث القائمة ثم حاول مجددًا',409);
 return {ok:true};
}
