interface Statement {
 bind(...values:unknown[]):Statement;
 run():Promise<unknown>;
 first<T>():Promise<T|null>;
 all<T>():Promise<{results:T[]}>;
}
interface Database { prepare(sql:string):Statement;batch(statements:Statement[]):Promise<unknown> }
const cookieName="__Host-manar-cart";
export const CART_WINDOW_MS=30*86400000;
export function cartSnapshot(body:unknown){
 if(!body||typeof body!=="object"||!Array.isArray((body as {items?:unknown}).items))throw new Error("Invalid cart");
 const items=(body as {items:unknown[]}).items;
 if(items.length>500)throw new Error("Cart too large");
 const products=new Set<number>();let quantity=0;
 const lines=new Map<string,{productId:number;variantId:number|null;qty:number}>();
 for(const item of items){
  if(!item||typeof item!=="object")throw new Error("Invalid item");
  const {productId,qty,variantId:rawVariant}=item as {productId:number;qty:number;variantId?:number|null};
  const variantId=rawVariant??null;
  if(variantId!==null&&(!Number.isSafeInteger(variantId)||variantId<=0))throw new Error("Invalid variant");
  if(!Number.isSafeInteger(productId)||productId<=0||!Number.isSafeInteger(qty)||qty<1||qty>100000)throw new Error("Invalid item");
  products.add(productId);quantity+=qty;
  const key=`${productId}:${variantId??"base"}`,line=lines.get(key);
  lines.set(key,{productId,variantId,qty:(line?.qty||0)+qty});
 }
 return {quantity,products:products.size,items:Array.from(lines.values())};
}
export async function recordCart(request:Request,db:Database){
 const url=new URL(request.url),origin=request.headers.get("origin");
 if(origin&&origin!==url.origin)return new Response(null,{status:403});
 if(request.headers.get("sec-fetch-site")==="cross-site")return new Response(null,{status:403});
 const text=await request.text();
 if(text.length>64000)return new Response(null,{status:413});
 let snapshot:ReturnType<typeof cartSnapshot>;
 try{snapshot=cartSnapshot(JSON.parse(text))}catch{return Response.json({error:"Invalid cart"},{status:400})}
 const match=request.headers.get("cookie")?.match(/(?:^|;\s*)__Host-manar-cart=([a-f0-9-]{36})(?:;|$)/);
 const existing=match?.[1],id=existing||crypto.randomUUID(),now=Date.now();
 if(!snapshot.quantity){
  if(existing){
   await db.batch([db.prepare("DELETE FROM store_cart_details WHERE cart_id=?").bind(existing),db.prepare("DELETE FROM store_cart_snapshots WHERE cart_id=?").bind(existing)]);
  }
 }else{
  await db.batch([
   db.prepare("INSERT INTO store_cart_snapshots (cart_id,quantity,products_count,updated_at) VALUES (?,?,?,?) ON CONFLICT(cart_id) DO UPDATE SET quantity=excluded.quantity,products_count=excluded.products_count,updated_at=excluded.updated_at").bind(id,snapshot.quantity,snapshot.products,now),
   db.prepare("INSERT INTO store_cart_details (cart_id,items_json) VALUES (?,?) ON CONFLICT(cart_id) DO UPDATE SET items_json=excluded.items_json").bind(id,JSON.stringify(snapshot.items))
  ]);
 }
 const headers=new Headers({"cache-control":"no-store"});
 if(!existing)headers.set("set-cookie",cookieName+"="+id+"; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=31536000");
 return Response.json({ok:true},{headers});
}
export async function readCartMetrics(db:Pick<Database,"prepare">,since?:number){
 const now=Date.now(),retention=now-CART_WINDOW_MS,cutoff=Math.max(retention,since??retention);
 await db.prepare("DELETE FROM store_cart_snapshots WHERE updated_at<?").bind(retention).run();
 const row=await db.prepare("SELECT COUNT(*) AS carts,COALESCE(SUM(quantity),0) AS quantity FROM store_cart_snapshots WHERE updated_at>=? AND quantity>0").bind(cutoff).first<{carts:number;quantity:number}>();
 return {cartQuantity:Number(row?.quantity||0),nonemptyCarts:Number(row?.carts||0),windowDays:30,asOf:now};
}

export async function readCartDetails(db:Pick<Database,"prepare">){
 const cutoff=Date.now()-CART_WINDOW_MS;
 await db.prepare("DELETE FROM store_cart_details WHERE cart_id NOT IN (SELECT cart_id FROM store_cart_snapshots)").run();
 const coverage=await db.prepare("SELECT COUNT(*) AS missing FROM store_cart_snapshots s LEFT JOIN store_cart_details d ON d.cart_id=s.cart_id WHERE s.updated_at>=? AND s.quantity>0 AND d.cart_id IS NULL").bind(cutoff).first<{missing:number}>();
 const rows=await db.prepare(`
  SELECT CAST(json_extract(j.value,'$.productId') AS INTEGER) AS product_id,
   CAST(json_extract(j.value,'$.variantId') AS INTEGER) AS variant_id,
   p.item_number,p.name AS product_name,
   (SELECT GROUP_CONCAT(pov.value,' / ') FROM variant_option_values vov JOIN product_option_values pov ON pov.id=vov.option_value_id JOIN product_variants v ON v.id=vov.variant_id WHERE v.id=CAST(json_extract(j.value,'$.variantId') AS INTEGER) AND v.product_id=p.id) AS variant_name,
   SUM(CAST(json_extract(j.value,'$.qty') AS INTEGER)) AS quantity,
   COUNT(DISTINCT s.cart_id) AS carts,MAX(s.updated_at) AS last_seen
  FROM store_cart_snapshots s JOIN store_cart_details d ON d.cart_id=s.cart_id JOIN json_each(d.items_json) j
  LEFT JOIN products p ON p.id=CAST(json_extract(j.value,'$.productId') AS INTEGER)
  WHERE s.updated_at>=? AND s.quantity>0
  GROUP BY product_id,variant_id ORDER BY quantity DESC,product_id,variant_id
 `).bind(cutoff).all<{product_id:number;variant_id:number|null;item_number:number|null;product_name:string|null;variant_name:string|null;quantity:number;carts:number;last_seen:number}>();
 return {missingDetailsCarts:Number(coverage?.missing||0),items:rows.results.map(row=>({
  productId:Number(row.product_id),variantId:row.variant_id==null?null:Number(row.variant_id),
  itemNumber:row.item_number==null?null:Number(row.item_number),
  productName:row.product_name||"منتج محذوف #"+row.product_id,
  variantName:row.variant_name||(row.variant_id==null?"الصنف الأساسي":"متغير #"+row.variant_id),
  quantity:Number(row.quantity),carts:Number(row.carts),lastSeen:Number(row.last_seen)
 }))};
}
