// One public listing request per supplier per five minutes. Never publishes products.
type Source = 'dofesh' | 'jabari';
type Card = {id:number;name:string;price:string;image:string;url:string;category?:string;options?:string};
const sources = {dofesh:{host:'dofesh.ps',number:9101,name:'متجر دوفش'},jabari:{host:'jabaristore.com',number:9102,name:'جعبري ستور'}};
export function salePrice(cost:number,source:Source){return cost+(source==='jabari'?(cost<=500?50:cost<=1000?100:cost<=3000?150:cost<=7000?200:cost<=10000?500:1000):0)}
export function plain(s:string){return s.replace(/<[^>]*>/g,' ').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>String.fromCodePoint(n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n))).replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim()}
export function listing(html:string,source:Source):{cards:Card[];next:number|null}{
 const host=sources[source].host,cards:Card[]=[];
 for(const m of html.matchAll(/<a\b([^>]*\bid=["']link-(\d+)["'][^>]*)>([\s\S]*?)<\/a>/gi)){
  const b=m[3],name=plain(b.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i)?.[1]||'');
  const price=plain((b.match(/<div\b[^>]*class=["'][^"']*\bprice\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]||'').replace(/<(del|s)\b[^>]*>[\s\S]*?<\/\1>/gi,''));
  const img=b.match(/<img\b[^>]*src=["']([^"']+)["']/i)?.[1]||'';
  if(name&&price)cards.push({id:Number(m[2]),name,price,image:img?new URL(img,`https://${host}/`).href:'',url:`https://${host}/?app=product.show.${m[2]}`});
 }
 const next=html.match(/<a\b[^>]*href=["'][^"']*app=product\.all\.\.(\d+)[^"']*["'][^>]*rel=["']next["']/i);
 return {cards,next:next?Number(next[1]):null};
}
export function supplierCost(text:string){const n=text.match(/\d+(?:\.\d+)?/);if(!n)throw new Error('missing_price');const v=Math.round(Number(n[0])*100);if(!Number.isFinite(v)||v<0)throw new Error('invalid_price');return v}
function category(name:string){const rules:[RegExp,number][]=[[/علب|علبة|صندوق|صناديق/,1037],[/كيس|أكياس|اكياس|تغليف|ورق/,1038],[/شمع/,1010],[/ورد|زهور|زهرة/,1011],[/تول|قماش|أقمشة/,1042],[/شريط|شرائط|ببيون/,1041],[/مرايا|مرآة|مراية/,1009],[/أكري|اكري|أكر|اكر/,1047],[/خشب|خشبي|CNC/i,1048],[/لولو|سترس/,1052],[/سبحة|مسابح/,1033],[/صينية|صواني|سلة|سلال/,1039],[/مبخرة|مباخر/,1045],[/عطر|عطور|صابون/,1044],[/ستاند/,1055],[/اكسسوار|إكسسوار|زينة/,1053]];return rules.find(([r])=>r.test(name))?.[1]||1060}
export async function saveDraft(db:any,source:Source,card:Card){
 const key=`${source}-${card.id}`,slug=`supplier-${key}`,now=Date.now(),cost=supplierCost(card.price),supplier=sources[source];
 const existing=await db.prepare('SELECT p.id FROM products p LEFT JOIN product_keywords k ON k.product_id=p.id LEFT JOIN product_suppliers ps ON ps.product_id=p.id LEFT JOIN suppliers s ON s.id=ps.supplier_id WHERE k.keyword=? OR p.slug=? OR (s.supplier_number=? AND ps.source_product_id=?) LIMIT 1').bind(key,slug,supplier.number,String(card.id)).first();
 if(existing)return false;
 const specs=`مسودة استيراد: بحاجة مراجعة الصور والتصنيف والخيارات قبل النشر. سعر المورد المعروض: ${card.price}${card.options?'؛ خيارات المورد: '+card.options:''}`;
 await db.batch([
 db.prepare('INSERT INTO products(item_number,category_id,name,slug,description,specifications,price_agorot,purchase_price_agorot,stock_quantity,active,featured,created_at,updated_at) SELECT COALESCE(MAX(item_number),1000)+1,(SELECT id FROM categories WHERE category_number=?),?,?,?, ?,?,?,0,0,0,?,? FROM products WHERE NOT EXISTS(SELECT 1 FROM products WHERE slug=?) HAVING NOT EXISTS(SELECT 1 FROM products WHERE slug=?)').bind(category(card.name),card.name,slug,card.name,specs,salePrice(cost,source),cost,now,now,slug,slug),
 db.prepare('INSERT OR IGNORE INTO product_keywords(product_id,keyword) SELECT id,? FROM products WHERE slug=?').bind(key,slug),
 db.prepare('INSERT OR IGNORE INTO product_suppliers(product_id,supplier_id,source_product_id,source_url,supplier_price_agorot,preferred,created_at,updated_at) SELECT p.id,s.id,?,?,?,1,?,? FROM products p JOIN suppliers s ON s.supplier_number=? WHERE p.slug=?').bind(String(card.id),card.url,cost,now,now,supplier.number,slug),
 db.prepare("INSERT INTO product_media(product_id,media_type,url,alt_text,sort_order,is_primary,created_at,updated_at) SELECT id,'image',?,?,0,1,?,? FROM products WHERE slug=? AND ?<>'' AND NOT EXISTS(SELECT 1 FROM product_media m WHERE m.product_id=products.id AND m.url=?)").bind(card.image,card.name,now,now,slug,card.image,card.image)
 ]);return true;
}
export async function readSupplierImports(db:any){return {jobs:(await db.prepare('SELECT source,status,next_page,pages_scanned,created_count,skipped_count,last_error,next_attempt_at,updated_at FROM supplier_import_jobs ORDER BY source').all()).results,pending:(await db.prepare('SELECT source,COUNT(*) AS total FROM supplier_import_seed WHERE processed=0 GROUP BY source').all()).results}}
export async function runSupplierImports(env:any){
 if(env.APP_SURFACE!=='storefront')return;
 const db=env.DB,now=Date.now(),token=crypto.randomUUID();
 const lease=await db.prepare("UPDATE supplier_import_lock SET token=?,expires_at=? WHERE id=1 AND expires_at<?").bind(token,now+240000,now).run();
 if(!lease.meta?.changes)return;
 try{
  const seeds=(await db.prepare('SELECT source,source_id,data FROM supplier_import_seed WHERE processed=0 ORDER BY source,source_id DESC LIMIT 60').all()).results;
  if(seeds.length){for(const seed of seeds){const created=await saveDraft(db,seed.source,JSON.parse(seed.data));await db.batch([db.prepare('UPDATE supplier_import_seed SET processed=1 WHERE source=? AND source_id=?').bind(seed.source,seed.source_id),db.prepare('UPDATE supplier_import_jobs SET created_count=created_count+?,skipped_count=skipped_count+?,updated_at=? WHERE source=?').bind(created?1:0,created?0:1,Date.now(),seed.source)])}return;}
  const job=await db.prepare("SELECT * FROM supplier_import_jobs WHERE status='running' AND next_attempt_at<=? ORDER BY next_attempt_at LIMIT 1").bind(now).first();
  if(!job)return;
  const source=job.source as Source,host=sources[source].host;
  // Persist the cooldown BEFORE network work; errors and overlapping crons cannot accelerate requests.
  await db.prepare('UPDATE supplier_import_jobs SET next_attempt_at=?,updated_at=? WHERE source=?').bind(now+300000,now,source).run();
  try{
   const response=await fetch(`https://${host}/?app=product.all..${job.next_page}`,{redirect:'error',headers:{'Accept':'text/html','User-Agent':'ManarCatalogImport/1.0 (+https://manarstore.ps)'},signal:AbortSignal.timeout(30000)});
   if(!response.ok){const blocked=[403,429].includes(response.status);await db.prepare('UPDATE supplier_import_jobs SET status=?,last_error=?,next_attempt_at=? WHERE source=?').bind(blocked?'paused_blocked':'running',`HTTP ${response.status}`,now+(blocked?86400000:1800000),source).run();return;}
   const html=await response.text();if(/cf-chl-|captcha|access denied|too many requests|temporarily blocked/i.test(html))throw new Error('supplier_block');
   const parsed=listing(html,source);if(!parsed.cards.length)throw new Error('listing_not_verified');
   const fingerprint=parsed.cards.map(c=>c.id).join(',');if(fingerprint===job.last_fingerprint)throw new Error('repeated_page');
   if(parsed.next!==null&&parsed.next!==Number(job.next_page)+1)throw new Error('unexpected_pagination');
   if(parsed.next===null&&parsed.cards.length>=60)throw new Error('pagination_not_verified');
   let created=0,skipped=0;for(const card of parsed.cards){if(await saveDraft(db,source,card))created++;else skipped++;}
   await db.prepare('UPDATE supplier_import_jobs SET status=?,next_page=?,pages_scanned=pages_scanned+1,created_count=created_count+?,skipped_count=skipped_count+?,last_fingerprint=?,last_error=NULL,updated_at=? WHERE source=?').bind(parsed.next===null?'completed_drafts':'running',parsed.next||job.next_page,created,skipped,fingerprint,Date.now(),source).run();
  }catch(error){await db.prepare("UPDATE supplier_import_jobs SET status='paused_review',last_error=?,updated_at=? WHERE source=?").bind(String(error).slice(0,200),Date.now(),source).run();}
 }finally{await db.prepare('UPDATE supplier_import_lock SET expires_at=0 WHERE id=1 AND token=?').bind(token).run();}
}