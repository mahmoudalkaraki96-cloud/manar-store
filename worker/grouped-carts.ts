import {anonymousDeviceKey,ONLINE_MS} from './browser-activity';
interface Statement{bind(...values:unknown[]):Statement;first<T>():Promise<T|null>;all<T>():Promise<{results:T[]}>}
interface Database{prepare(sql:string):Statement}
type CartRow={cart_id:string;quantity:number;updated_at:number;items_json:string|null;device_type:string|null;browser:string|null;country:string|null;city:string|null;last_seen_at:number|null};
type Line={productId:number;variantId:number|null;qty:number};
function lines(value:string|null):Line[]{try{const parsed=JSON.parse(value||'null');return Array.isArray(parsed)?parsed.slice(0,500).filter(v=>Number.isSafeInteger(v.productId)&&v.productId>0&&Number.isSafeInteger(v.qty)&&v.qty>0&&(v.variantId==null||Number.isSafeInteger(v.variantId)&&v.variantId>0)):[]}catch{return []}}
export async function readGroupedCarts(db:Database,cutoff:number,page=1,now=Date.now()){
 const pageSize=20;
 const totals=await db.prepare(`SELECT COUNT(*) AS carts,COALESCE(SUM(s.quantity),0) AS quantity,SUM(CASE WHEN d.cart_id IS NULL THEN 1 ELSE 0 END) AS missing,
 (SELECT COUNT(*) FROM store_browser_activity WHERE last_seen_at>=?) AS online FROM store_cart_snapshots s LEFT JOIN store_cart_details d ON d.cart_id=s.cart_id WHERE s.updated_at>=? AND s.quantity>0`).bind(now-ONLINE_MS,cutoff).first<{carts:number;quantity:number;missing:number;online:number}>();
 const totalCarts=Number(totals?.carts||0),pages=Math.max(1,Math.ceil(totalCarts/pageSize)),currentPage=Math.min(Math.max(1,Math.trunc(page)),pages);
 const rows=await db.prepare(`SELECT s.cart_id,s.quantity,s.updated_at,d.items_json,a.device_type,a.browser,a.country,a.city,a.last_seen_at
 FROM store_cart_snapshots s LEFT JOIN store_cart_details d ON d.cart_id=s.cart_id LEFT JOIN store_browser_activity a ON a.cart_id=s.cart_id
 WHERE s.updated_at>=? AND s.quantity>0 ORDER BY s.updated_at DESC,s.cart_id LIMIT ? OFFSET ?`).bind(cutoff,pageSize,(currentPage-1)*pageSize).all<CartRow>();
 const parsed=rows.results.map(row=>({row,lines:lines(row.items_json)})),productIds=[...new Set(parsed.flatMap(c=>c.lines.map(l=>l.productId)))];
 const [products,variants]=productIds.length?await Promise.all([
 db.prepare('SELECT id,item_number,name FROM products WHERE id IN(SELECT value FROM json_each(?))').bind(JSON.stringify(productIds)).all<{id:number;item_number:number;name:string}>(),
 db.prepare(`SELECT v.id,v.product_id,GROUP_CONCAT(pov.value,' / ') AS name FROM product_variants v LEFT JOIN variant_option_values vov ON vov.variant_id=v.id LEFT JOIN product_option_values pov ON pov.id=vov.option_value_id WHERE v.product_id IN(SELECT value FROM json_each(?)) GROUP BY v.id,v.product_id`).bind(JSON.stringify(productIds)).all<{id:number;product_id:number;name:string|null}>()
 ]):[{results:[]},{results:[]}];
 const productMap=new Map(products.results.map(p=>[p.id,p])),variantMap=new Map(variants.results.map(v=>[v.id,v]));
 const carts=await Promise.all(parsed.map(async({row,lines})=>({deviceKey:await anonymousDeviceKey(row.cart_id),deviceType:row.device_type||'unknown',browser:row.browser||'',country:row.country||'',city:row.city||'',lastSeen:row.updated_at,online:Number(row.last_seen_at||0)>=now-ONLINE_MS,quantity:Number(row.quantity),detailsAvailable:row.items_json!==null,items:lines.map(line=>{const product=productMap.get(line.productId),variant=line.variantId?variantMap.get(line.variantId):null;return {productId:line.productId,variantId:line.variantId,itemNumber:product?.item_number??null,productName:product?.name||'منتج محذوف #'+line.productId,variantName:line.variantId?(variant?.product_id===line.productId?variant.name:'')||'متغير #'+line.variantId:'الصنف الأساسي',quantity:line.qty}})})));
 return {asOf:now,cartQuantity:Number(totals?.quantity||0),nonemptyCarts:totalCarts,missingDetailsCarts:Number(totals?.missing||0),onlineDevices:Number(totals?.online||0),page:currentPage,pageSize,pages,carts};
}
