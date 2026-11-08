import type {SecurityDb} from "./admin-security";
export function trackingPhone(value:unknown){return String(value||"").normalize("NFKC").replace(/[٠-٩]/g,char=>String(char.charCodeAt(0)-1632)).replace(/[۰-۹]/g,char=>String(char.charCodeAt(0)-1776)).replace(/\D/g,"")}
export async function trackOrders(db:SecurityDb,phone:string){
 const rows=await db.prepare("SELECT order_number,created_at,status FROM orders WHERE deleted_at IS NULL AND replace(replace(replace(replace(replace(phone,' ',''),'-',''),'+',''),'(',''),')','')=? ORDER BY created_at DESC LIMIT 30").bind(phone).all<{order_number:number;created_at:number;status:string}>();
 return rows.results.map(row=>({orderNumber:row.order_number,createdAt:row.created_at,status:row.status}));
}
