interface Statement {
 bind(...values:unknown[]):Statement;
 run():Promise<unknown>;
 first<T>():Promise<T|null>;
}
interface Database { prepare(sql:string):Statement }
const cookieName="__Host-manar-cart";
export const CART_WINDOW_MS=30*86400000;
export function cartSnapshot(body:unknown){
 if(!body||typeof body!=="object"||!Array.isArray((body as {items?:unknown}).items))throw new Error("Invalid cart");
 const items=(body as {items:unknown[]}).items;
 if(items.length>500)throw new Error("Cart too large");
 const products=new Set<number>();let quantity=0;
 for(const item of items){
  if(!item||typeof item!=="object")throw new Error("Invalid item");
  const {productId,qty}=item as {productId:number;qty:number};
  if(!Number.isSafeInteger(productId)||productId<=0||!Number.isSafeInteger(qty)||qty<1||qty>100000)throw new Error("Invalid item");
  products.add(productId);quantity+=qty;
 }
 return {quantity,products:products.size};
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
  if(existing)await db.prepare("DELETE FROM store_cart_snapshots WHERE cart_id=?").bind(existing).run();
 }else{
  await db.prepare("INSERT INTO store_cart_snapshots (cart_id,quantity,products_count,updated_at) VALUES (?,?,?,?) ON CONFLICT(cart_id) DO UPDATE SET quantity=excluded.quantity,products_count=excluded.products_count,updated_at=excluded.updated_at").bind(id,snapshot.quantity,snapshot.products,now).run();
 }
 const headers=new Headers({"cache-control":"no-store"});
 if(snapshot.quantity&&!existing)headers.set("set-cookie",cookieName+"="+id+"; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=31536000");
 return Response.json({ok:true},{headers});
}
export async function readCartMetrics(db:Database){
 const now=Date.now(),cutoff=now-CART_WINDOW_MS;
 await db.prepare("DELETE FROM store_cart_snapshots WHERE updated_at<?").bind(cutoff).run();
 const row=await db.prepare("SELECT COUNT(*) AS carts,COALESCE(SUM(quantity),0) AS quantity FROM store_cart_snapshots WHERE updated_at>=? AND quantity>0").bind(cutoff).first<{carts:number;quantity:number}>();
 return {cartQuantity:Number(row?.quantity||0),nonemptyCarts:Number(row?.carts||0),windowDays:30,asOf:now};
}
