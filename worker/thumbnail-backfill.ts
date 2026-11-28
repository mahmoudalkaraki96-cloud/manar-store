// 1.10.2: pre-makes the small thumbnails (cart, cards, admin) for every product and variant image,
// a few dozen images per scheduled run, and stores them in R2 next to the originals. The thumbnail
// route finds them there, so carts never wait for — or depend on — an on-demand resize.
import {decodeImage,encodeThumbnail} from "./thumb-maker";
import {CARD_QUALITY} from "../shared/image-sizes";

export const BACKFILL_WIDTHS=[256,384,640];
const BATCH=40,TIME_BUDGET_MS=15_000,LEASE_MS=90_000;

interface Statement{bind(...values:unknown[]):Statement;first<T>():Promise<T|null>;all<T>():Promise<{results:T[]}>;run():Promise<{meta:{changes?:number}}>}
interface Database{prepare(sql:string):Statement}
interface StoredObject{body:ReadableStream}
interface Bucket{head(key:string):Promise<unknown>;get(key:string):Promise<StoredObject|null>;put(key:string,value:ArrayBuffer,options?:{httpMetadata?:Record<string,string>}):Promise<unknown>}
export type BackfillEnv={DB:Database;MEDIA:Bucket};

let tableReady:Promise<unknown>|null=null;
function ensureTable(db:Database){
  tableReady??=db.prepare("CREATE TABLE IF NOT EXISTS thumbnail_backfill (id INTEGER PRIMARY KEY CHECK(id=1),last_media_id INTEGER NOT NULL DEFAULT 0,made INTEGER NOT NULL DEFAULT 0,skipped INTEGER NOT NULL DEFAULT 0,failed INTEGER NOT NULL DEFAULT 0,lease_until INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL DEFAULT 0)").run()
    .then(()=>db.prepare("INSERT OR IGNORE INTO thumbnail_backfill (id) VALUES (1)").run())
    .catch((error:unknown)=>{tableReady=null;throw error});
  return tableReady;
}

/** R2 key of the original for a stored image URL (absolute or relative), or null when it is not ours to resize. */
export function mediaKeyOf(url:string):string|null{
  try{
    const path=new URL(url,"https://store.invalid").pathname;
    if(!path.startsWith("/media/")||path.startsWith("/media/thumbnails/")||/\.svg$/i.test(path))return null;
    return decodeURIComponent(path.slice("/media/".length));
  }catch{return null}
}
/** Same key layout as the /_media/thumbnail route uses for card sizes. */
export const thumbnailKeyOf=(sourceKey:string,width:number)=>`thumbnails/w${width}/${sourceKey.replace(/\.[^.]+$/,"")}.webp`;

export async function backfillThumbnails(env:BackfillEnv){
  if(!env.MEDIA||!env.DB)return;
  await ensureTable(env.DB);
  const start=Date.now();
  const lease=await env.DB.prepare("UPDATE thumbnail_backfill SET lease_until=? WHERE id=1 AND lease_until<?").bind(start+LEASE_MS,start).run();
  if(!lease.meta.changes)return;
  let made=0,skipped=0,failed=0,lastId=0;
  try{
    const state=await env.DB.prepare("SELECT last_media_id FROM thumbnail_backfill WHERE id=1").first<{last_media_id:number}>();
    lastId=Number(state?.last_media_id||0);
    const {results}=await env.DB.prepare("SELECT id,url FROM product_media WHERE media_type='image' AND id>? ORDER BY id LIMIT ?").bind(lastId,BATCH).all<{id:number;url:string}>();
    const seen=new Set<string>();
    for(const row of results){
      if(Date.now()-start>TIME_BUDGET_MS)break;
      lastId=row.id;
      const key=mediaKeyOf(String(row.url||""));
      if(!key||seen.has(key)){skipped++;continue}
      seen.add(key);
      try{
        const heads=await Promise.all(BACKFILL_WIDTHS.map(width=>env.MEDIA.head(thumbnailKeyOf(key,width))));
        const missing=BACKFILL_WIDTHS.filter((_,index)=>!heads[index]);
        if(!missing.length){skipped++;continue}
        const original=await env.MEDIA.get(key);
        if(!original){skipped++;continue}
        const image=await decodeImage(await new Response(original.body).arrayBuffer());
        if(!image){skipped++;continue}
        for(const width of missing){
          const bytes=await encodeThumbnail(image,width,CARD_QUALITY);
          await env.MEDIA.put(thumbnailKeyOf(key,width),bytes,{httpMetadata:{contentType:"image/webp",cacheControl:"public, max-age=31536000, immutable"}});
        }
        made++;
      }catch(error){
        failed++;
        console.error(JSON.stringify({event:"thumbnail_backfill_image_failed",mediaId:row.id,message:error instanceof Error?error.message:"unknown"}));
      }
    }
  }finally{
    await env.DB.prepare("UPDATE thumbnail_backfill SET last_media_id=?,made=made+?,skipped=skipped+?,failed=failed+?,lease_until=0,updated_at=? WHERE id=1").bind(lastId,made,skipped,failed,Date.now()).run();
  }
}
