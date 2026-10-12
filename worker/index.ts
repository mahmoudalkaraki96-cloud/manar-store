import {readAdminDashboard} from "./admin-dashboard";
import {recordCart,readCartMetrics,readCartDetails} from "./cart-metrics";
import {buildMetaPixelHead} from "./meta-pixel";
/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import { scrypt as nodeScrypt, pbkdf2 as nodePbkdf2 } from "node:crypto";
import {pushApi,drainPushQueue,notifyNewOrder,notifyOrderStatus,pushAdminSummary,queueCampaign} from "./push";
import handler from "vinext/server/app-router-entry";
import { importedDistributionProducts } from "./import-cat40.generated";
import importedAllProducts from "./import-all-products.generated.json";
import importedJabariProducts from "./import-jabari-products.generated.json";
import importedJabariVariants from "./import-jabari-variants.generated.json";
import importedDofeshVariants from "./import-dofesh-variants.generated.json";
import { product2222ImageBase64 } from "./product-2222-image.generated";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  MEDIA: R2Bucket;
  AI: { run(model: string, input: unknown): Promise<unknown> };
  APP_SURFACE?: "storefront" | "admin";
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface D1Meta { last_row_id?: number | string; changes?: number }
interface D1Result<T = Record<string, unknown>> { results: T[]; meta: D1Meta }
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}
interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}
interface R2ObjectBody { body: ReadableStream; httpEtag: string; writeHttpMetadata(headers: Headers): void }
interface R2Bucket { get(key: string): Promise<R2ObjectBody | null>; put(key: string, body: ReadableStream | ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown> }
interface Fetcher { fetch(request: Request): Promise<Response> }

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const json = (data: unknown, init: ResponseInit = {}) => Response.json(data, {
  ...init,
  headers: { "cache-control": "no-store", ...(init.headers || {}) },
});

const PUBLIC_API_CACHE_CONTROL = "public, max-age=60, s-maxage=300, stale-while-revalidate=86400";
const publicJson = (data: unknown) => json(data, { headers: { "cache-control": PUBLIC_API_CACHE_CONTROL } });
const GOOGLE_ANALYTICS_ID = "G-PB5GHRZS5S";
async function readMetaPixelHead(env:Env,url:URL){
  if(url.hostname!=="manarstore.ps"&&url.hostname!=="www.manarstore.ps")return "";
  const row=await env.DB.prepare("SELECT * FROM store_settings WHERE id=1").first<Record<string,unknown>>();
  return buildMetaPixelHead(row?.meta_pixel_id==null?"1231904457865622":String(row.meta_pixel_id),Boolean(row?.meta_pixel_enabled??1));
}
const googleAnalyticsHead = '<script async src="https://www.googletagmanager.com/gtag/js?id='+GOOGLE_ANALYTICS_ID+'"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("js",new Date());gtag("config","'+GOOGLE_ANALYTICS_ID+'");</script>';

const amount = (agorot: number | null) => agorot == null ? undefined : agorot / 100;
const agorot = (value: unknown) => Math.max(0, Math.round(Number(value || 0) * 100));
const nullableAgorot = (value: unknown) => value === "" || value == null ? null : agorot(value);
const asText = (value: unknown) => typeof value === "string" ? value.trim() : "";
const asOptionalText = (value: unknown) => asText(value) || null;
const asBoolean = (value: unknown) => value === true || value === 1;
const slugify = (value: string) => value.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || crypto.randomUUID();
const validColor = (value: unknown, fallback: string) => /^#[0-9a-f]{6}$/i.test(asText(value)) ? asText(value) : fallback;
const safeUrl = (value: unknown) => { const text = asText(value); if (!text) return null; try { const url = new URL(text); return ["http:", "https:"].includes(url.protocol) ? text : null; } catch { return null; } };
const safeTarget = (value:unknown) => { const text=asText(value); return text.startsWith("/")&&!text.startsWith("//")?text:safeUrl(text); };
async function ensureStorefrontColumns(env:Env){const info=await env.DB.prepare("PRAGMA table_info(store_settings)").all<{name:string}>(),names=new Set(info.results.map(row=>row.name)),columns:Array<[string,string]>=[["background_color","text DEFAULT '#ffffff' NOT NULL"],["whatsapp_enabled","integer DEFAULT 1 NOT NULL"],["facebook_enabled","integer DEFAULT 1 NOT NULL"],["instagram_enabled","integer DEFAULT 1 NOT NULL"],["tiktok_enabled","integer DEFAULT 1 NOT NULL"],["slider_interval_ms","integer DEFAULT 5000 NOT NULL"],["show_out_of_stock","integer DEFAULT 1 NOT NULL"],["show_offers","integer DEFAULT 1 NOT NULL"],["show_most_ordered","integer DEFAULT 0 NOT NULL"],["show_top_rated","integer DEFAULT 0 NOT NULL"],["show_newest","integer DEFAULT 1 NOT NULL"],["show_featured","integer DEFAULT 1 NOT NULL"],["home_products_limit","integer DEFAULT 6 NOT NULL"],["show_subcategory_products_in_parent","integer DEFAULT 1 NOT NULL"],["watermark_opacity","integer DEFAULT 25 NOT NULL"],["watermark_enabled","integer DEFAULT 1 NOT NULL"],["watermark_x","real DEFAULT 90 NOT NULL"],["watermark_y","real DEFAULT 90 NOT NULL"],["watermark_size","real DEFAULT 24 NOT NULL"],["site_name_ar","text DEFAULT 'منار بارتي ستور' NOT NULL"],["site_name_en","text DEFAULT 'Manar Party Store' NOT NULL"],["seo_description","text DEFAULT 'قطع وإكسسوارات التوزيعات بالجملة والتجزئة' NOT NULL"],["favicon_url","text DEFAULT '' NOT NULL"],["meta_pixel_id","text DEFAULT '1231904457865622' NOT NULL"],["meta_pixel_enabled","integer DEFAULT 1 NOT NULL"]];for(const [name,definition] of columns)if(!names.has(name))await env.DB.prepare(`ALTER TABLE store_settings ADD COLUMN ${name} ${definition}`).run()}
async function ensureHighlightSchema(env:Env){
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS store_highlights (id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,cover_url TEXT NOT NULL,images_json TEXT NOT NULL,sort_order INTEGER NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS highlight_visibility (id INTEGER PRIMARY KEY CHECK(id=1),enabled INTEGER NOT NULL DEFAULT 1)").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS highlight_image_numbers (id INTEGER PRIMARY KEY AUTOINCREMENT,highlight_id INTEGER NOT NULL,url TEXT NOT NULL,image_number INTEGER,UNIQUE(highlight_id,url))").run();
  const info=await env.DB.prepare("PRAGMA table_info(highlight_image_numbers)").all<{name:string}>();
  if(!info.results.some(row=>row.name==="image_number"))await env.DB.prepare("ALTER TABLE highlight_image_numbers ADD COLUMN image_number INTEGER").run();
  if(!info.results.some(row=>row.name==="view_count"))await env.DB.prepare("ALTER TABLE highlight_image_numbers ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0").run();
  await env.DB.prepare("UPDATE highlight_image_numbers SET image_number=(SELECT COUNT(*) FROM highlight_image_numbers previous WHERE previous.highlight_id=highlight_image_numbers.highlight_id AND previous.id<=highlight_image_numbers.id) WHERE image_number IS NULL").run();
  const visibilityInfo=await env.DB.prepare("PRAGMA table_info(highlight_visibility)").all<{name:string}>();
  if(!visibilityInfo.results.some(row=>row.name==="interval_ms"))await env.DB.prepare("ALTER TABLE highlight_visibility ADD COLUMN interval_ms INTEGER NOT NULL DEFAULT 5000").run();
}
async function assignHighlightNumbers(env:Env,highlightId:number,urls:string[]){
  const current=await env.DB.prepare("SELECT url,image_number FROM highlight_image_numbers WHERE highlight_id=?").bind(highlightId).all<{url:string;image_number:number}>();
  const known=new Set(current.results.map(row=>row.url));
  let next=Math.max(0,...current.results.map(row=>Number(row.image_number)||0));
  const statements=urls.filter(url=>!known.has(url)).map(url=>env.DB.prepare("INSERT OR IGNORE INTO highlight_image_numbers (highlight_id,url,image_number) VALUES (?,?,?)").bind(highlightId,url,++next));
  if(statements.length)await env.DB.batch(statements);
}
function highlightFromRow(row:Record<string,unknown>){
  let images:string[]=[];
  try { const parsed=JSON.parse(String(row.images_json||"[]"));if(Array.isArray(parsed))images=parsed.filter((value):value is string=>typeof value==="string"&&value.startsWith("/media/")); } catch {}
  return {id:Number(row.id),title:String(row.title||""),coverUrl:String(row.cover_url||"")||images[0]||"",images,imageNumbers:[] as string[],imageViews:[] as number[],sortOrder:Number(row.sort_order||0),active:Boolean(row.active),views:Number(row.view_count||0)};
}
async function readHighlights(env:Env,includeInactive=false){
  await ensureHighlightSchema(env);
  const [rows,visibility]=await Promise.all([
    env.DB.prepare("SELECT id,title,cover_url,images_json,sort_order,active,view_count FROM store_highlights ORDER BY sort_order,id").all<Record<string,unknown>>(),
    env.DB.prepare("SELECT enabled,interval_ms FROM highlight_visibility WHERE id=1").first<{enabled:number;interval_ms:number}>()
  ]);
  const highlights=rows.results.map(highlightFromRow).filter(item=>includeInactive||item.active);
  if(highlights.length){
    const numbers=await env.DB.prepare("SELECT highlight_id,url,image_number,view_count FROM highlight_image_numbers").all<{highlight_id:number;url:string;image_number:number;view_count:number}>();
    const lookup=new Map(numbers.results.map(image=>[image.highlight_id+"|"+image.url,{number:image.image_number,views:Number(image.view_count)||0}]));
    const missing=highlights.filter(item=>item.images.some(url=>!lookup.has(item.id+"|"+url)));
    if(missing.length){
      for(const item of missing)await assignHighlightNumbers(env,item.id,item.images);
      const updated=await env.DB.prepare("SELECT highlight_id,url,image_number,view_count FROM highlight_image_numbers").all<{highlight_id:number;url:string;image_number:number;view_count:number}>();
      for(const image of updated.results)lookup.set(image.highlight_id+"|"+image.url,{number:image.image_number,views:Number(image.view_count)||0});
    }
    for(const item of highlights){
      item.imageNumbers=item.images.map(url=>"H"+item.id+"-"+lookup.get(item.id+"|"+url)?.number);
      item.imageViews=item.images.map(url=>lookup.get(item.id+"|"+url)?.views||0);
    }
  }
  return {enabled:visibility?.enabled!==0,intervalMs:Math.min(20000,Math.max(2000,Number(visibility?.interval_ms)||5000)),highlights};
}
async function saveHighlight(request:Request,env:Env,id?:number){
  await ensureHighlightSchema(env);
  const body=await parseJson(request),title=asText(body.title).slice(0,60),raw=body.images;
  const images=Array.isArray(raw)?raw.filter((value):value is string=>typeof value==="string"&&value.startsWith("/media/")).slice(0,200):[];
  const cover=asText(body.coverUrl)||images.find(value=>! /\.(mp4|webm)(?:\?|$)/i.test(value))||"";
  if(!title||!images.length||!cover.startsWith("/media/")||/\.(mp4|webm)(?:\?|$)/i.test(cover)||!Array.isArray(raw)||raw.length!==images.length||new Set(images).size!==images.length)return json({error:"العنوان وصور الهايلايت والغلاف مطلوبون، ولا يمكن تكرار الصورة"},{status:400});
  const order=Math.max(0,Math.min(1000,Number(body.sortOrder)||0)),active=asBoolean(body.active)?1:0,now=Date.now();
  if(id){
    const result=await env.DB.prepare("UPDATE store_highlights SET title=?,cover_url=?,images_json=?,sort_order=?,active=?,updated_at=? WHERE id=?")
      .bind(title,cover,JSON.stringify(images),order,active,now,id).run();
    if(result.meta?.changes===0)return json({error:"الهايلايت غير موجودة"},{status:404});
  }else{
    const count=await env.DB.prepare("SELECT COUNT(*) AS count FROM store_highlights").first<{count:number}>();
    if(Number(count?.count||0)>=100)return json({error:"الحد الأقصى 100 هايلايت"},{status:400});
    const result=await env.DB.prepare("INSERT INTO store_highlights (title,cover_url,images_json,sort_order,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
      .bind(title,cover,JSON.stringify(images),order,active,now,now).run();
    id=Number(result.meta.last_row_id);
  }
  await assignHighlightNumbers(env,id,images);
  return json({ok:true});
}

async function ensureCustomizationSchema(env:Env){await env.DB.prepare("CREATE TABLE IF NOT EXISTS product_custom_fields (id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER NOT NULL,label TEXT NOT NULL,placeholder TEXT,max_length INTEGER DEFAULT 60 NOT NULL,required INTEGER DEFAULT 0 NOT NULL,sort_order INTEGER DEFAULT 0 NOT NULL,FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE)").run();const info=await env.DB.prepare("PRAGMA table_info(order_items)").all<{name:string}>();if(!info.results.some(row=>row.name==="customization_json"))await env.DB.prepare("ALTER TABLE order_items ADD COLUMN customization_json TEXT").run();const categoryInfo=await env.DB.prepare("PRAGMA table_info(categories)").all<{name:string}>();if(!categoryInfo.results.some(row=>row.name==="icon_url"))await env.DB.prepare("ALTER TABLE categories ADD COLUMN icon_url TEXT").run()}

const importedPearlProducts = [
  { sourceId: 598, name: "لولو نص حبة 8 مل", price: 30, image: "b8a71253-89e9-44f0-bab2-48c597ea4d3c", folder: "09-2025", extension: "jpeg" },
  { sourceId: 301, name: "سترس محجر 9 متر اصلي", price: 20, image: "IMG_2446", folder: "04-2026", extension: "png" },
  { sourceId: 300, name: "رول لولو نص حبة 60 متر لون لولي", price: 30, image: "bbeae8e9-8a91-48ad-9f06-8f6ddcc4c110", folder: "08-2025", extension: "jpeg" },
  { sourceId: 299, name: "رول لولو نص حبة 60 متر أزرق", price: 30, image: "48227ac6-90dd-4278-9f63-088c32a8229e", folder: "08-2025", extension: "jpeg" },
  { sourceId: 298, name: "رول لولو نص حبة 60 متر زهري", price: 30, image: "a6889f08-71cf-4bff-961a-a881e4f82e84", folder: "08-2025", extension: "jpeg" },
  { sourceId: 297, name: "رول لولو 60 متر أبيض", price: 40, image: "e914d712-ad9d-4099-82b9-0b7201f85225", folder: "08-2025", extension: "jpeg" },
  { sourceId: 296, name: "رول لولو 60متر ذهبي", price: 40, image: "c8727f4b-98d0-4a4b-84d9-12ffc7400ea4", folder: "08-2025", extension: "jpeg" },
  { sourceId: 295, name: "رول لولو 60متر لون لولي", price: 40, image: "4fa0b281-313e-43e6-b02b-72cad1969cb4", folder: "08-2025", extension: "jpeg" },
] as const;

const importedResinProducts = [
  { sourceId: 948, name: "ريزون علاقة زهري محجر", price: 3, image: "upload/02-2026/product/IMG_9524", extension: "jpeg" },
  { sourceId: 936, name: "ريزون حجم كبير سادى مقاس ٢٨ سم مع قاعدة ذهبية", price: 40, image: "upload/02-2026/product/IMG_9240", extension: "jpeg" },
  { sourceId: 935, name: "ريزون حجم كبير مع قاعدة ذهبية مقاس ٢٨ سم محجر من الاطراف", price: 40, image: "upload/02-2026/product/IMG_9237", extension: "jpeg" },
  { sourceId: 674, name: "ريزون محجر مع علاقة", price: 3, image: "upload/11-2025/product/dbd774df-3949-420c-bcb7-8d1487b23b5d", extension: "jpeg" },
  { sourceId: 233, name: "ريزون تعليقة أزرق محجر 6سم", price: 2, image: "upload/08-2025/product/e1e69485-936f-4445-9267-9beb8c360dd6", extension: "jpeg" },
  { sourceId: 232, name: "ريزون مذهب سادى بدون حجر7سم", price: 2, image: "upload/11-2025/product/15f99f4d-22fe-4168-a35a-ae6c98deda71", extension: "jpeg" },
  { sourceId: 231, name: "ريزون محجر مدور زهري 7سم", price: 2, image: "upload/11-2025/product/0d128ee4-63bb-4aaa-a58b-d40231069083", extension: "jpeg" },
  { sourceId: 230, name: "ريزن مدور محجر فضي 7سم", price: 2, image: "upload/08-2025/product/9991e99e-e308-45c8-b333-24b4269a554e", extension: "jpeg" },
  { sourceId: 229, name: "ريزون محجر مدور ذهبي", price: 2, image: "upload/08-2025/product/d826b23e-190a-4e34-a56c-6f6538d5ce01 (1)", extension: "jpeg" },
  { sourceId: 228, name: "ريزون محجر ذهبي", price: 2, image: "upload/08-2025/product/1ae992a5-127d-43f1-be3c-a8060b90b96f", extension: "jpeg" },
  { sourceId: 227, name: "ريزون محجر ذهبي", price: 2, image: "upload/11-2025/product/8f627bbf-7d94-4cf0-aa72-718d4e713ff0", extension: "jpeg" },
  { sourceId: 226, name: "ريزون أزرق محجر", price: 3, image: "upload/08-2025/product/707f3fc0-e5ea-405a-8eb8-d2ec74e1dd1e", extension: "jpeg", variants: ["مدور", "مشرف"] },
  { sourceId: 225, name: "ريزون محجر زهري 7سم", price: 2, image: "upload/08-2025/product/386a726e-2f5c-49b7-9663-9307be9d9f48", extension: "jpeg" },
  { sourceId: 224, name: "ريزون زهري محجر 7 سم", price: 2, image: "upload/08-2025/product/e5dd22cf-0ec6-4a88-88ac-2ccfc23689b7", extension: "jpeg" },
] as const;

const importedMediaSources = new Map<string, readonly string[]>(importedPearlProducts.map((product) => {
  const base = `https://dofesh.ps/upload/${product.folder}/product/${product.image}`;
  return [`imports/dofesh-${product.sourceId}.${product.extension}`, [`${base}-IDX.${product.extension}`, `${base}-450px.${product.extension}`]] as const;
}).concat(importedResinProducts.map((product) => {
  const base = `https://dofesh.ps/${product.image}`;
  return [`imports/dofesh-${product.sourceId}.${product.extension}`, [`${base}-IDX.${product.extension}`, `${base}-450px.${product.extension}`]] as const;
})).concat(importedDistributionProducts.map((product) => {
  const pathname = new URL(product.image).pathname;
  const extension = pathname.split(".").pop()?.toLowerCase() || "jpeg";
  return [`imports/dofesh-${product.id}.${extension}`, [product.image, product.image.replace("-IDX.", "-450px.")]] as const;
})).concat(importedAllProducts.map((product) => {
  const extension = new URL(product.image).pathname.split(".").pop()?.toLowerCase() || "jpeg";
  return [`imports/dofesh-${product.id}.${extension}`, [product.image, product.image.replace("-450px.", "-IDX.")]] as const;
})).concat(importedJabariProducts.map((product) => {
  const extension = new URL(product.imageUrl).pathname.split(".").pop()?.toLowerCase() || "jpeg";
  return [`imports/jabari-${product.sourceId}.${extension}`, [product.imageUrl]] as const;
})).concat(([...importedJabariVariants.map(record => ({source:"jabari",record})),...importedDofeshVariants.map(record => ({source:"dofesh",record}))]).flatMap(({source,record}) => Object.values(record.groups || {}).flat().map((variant, index) => {
  if (!variant.imageUrl) return null;
  const absolute = new URL(variant.imageUrl, source === "jabari" ? "https://jabaristore.com/" : "https://dofesh.ps/").toString();
  const extension = new URL(absolute).pathname.split(".").pop()?.toLowerCase() || "jpeg";
  return [`imports/${source}-${record.sourceId}-variant-${index}.${extension}`, [absolute]] as const;
}).filter((item): item is readonly [string, readonly string[]] => Boolean(item)))));

const organizedCategoryTree = [
  ["توزيعات وهدايا المناسبات", ["توزيعات الأعراس والحناء", "توزيعات المواليد", "الحج والعمرة", "التخرج والنجاح", "هدايا وتوزيعات عامة"]],
  ["التغليف والعلب", ["علب وصناديق", "أكياس وورق تغليف", "صواني وسلال"]],
  ["الورد والشرائط والأقمشة", ["الورود", "الشرائط والببيونات", "الأقمشة والتول"]],
  ["الشموع والعطور والمباخر", ["الشموع", "العطور والصابون", "المباخر"]],
  ["الأكريليك والخشب والطباعة", ["الأكريليك", "الخشب وCNC", "الطباعة والكروت"]],
  ["الزينة والإكسسوارات", ["زينة الشوكولاتة", "اللولو والسترس", "زينة وإكسسوارات عامة"]],
  ["المرايا والستاندات", ["المرايا", "الستاندات", "المسكات واللوحات"]],
  ["أدوات ومستلزمات العمل", ["أدوات العمل", "الخامات", "مستلزمات متنوعة"]],
] as const;

function organizedCategoryFor(name: string) {
  const n = name.replace(/[إأآ]/g, "ا").replace(/ة/g, "ه").toLowerCase();
  if (/عروس|اعراس|زفاف|حناء|خطوب|عرسان/.test(n)) return "توزيعات الأعراس والحناء";
  if (/بيبي|مولود|مواليد|طفل/.test(n)) return "توزيعات المواليد";
  if (/حج|عمره|زمزم|مصاحف|مصحف|ايه الكرسي|تسبيح|مسابح/.test(n)) return "الحج والعمرة";
  if (/تخرج|نجاح|جامعه|مدرسه|طاقيه/.test(n)) return "التخرج والنجاح";
  if (/شموع|شمع|فتيل/.test(n)) return "الشموع";
  if (/مبخر|بخور/.test(n)) return "المباخر";
  if (/عطر|معطر|صابون|مسك الطهاره|كريم/.test(n)) return "العطور والصابون";
  if (/ورد|زهور|بوكيه|غصن|تيوليب/.test(n)) return "الورود";
  if (/شبر|شريط|ببيون|فيونك|ربطه/.test(n)) return "الشرائط والببيونات";
  if (/قماش|تول|خيش|لايكرا|كروشي|مكرميه|مكرمي/.test(n)) return "الأقمشة والتول";
  if (/علب|علبه|صندوق|بوكس|مرطبان|قنينه|قاروره|فازه|سكريه/.test(n)) return "علب وصناديق";
  if (/كيس|اكياس|تغليف|ورق|نايلون|سلفان/.test(n)) return "أكياس وورق تغليف";
  if (/صينيه|صواني|سله|سلال|ضيافه/.test(n)) return "صواني وسلال";
  if (/مرايا|مراه/.test(n)) return "المرايا";
  if (/ستاند|حامل|تلبيس ذهب|تلابيس ذهب/.test(n)) return "الستاندات";
  if (/مسكه|مسكه|لوحه استقبال|برواز استقبال/.test(n)) return "المسكات واللوحات";
  if (/اكريلك|اكريليك|بلاستيك شفاف/.test(n)) return "الأكريليك";
  if (/خشب|cnc|بامبو/.test(n)) return "الخشب وCNC";
  if (/طباع|كرت |كرتون للتزيين|كروت|ملصق|ستيكر/.test(n)) return "الطباعة والكروت";
  if (/شوكولات|ملبس|مطبقيه|سيجار/.test(n)) return "زينة الشوكولاتة";
  if (/لولو|سترس|كرستال|كريستال|محجر/.test(n)) return "اللولو والسترس";
  if (/مقص|سلكون|لزق|لزيق|ماكنه|ماكينه|مسدس|فرد |مغناطيس|حبر|اداه/.test(n)) return "أدوات العمل";
  if (/كونكريت|جبص|ريزن|ريزون|فخار|قش|حديد|نحاس|ريش|بالون/.test(n)) return "الخامات";
  if (/دب|زينة|زينه|اكسسوار|فراش|شرشوب|تعليقه|علاقه|ديكور/.test(n)) return "زينة وإكسسوارات عامة";
  if (/هديه|هدايا|توزيع|مروحه|مراوح|تحف/.test(n)) return "هدايا وتوزيعات عامة";
  return "مستلزمات متنوعة";
}

const distributionCategoryTree = [
  { sourceId: 40, name: "مستلزمات التوزيعات", parentSourceId: null },
  { sourceId: 41, name: "قسم الكونكريت(الجبصو)", parentSourceId: 40 },
  { sourceId: 42, name: "توزيعات اساور نحاس", parentSourceId: 40 },
  { sourceId: 45, name: "قسم القماش", parentSourceId: 40 },
  { sourceId: 46, name: "قماش ستان", parentSourceId: 45 },
  { sourceId: 52, name: "قسم تول الكريستال", parentSourceId: 45 },
  { sourceId: 53, name: "تول مدور للتوزيعات مقصوص", parentSourceId: 45 },
  { sourceId: 47, name: "قسم الشوكولاتة", parentSourceId: 40 },
  { sourceId: 48, name: "قسم الريزون", parentSourceId: 40 },
  { sourceId: 55, name: "قسم رولات اللولو", parentSourceId: 40 },
  { sourceId: 68, name: "فخار مشكل", parentSourceId: 40 },
  { sourceId: 74, name: "صابون معطر", parentSourceId: 40 },
  { sourceId: 93, name: "قسم الريش", parentSourceId: 40 },
] as const;

async function ensureImportedPearlProducts(env: Env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS product_import_seeds (seed_key TEXT PRIMARY KEY, completed_at INTEGER NOT NULL)").run();
  const seedKey = "dofesh-pearl-rolls-2026-08-31";
  if (await env.DB.prepare("SELECT seed_key FROM product_import_seeds WHERE seed_key=?").bind(seedKey).first()) return;
  const category = await env.DB.prepare("SELECT id FROM categories WHERE name=? LIMIT 1").bind("اكسسوارات التزين").first<{id:number}>();
  if (!category) return;
  let nextItemNumber = Number((await env.DB.prepare("SELECT COALESCE(MAX(item_number),1000)+1 AS next FROM products").first<{next:number}>())?.next || 1001);
  const now = Date.now();
  for (const product of importedPearlProducts) {
    const keyword = `dofesh-${product.sourceId}`;
    const existing = await env.DB.prepare("SELECT p.id FROM products p LEFT JOIN product_keywords k ON k.product_id=p.id WHERE k.keyword=? OR (p.category_id=? AND p.name=?) LIMIT 1").bind(keyword, category.id, product.name).first<{id:number}>();
    if (existing) continue;
    const result = await env.DB.prepare("INSERT INTO products (item_number,category_id,name,slug,description,specifications,price_agorot,wholesale_price_agorot,purchase_price_agorot,stock_quantity,active,featured,offer_price_agorot,view_count,order_count,rating_average_x100,rating_count,created_at,updated_at) VALUES (?,?,?,?,NULL,NULL,?,NULL,NULL,1,1,0,NULL,0,0,0,0,?,?)")
      .bind(nextItemNumber, category.id, product.name, slugify(`${product.name}-${nextItemNumber}`), product.price * 100, now, now).run();
    const productId = Number(result.meta.last_row_id);
    const mediaUrl = `/media/imports/dofesh-${product.sourceId}.${product.extension}`;
    await env.DB.batch([
      env.DB.prepare("INSERT INTO product_media (product_id,variant_id,media_type,url,alt_text,sort_order,is_primary,created_at,updated_at) VALUES (?,NULL,'image',?,?,0,1,?,?)").bind(productId, mediaUrl, product.name, now, now),
      env.DB.prepare("INSERT INTO product_keywords (product_id,keyword) VALUES (?,?)").bind(productId, keyword),
    ]);
    nextItemNumber += 1;
  }
  await env.DB.prepare("INSERT OR REPLACE INTO product_import_seeds (seed_key,completed_at) VALUES (?,?)").bind(seedKey, Date.now()).run();
}

async function ensureImportedResinProducts(env: Env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS product_import_seeds (seed_key TEXT PRIMARY KEY, completed_at INTEGER NOT NULL)").run();
  const seedKey = "dofesh-resin-2026-08-31";
  if (await env.DB.prepare("SELECT seed_key FROM product_import_seeds WHERE seed_key=?").bind(seedKey).first()) return;
  let category = await env.DB.prepare("SELECT id FROM categories WHERE name=? LIMIT 1").bind("قسم الريزون").first<{id:number}>();
  if (!category) {
    const now = Date.now();
    const categoryNumber = Number((await env.DB.prepare("SELECT COALESCE(MAX(category_number),1000)+1 AS next FROM categories").first<{next:number}>())?.next || 1001);
    const categoryResult = await env.DB.prepare("INSERT INTO categories (category_number,parent_id,name,slug,description,banner_url,icon_url,sort_order,active,created_at,updated_at) VALUES (?,NULL,?,?,NULL,NULL,NULL,0,1,?,?)")
      .bind(categoryNumber, "قسم الريزون", slugify("قسم الريزون"), now, now).run();
    category = { id: Number(categoryResult.meta.last_row_id) };
  }
  let nextItemNumber = Number((await env.DB.prepare("SELECT COALESCE(MAX(item_number),1000)+1 AS next FROM products").first<{next:number}>())?.next || 1001);
  const now = Date.now();
  for (const product of importedResinProducts) {
    const keyword = `dofesh-${product.sourceId}`;
    const existing = await env.DB.prepare("SELECT p.id FROM products p JOIN product_keywords k ON k.product_id=p.id WHERE k.keyword=? LIMIT 1").bind(keyword).first<{id:number}>();
    if (existing) continue;
    const result = await env.DB.prepare("INSERT INTO products (item_number,category_id,name,slug,description,specifications,price_agorot,wholesale_price_agorot,purchase_price_agorot,stock_quantity,active,featured,offer_price_agorot,view_count,order_count,rating_average_x100,rating_count,created_at,updated_at) VALUES (?,?,?,?,NULL,NULL,?,NULL,NULL,100,1,0,NULL,0,0,0,0,?,?)")
      .bind(nextItemNumber, category.id, product.name, slugify(`${product.name}-${nextItemNumber}`), product.price * 100, now, now).run();
    const productId = Number(result.meta.last_row_id);
    const mediaUrl = `/media/imports/dofesh-${product.sourceId}.${product.extension}`;
    await env.DB.batch([
      env.DB.prepare("INSERT INTO product_media (product_id,variant_id,media_type,url,alt_text,sort_order,is_primary,created_at,updated_at) VALUES (?,NULL,'image',?,?,0,1,?,?)").bind(productId, mediaUrl, product.name, now, now),
      env.DB.prepare("INSERT INTO product_keywords (product_id,keyword) VALUES (?,?)").bind(productId, keyword),
    ]);
    if ("variants" in product && product.variants?.length) {
      const optionResult = await env.DB.prepare("INSERT INTO product_options (product_id,name,display_type,sort_order) VALUES (?,'الشكل','text',0)").bind(productId).run();
      const optionId = Number(optionResult.meta.last_row_id);
      for (let index = 0; index < product.variants.length; index += 1) {
        const valueResult = await env.DB.prepare("INSERT INTO product_option_values (option_id,value,color_hex,sort_order) VALUES (?,?,NULL,?)").bind(optionId, product.variants[index], index).run();
        const variantResult = await env.DB.prepare("INSERT INTO product_variants (product_id,sku,price_agorot,wholesale_price_agorot,stock_quantity,active,created_at,updated_at) VALUES (?,NULL,?,NULL,100,1,?,?)").bind(productId, product.price * 100, now, now).run();
        await env.DB.prepare("INSERT INTO variant_option_values (variant_id,option_value_id) VALUES (?,?)").bind(Number(variantResult.meta.last_row_id), Number(valueResult.meta.last_row_id)).run();
      }
    }
    nextItemNumber += 1;
  }
  await env.DB.prepare("INSERT OR REPLACE INTO product_import_seeds (seed_key,completed_at) VALUES (?,?)").bind(seedKey, Date.now()).run();
}

async function ensureImportedDistributionProducts(env: Env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS product_import_seeds (seed_key TEXT PRIMARY KEY, completed_at INTEGER NOT NULL)").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS product_import_progress (seed_key TEXT PRIMARY KEY, next_index INTEGER NOT NULL)").run();
  const seedKey = "dofesh-distribution-category-40-2026-08-31-v1";
  if (await env.DB.prepare("SELECT seed_key FROM product_import_seeds WHERE seed_key=?").bind(seedKey).first()) return;
  const categoryIds = new Map<number, number>();
  for (const category of distributionCategoryTree) {
    const parentId = category.parentSourceId == null ? null : categoryIds.get(category.parentSourceId) || null;
    let existing = await env.DB.prepare("SELECT id FROM categories WHERE name=? LIMIT 1").bind(category.name).first<{id:number}>();
    if (!existing) {
      const now = Date.now();
      const categoryNumber = Number((await env.DB.prepare("SELECT COALESCE(MAX(category_number),1000)+1 AS next FROM categories").first<{next:number}>())?.next || 1001);
      const created = await env.DB.prepare("INSERT INTO categories (category_number,parent_id,name,slug,description,banner_url,icon_url,sort_order,active,created_at,updated_at) VALUES (?,?,?,?,NULL,NULL,NULL,0,1,?,?)")
        .bind(categoryNumber, parentId, category.name, slugify(`${category.name}-${category.sourceId}`), now, now).run();
      existing = { id: Number(created.meta.last_row_id) };
    } else {
      await env.DB.prepare("UPDATE categories SET parent_id=?,active=1,updated_at=? WHERE id=?").bind(parentId, Date.now(), existing.id).run();
    }
    categoryIds.set(category.sourceId, existing.id);
  }

  let nextItemNumber = Number((await env.DB.prepare("SELECT COALESCE(MAX(item_number),1000)+1 AS next FROM products").first<{next:number}>())?.next || 1001);
  const progress = await env.DB.prepare("SELECT next_index FROM product_import_progress WHERE seed_key=?").bind(seedKey).first<{next_index:number}>();
  const startIndex = Math.max(0, Number(progress?.next_index || 0));
  const endIndex = Math.min(importedDistributionProducts.length, startIndex + 4);
  for (let productIndex = startIndex; productIndex < endIndex; productIndex += 1) {
    const product = importedDistributionProducts[productIndex];
    const categoryId = categoryIds.get(product.categoryId);
    if (!categoryId) continue;
    const keyword = `dofesh-${product.id}`;
    const existing = await env.DB.prepare("SELECT product_id FROM product_keywords WHERE keyword=? LIMIT 1").bind(keyword).first<{product_id:number}>();
    const colorNote = product.colors.length ? `الألوان المتوفرة: ${product.colors.join("، ")}` : "";
    const description = [product.description, colorNote].filter(Boolean).join("\n");
    const now = Date.now();
    if (existing) {
      await env.DB.prepare("UPDATE products SET category_id=?,name=?,description=?,price_agorot=?,stock_quantity=100,active=1,updated_at=? WHERE id=?")
        .bind(categoryId, product.name, description || null, Math.round(product.price * 100), now, existing.product_id).run();
      await env.DB.prepare("UPDATE product_media SET alt_text=?,updated_at=? WHERE product_id=? AND media_type='image'").bind(product.name, now, existing.product_id).run();
      await env.DB.prepare("INSERT OR REPLACE INTO product_import_progress (seed_key,next_index) VALUES (?,?)").bind(seedKey, productIndex + 1).run();
      continue;
    }
    const created = await env.DB.prepare("INSERT INTO products (item_number,category_id,name,slug,description,specifications,price_agorot,wholesale_price_agorot,purchase_price_agorot,stock_quantity,active,featured,offer_price_agorot,view_count,order_count,rating_average_x100,rating_count,created_at,updated_at) VALUES (?,?,?,?,?,NULL,?,NULL,NULL,100,1,0,NULL,0,0,0,0,?,?)")
      .bind(nextItemNumber, categoryId, product.name, slugify(`${product.name}-${nextItemNumber}`), description || null, Math.round(product.price * 100), now, now).run();
    const productId = Number(created.meta.last_row_id);
    const extension = new URL(product.image).pathname.split(".").pop()?.toLowerCase() || "jpeg";
    await env.DB.batch([
      env.DB.prepare("INSERT INTO product_media (product_id,variant_id,media_type,url,alt_text,sort_order,is_primary,created_at,updated_at) VALUES (?,NULL,'image',?,?,0,1,?,?)").bind(productId, `/media/imports/dofesh-${product.id}.${extension}`, product.name, now, now),
      env.DB.prepare("INSERT INTO product_keywords (product_id,keyword) VALUES (?,?)").bind(productId, keyword),
    ]);
    const choices = product.sizes.length ? product.sizes : product.colors.map(value => ({ name: "color", value, price: product.price }));
    if (choices.length) {
      const optionName = product.sizes.length ? "المقاس / الكمية" : "اللون";
      const displayType = product.sizes.length ? "text" : "color";
      const option = await env.DB.prepare("INSERT INTO product_options (product_id,name,display_type,sort_order) VALUES (?,?,?,0)").bind(productId, optionName, displayType).run();
      for (let index = 0; index < choices.length; index += 1) {
        const choice = choices[index];
        const value = await env.DB.prepare("INSERT INTO product_option_values (option_id,value,color_hex,sort_order) VALUES (?,?,NULL,?)").bind(Number(option.meta.last_row_id), choice.value, index).run();
        const variantPrice = choice.price > 0 ? choice.price : product.price;
        const variant = await env.DB.prepare("INSERT INTO product_variants (product_id,sku,price_agorot,wholesale_price_agorot,stock_quantity,active,created_at,updated_at) VALUES (?,NULL,?,NULL,100,1,?,?)").bind(productId, Math.round(variantPrice * 100), now, now).run();
        await env.DB.prepare("INSERT INTO variant_option_values (variant_id,option_value_id) VALUES (?,?)").bind(Number(variant.meta.last_row_id), Number(value.meta.last_row_id)).run();
      }
    }
    nextItemNumber += 1;
    await env.DB.prepare("INSERT OR REPLACE INTO product_import_progress (seed_key,next_index) VALUES (?,?)").bind(seedKey, productIndex + 1).run();
  }
  if (endIndex >= importedDistributionProducts.length) {
    await env.DB.prepare("INSERT OR REPLACE INTO product_import_seeds (seed_key,completed_at) VALUES (?,?)").bind(seedKey, Date.now()).run();
    await env.DB.prepare("DELETE FROM product_import_progress WHERE seed_key=?").bind(seedKey).run();
  }
}

async function ensureCorrectedDistributionProductNames(env: Env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS product_import_seeds (seed_key TEXT PRIMARY KEY, completed_at INTEGER NOT NULL)").run();
  const seedKey = "dofesh-distribution-correct-names-2026-09-01-v1";
  if (await env.DB.prepare("SELECT seed_key FROM product_import_seeds WHERE seed_key=?").bind(seedKey).first()) return;
  const now = Date.now();
  const statements: D1PreparedStatement[] = [];
  for (const product of importedDistributionProducts) {
    const keyword = `dofesh-${product.id}`;
    statements.push(env.DB.prepare("UPDATE products SET name=?,updated_at=? WHERE id=(SELECT product_id FROM product_keywords WHERE keyword=? LIMIT 1)").bind(product.name, now, keyword));
    statements.push(env.DB.prepare("UPDATE product_media SET alt_text=?,updated_at=? WHERE product_id=(SELECT product_id FROM product_keywords WHERE keyword=? LIMIT 1) AND media_type='image'").bind(product.name, now, keyword));
  }
  for (let index = 0; index < statements.length; index += 50) await env.DB.batch(statements.slice(index, index + 50));
  await env.DB.prepare("INSERT OR REPLACE INTO product_import_seeds (seed_key,completed_at) VALUES (?,?)").bind(seedKey, Date.now()).run();
}

const unavailableSourceIds = new Set([1249,1248,1199,1198,1190,1184,1180,1148,1083,1051,1050,1009,908,907,901,897,896,882,878,859,833,827,821,784,775,750,748,738,718,707,654,639,628,606,605,604,597,588,586,564,557,545,544,540,532,529,512,506,488,478,468,463,462,442,426,422,382,381,380,358]);

async function ensureOrganizedFullCatalog(env: Env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS product_import_seeds (seed_key TEXT PRIMARY KEY, completed_at INTEGER NOT NULL)").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS product_import_progress (seed_key TEXT PRIMARY KEY, next_index INTEGER NOT NULL)").run();
  const seedKey = "dofesh-full-catalog-organized-2026-09-01-v1";
  if (await env.DB.prepare("SELECT seed_key FROM product_import_seeds WHERE seed_key=?").bind(seedKey).first()) return;
  const now = Date.now();
  let nextCategoryNumber = Number((await env.DB.prepare("SELECT COALESCE(MAX(category_number),1000)+1 AS next FROM categories").first<{next:number}>())?.next || 1001);
  const categoryIds = new Map<string, number>();
  const managedNames = organizedCategoryTree.flatMap(([mainName, children]) => [mainName, ...children]);
  const managedRows = await env.DB.prepare(`SELECT id,name FROM categories WHERE name IN (${managedNames.map(()=>"?").join(",")})`).bind(...managedNames).all<{id:number;name:string}>();
  for (const row of managedRows.results) categoryIds.set(row.name, Number(row.id));
  let sortOrder = 10;
  if (categoryIds.size < managedNames.length) for (const [mainName, children] of organizedCategoryTree) {
    let main = await env.DB.prepare("SELECT id FROM categories WHERE name=? LIMIT 1").bind(mainName).first<{id:number}>();
    if (!main) {
      const created = await env.DB.prepare("INSERT INTO categories (category_number,parent_id,name,slug,description,banner_url,icon_url,sort_order,active,created_at,updated_at) VALUES (?,NULL,?,?,NULL,NULL,NULL,1,1,?,?)")
        .bind(nextCategoryNumber++, mainName, slugify(mainName), now, now).run();
      main = { id: Number(created.meta.last_row_id) };
    }
    await env.DB.prepare("UPDATE categories SET parent_id=NULL,sort_order=?,active=1,updated_at=? WHERE id=?").bind(sortOrder, now, main.id).run();
    categoryIds.set(mainName, main.id);
    let childOrder = 1;
    for (const childName of children) {
      let child = await env.DB.prepare("SELECT id FROM categories WHERE name=? LIMIT 1").bind(childName).first<{id:number}>();
      if (!child) {
        const created = await env.DB.prepare("INSERT INTO categories (category_number,parent_id,name,slug,description,banner_url,icon_url,sort_order,active,created_at,updated_at) VALUES (?,?,?,?,NULL,NULL,NULL,?,1,?,?)")
          .bind(nextCategoryNumber++, main.id, childName, slugify(childName), childOrder, now, now).run();
        child = { id: Number(created.meta.last_row_id) };
      }
      await env.DB.prepare("UPDATE categories SET parent_id=?,sort_order=?,active=1,updated_at=? WHERE id=?").bind(main.id, childOrder++, now, child.id).run();
      categoryIds.set(childName, child.id);
    }
    sortOrder += 10;
  }

  const progress = await env.DB.prepare("SELECT next_index FROM product_import_progress WHERE seed_key=?").bind(seedKey).first<{next_index:number}>();
  const startIndex = Math.max(0, Number(progress?.next_index || 0));
  const endIndex = Math.min(importedAllProducts.length, startIndex + 60);
  let nextItemNumber = Number((await env.DB.prepare("SELECT COALESCE(MAX(item_number),1000)+1 AS next FROM products").first<{next:number}>())?.next || 1001);
  let nextProductId = Number((await env.DB.prepare("SELECT COALESCE(MAX(id),0)+1 AS next FROM products").first<{next:number}>())?.next || 1);
  const batchProducts = importedAllProducts.slice(startIndex, endIndex);
  const keywords = batchProducts.map(product => `dofesh-${product.id}`);
  const existingRows = keywords.length ? await env.DB.prepare(`SELECT product_id,keyword FROM product_keywords WHERE keyword IN (${keywords.map(()=>"?").join(",")})`).bind(...keywords).all<{product_id:number;keyword:string}>() : { results: [] };
  const existingByKeyword = new Map(existingRows.results.map(row => [row.keyword, Number(row.product_id)]));
  const productStatements: D1PreparedStatement[] = [];
  const relatedStatements: D1PreparedStatement[] = [];
  for (let index = startIndex; index < endIndex; index += 1) {
    const product = importedAllProducts[index];
    const keyword = `dofesh-${product.id}`;
    const categoryName = organizedCategoryFor(product.name);
    const categoryId = categoryIds.get(categoryName) || categoryIds.get("مستلزمات متنوعة");
    if (!categoryId) continue;
    const stock = unavailableSourceIds.has(product.id) ? 0 : 100;
    const existingProductId = existingByKeyword.get(keyword);
    if (existingProductId) {
      productStatements.push(env.DB.prepare("UPDATE products SET category_id=?,name=?,price_agorot=?,stock_quantity=?,active=1,updated_at=? WHERE id=?").bind(categoryId, product.name, Math.round(product.price * 100), stock, now, existingProductId));
      relatedStatements.push(env.DB.prepare("UPDATE product_media SET alt_text=?,updated_at=? WHERE product_id=? AND media_type='image'").bind(product.name, now, existingProductId));
    } else {
      const productId = nextProductId++;
      productStatements.push(env.DB.prepare("INSERT INTO products (id,item_number,category_id,name,slug,description,specifications,price_agorot,wholesale_price_agorot,purchase_price_agorot,stock_quantity,active,featured,offer_price_agorot,view_count,order_count,rating_average_x100,rating_count,created_at,updated_at) VALUES (?,?,?,?,?,NULL,NULL,?,NULL,NULL,?,1,0,NULL,0,0,0,0,?,?)")
        .bind(productId, nextItemNumber, categoryId, product.name, slugify(`${product.name}-${nextItemNumber}`), Math.round(product.price * 100), stock, now, now));
      const extension = new URL(product.image).pathname.split(".").pop()?.toLowerCase() || "jpeg";
      relatedStatements.push(env.DB.prepare("INSERT INTO product_media (product_id,variant_id,media_type,url,alt_text,sort_order,is_primary,created_at,updated_at) VALUES (?,NULL,'image',?,?,0,1,?,?)").bind(productId, `/media/imports/dofesh-${product.id}.${extension}`, product.name, now, now));
      relatedStatements.push(env.DB.prepare("INSERT INTO product_keywords (product_id,keyword) VALUES (?,?)").bind(productId, keyword));
      nextItemNumber += 1;
    }
  }
  for (let index = 0; index < productStatements.length; index += 50) await env.DB.batch(productStatements.slice(index, index + 50));
  for (let index = 0; index < relatedStatements.length; index += 50) await env.DB.batch(relatedStatements.slice(index, index + 50));
  await env.DB.prepare("INSERT OR REPLACE INTO product_import_progress (seed_key,next_index) VALUES (?,?)").bind(seedKey, endIndex).run();
  if (endIndex >= importedAllProducts.length) {
    const managedIds = [...categoryIds.values()];
    const legacy = await env.DB.prepare(`SELECT id,name FROM categories WHERE id NOT IN (${managedIds.map(()=>"?").join(",")})`).bind(...managedIds).all<{id:number;name:string}>();
    for (const old of legacy.results) {
      const targetName = organizedCategoryFor(old.name);
      const targetId = categoryIds.get(targetName);
      if (!targetId) continue;
      await env.DB.prepare("UPDATE products SET category_id=?,updated_at=? WHERE category_id=?").bind(targetId, now, old.id).run();
      await env.DB.prepare("UPDATE categories SET active=0,updated_at=? WHERE id=?").bind(now, old.id).run();
    }
    await env.DB.prepare("INSERT OR REPLACE INTO product_import_seeds (seed_key,completed_at) VALUES (?,?)").bind(seedKey, now).run();
    await env.DB.prepare("DELETE FROM product_import_progress WHERE seed_key=?").bind(seedKey).run();
  }
}

async function ensureCorrectedFullCatalogPrices(env: Env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS product_import_seeds (seed_key TEXT PRIMARY KEY, completed_at INTEGER NOT NULL)").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS product_import_progress (seed_key TEXT PRIMARY KEY, next_index INTEGER NOT NULL)").run();
  const seedKey = "dofesh-full-catalog-correct-prices-2026-09-01-v1";
  if (await env.DB.prepare("SELECT seed_key FROM product_import_seeds WHERE seed_key=?").bind(seedKey).first()) return;
  const progress = await env.DB.prepare("SELECT next_index FROM product_import_progress WHERE seed_key=?").bind(seedKey).first<{next_index:number}>();
  const startIndex = Math.max(0, Number(progress?.next_index || 0));
  const endIndex = Math.min(importedAllProducts.length, startIndex + 200);
  const now = Date.now();
  const statements = importedAllProducts.slice(startIndex, endIndex).map(product => env.DB.prepare("UPDATE products SET price_agorot=?,updated_at=? WHERE id=(SELECT product_id FROM product_keywords WHERE keyword=? LIMIT 1)")
    .bind(Math.round(product.price * 100), now, `dofesh-${product.id}`));
  for (let index = 0; index < statements.length; index += 50) await env.DB.batch(statements.slice(index, index + 50));
  await env.DB.prepare("INSERT OR REPLACE INTO product_import_progress (seed_key,next_index) VALUES (?,?)").bind(seedKey, endIndex).run();
  if (endIndex >= importedAllProducts.length) {
    await env.DB.prepare("INSERT OR REPLACE INTO product_import_seeds (seed_key,completed_at) VALUES (?,?)").bind(seedKey, now).run();
    await env.DB.prepare("DELETE FROM product_import_progress WHERE seed_key=?").bind(seedKey).run();
  }
}

const normalizedSupplierName = (value: string) => value
  .normalize("NFKC").toLowerCase().replace(/[إأآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي")
  .replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");

const jabariRetailAgorot = (sourcePrice: number) => {
  const retail = sourcePrice <= 30 ? sourcePrice + 2 : Math.ceil(sourcePrice * 1.1 * 2) / 2;
  return Math.round(retail * 100);
};

async function ensureImportedSupplierCatalog(env: Env) {
  const now = Date.now();
  await env.DB.prepare("INSERT OR IGNORE INTO suppliers (supplier_number,name,phone,address,notes,active,created_at,updated_at) VALUES (9101,'متجر دوفش',NULL,NULL,'مورد المنتجات المستوردة من dofesh.ps',1,?,?)").bind(now, now).run();
  await env.DB.prepare("INSERT OR IGNORE INTO suppliers (supplier_number,name,phone,address,notes,active,created_at,updated_at) VALUES (9102,'الجعبري للنثريات والإكسسوارات',NULL,NULL,'مورد المنتجات المستوردة من jabaristore.com',1,?,?)").bind(now, now).run();
  const dofesh = await env.DB.prepare("SELECT id FROM suppliers WHERE supplier_number=9101 LIMIT 1").first<{id:number}>();
  const jabari = await env.DB.prepare("SELECT id FROM suppliers WHERE supplier_number=9102 LIMIT 1").first<{id:number}>();
  if (!dofesh || !jabari) return;

  const dofeshSeed = "supplier-links-dofesh-2026-09-01-v1";
  if (!(await env.DB.prepare("SELECT seed_key FROM product_import_seeds WHERE seed_key=?").bind(dofeshSeed).first())) {
    const rows = await env.DB.prepare("SELECT p.id,p.price_agorot,k.keyword FROM products p JOIN product_keywords k ON k.product_id=p.id LEFT JOIN product_suppliers ps ON ps.product_id=p.id AND ps.supplier_id=? WHERE k.keyword LIKE 'dofesh-%' AND ps.id IS NULL ORDER BY p.id LIMIT 250").bind(dofesh.id).all<{id:number;price_agorot:number;keyword:string}>();
    const missing = rows.results;
    if (missing.length) {
      await env.DB.batch(missing.map(row => env.DB.prepare("INSERT INTO product_suppliers (product_id,supplier_id,source_product_id,source_url,supplier_price_agorot,preferred,created_at,updated_at) VALUES (?,?,?,?,?,1,?,?) ON CONFLICT(product_id,supplier_id) DO UPDATE SET source_product_id=excluded.source_product_id,source_url=excluded.source_url,supplier_price_agorot=excluded.supplier_price_agorot,updated_at=excluded.updated_at")
        .bind(Number(row.id), dofesh.id, String(row.keyword).slice(7), `https://dofesh.ps/?app=product.show.${String(row.keyword).slice(7)}`, Number(row.price_agorot), now, now)));
    }
    const remaining = await env.DB.prepare("SELECT COUNT(*) AS count FROM products p JOIN product_keywords k ON k.product_id=p.id LEFT JOIN product_suppliers ps ON ps.product_id=p.id AND ps.supplier_id=? WHERE k.keyword LIKE 'dofesh-%' AND ps.id IS NULL").bind(dofesh.id).first<{count:number}>();
    if (!Number(remaining?.count || 0)) await env.DB.prepare("INSERT OR REPLACE INTO product_import_seeds (seed_key,completed_at) VALUES (?,?)").bind(dofeshSeed, now).run();
  }

  const seedKey = "jabari-full-catalog-2026-09-01-v1";
  if (await env.DB.prepare("SELECT seed_key FROM product_import_seeds WHERE seed_key=?").bind(seedKey).first()) return;
  const progress = await env.DB.prepare("SELECT next_index FROM product_import_progress WHERE seed_key=?").bind(seedKey).first<{next_index:number}>();
  const startIndex = Math.max(0, Number(progress?.next_index || 0));
  const endIndex = Math.min(importedJabariProducts.length, startIndex + 80);
  const batch = importedJabariProducts.slice(startIndex, endIndex);
  const sourceKeywords = batch.map(product => `jabari-${product.sourceId}`);
  const existingSourceRows = sourceKeywords.length ? await env.DB.prepare(`SELECT product_id,keyword FROM product_keywords WHERE keyword IN (${sourceKeywords.map(()=>"?").join(",")})`).bind(...sourceKeywords).all<{product_id:number;keyword:string}>() : {results:[]};
  const existingBySource = new Map(existingSourceRows.results.map(row => [row.keyword, Number(row.product_id)]));
  const dofeshRows = await env.DB.prepare("SELECT p.id,p.name,p.price_agorot FROM products p JOIN product_keywords k ON k.product_id=p.id LEFT JOIN product_suppliers ps ON ps.product_id=p.id AND ps.supplier_id=? WHERE k.keyword LIKE 'dofesh-%' AND p.deleted_at IS NULL AND ps.id IS NULL").bind(jabari.id).all<{id:number;name:string;price_agorot:number}>();
  const exactDofesh = new Map<string, number>();
  for (const row of dofeshRows.results) exactDofesh.set(`${normalizedSupplierName(row.name)}|${Number(row.price_agorot)}`, Number(row.id));
  let nextItemNumber = Number((await env.DB.prepare("SELECT COALESCE(MAX(item_number),1000)+1 AS next FROM products").first<{next:number}>())?.next || 1001);
  let nextProductId = Number((await env.DB.prepare("SELECT COALESCE(MAX(id),0)+1 AS next FROM products").first<{next:number}>())?.next || 1);
  const productStatements: D1PreparedStatement[] = [];
  const relatedStatements: D1PreparedStatement[] = [];
  for (const product of batch) {
    const keyword = `jabari-${product.sourceId}`;
    const sourceAgorot = Math.round(Number(product.sourcePrice) * 100);
    const retailAgorot = jabariRetailAgorot(Number(product.sourcePrice));
    const duplicateKey = `${normalizedSupplierName(product.name)}|${sourceAgorot}`;
    let productId = existingBySource.get(keyword) || exactDofesh.get(duplicateKey);
    if (!existingBySource.has(keyword) && productId) exactDofesh.delete(duplicateKey);
    if (productId) {
      productStatements.push(env.DB.prepare("UPDATE products SET purchase_price_agorot=CASE WHEN purchase_price_agorot IS NULL OR purchase_price_agorot>? THEN ? ELSE purchase_price_agorot END,price_agorot=CASE WHEN price_agorot>? THEN ? ELSE price_agorot END,updated_at=? WHERE id=?").bind(sourceAgorot, sourceAgorot, retailAgorot, retailAgorot, now, productId));
      relatedStatements.push(env.DB.prepare("INSERT OR IGNORE INTO product_keywords (product_id,keyword) VALUES (?,?)").bind(productId, keyword));
    } else {
      const categoryName = organizedCategoryFor(product.name);
      const category = await env.DB.prepare("SELECT id FROM categories WHERE name=? LIMIT 1").bind(categoryName).first<{id:number}>();
      if (!category) continue;
      productId = nextProductId++;
      productStatements.push(env.DB.prepare("INSERT INTO products (id,item_number,category_id,name,slug,description,specifications,price_agorot,wholesale_price_agorot,purchase_price_agorot,stock_quantity,active,featured,offer_price_agorot,view_count,order_count,rating_average_x100,rating_count,created_at,updated_at) VALUES (?,?,?,?,?,NULL,NULL,?,NULL,?,100,1,0,NULL,0,0,0,0,?,?)")
        .bind(productId, nextItemNumber, category.id, product.name, slugify(`${product.name}-${nextItemNumber}`), retailAgorot, sourceAgorot, now, now));
      const extension = new URL(product.imageUrl).pathname.split(".").pop()?.toLowerCase() || "jpeg";
      relatedStatements.push(env.DB.prepare("INSERT INTO product_media (product_id,variant_id,media_type,url,alt_text,sort_order,is_primary,created_at,updated_at) VALUES (?,NULL,'image',?,?,0,1,?,?)").bind(productId, `/media/imports/jabari-${product.sourceId}.${extension}`, product.name, now, now));
      relatedStatements.push(env.DB.prepare("INSERT INTO product_keywords (product_id,keyword) VALUES (?,?)").bind(productId, keyword));
      nextItemNumber += 1;
    }
    relatedStatements.push(env.DB.prepare("INSERT INTO product_suppliers (product_id,supplier_id,source_product_id,source_url,supplier_price_agorot,preferred,created_at,updated_at) VALUES (?,?,?,?,?,1,?,?) ON CONFLICT(product_id,supplier_id) DO UPDATE SET source_product_id=excluded.source_product_id,source_url=excluded.source_url,supplier_price_agorot=excluded.supplier_price_agorot,updated_at=excluded.updated_at")
      .bind(productId, jabari.id, String(product.sourceId), product.sourceUrl, sourceAgorot, now, now));
  }
  for (let index = 0; index < productStatements.length; index += 40) await env.DB.batch(productStatements.slice(index, index + 40));
  for (let index = 0; index < relatedStatements.length; index += 40) await env.DB.batch(relatedStatements.slice(index, index + 40));
  await env.DB.prepare("INSERT OR REPLACE INTO product_import_progress (seed_key,next_index) VALUES (?,?)").bind(seedKey, endIndex).run();
  if (endIndex >= importedJabariProducts.length) {
    await env.DB.prepare("INSERT OR REPLACE INTO product_import_seeds (seed_key,completed_at) VALUES (?,?)").bind(seedKey, now).run();
    await env.DB.prepare("DELETE FROM product_import_progress WHERE seed_key=?").bind(seedKey).run();
  }
}

async function ensureImportedSourceVariants(env: Env) {
  const sources = [
    { name: "dofesh", rows: importedDofeshVariants, markup: false },
    { name: "jabari", rows: importedJabariVariants, markup: true },
  ] as const;
  for (const source of sources) {
    const rows = source.rows.filter(record => Object.values(record.groups || {}).some(group => group.length));
    const seedKey = `${source.name}-product-variants-${rows.length}-v1`;
    if (await env.DB.prepare("SELECT seed_key FROM product_import_seeds WHERE seed_key=?").bind(seedKey).first()) continue;
    const progress = await env.DB.prepare("SELECT next_index FROM product_import_progress WHERE seed_key=?").bind(seedKey).first<{next_index:number}>();
    const startIndex = Math.max(0, Number(progress?.next_index || 0));
    const endIndex = Math.min(rows.length, startIndex + 25);
    const now = Date.now();
    for (const record of rows.slice(startIndex, endIndex)) {
      const product = await env.DB.prepare("SELECT product_id FROM product_keywords WHERE keyword=? LIMIT 1").bind(`${source.name}-${record.sourceId}`).first<{product_id:number}>();
      if (!product) continue;
      const groups = Object.entries(record.groups || {}).filter(([,values]) => values.length);
      if (!groups.length) continue;
      await env.DB.batch([
        env.DB.prepare("DELETE FROM product_options WHERE product_id=?").bind(product.product_id),
        env.DB.prepare("DELETE FROM product_variants WHERE product_id=?").bind(product.product_id),
        env.DB.prepare("DELETE FROM product_media WHERE product_id=? AND variant_id IS NOT NULL").bind(product.product_id),
      ]);
      const optionLabel = groups[0][0] === "size" ? "القياس" : groups[0][0] === "color" ? "الخيار" : "الخيار";
      const optionResult = await env.DB.prepare("INSERT INTO product_options (product_id,name,display_type,sort_order) VALUES (?,?,'text',0)").bind(product.product_id, optionLabel).run();
      const optionId = Number(optionResult.meta.last_row_id);
      const flattened = groups.flatMap(([groupName, values]) => values.filter(value => !value.disabled).map(value => ({...value, groupName})));
      for (let index = 0; index < flattened.length; index += 1) {
        const variant = flattened[index];
        const displayName = groups.length > 1 ? `${variant.groupName}: ${variant.name}` : variant.name;
        const sourcePrice = Number(variant.oldSourcePrice || variant.sourcePrice);
        const retailPrice = source.markup ? jabariRetailAgorot(sourcePrice) : Math.round(sourcePrice * 100);
        const valueResult = await env.DB.prepare("INSERT INTO product_option_values (option_id,value,color_hex,sort_order) VALUES (?,?,NULL,?)").bind(optionId, displayName, index).run();
        const variantResult = await env.DB.prepare("INSERT INTO product_variants (product_id,sku,price_agorot,wholesale_price_agorot,purchase_price_agorot,stock_quantity,active,created_at,updated_at) VALUES (?,NULL,?,NULL,?,100,1,?,?)").bind(product.product_id, retailPrice, Math.round(sourcePrice * 100), now, now).run();
        const variantId = Number(variantResult.meta.last_row_id);
        await env.DB.prepare("INSERT INTO variant_option_values (variant_id,option_value_id) VALUES (?,?)").bind(variantId, Number(valueResult.meta.last_row_id)).run();
        if (variant.imageUrl) {
          const absolute = new URL(variant.imageUrl, source.name === "jabari" ? "https://jabaristore.com/" : "https://dofesh.ps/").toString();
          const extension = new URL(absolute).pathname.split(".").pop()?.toLowerCase() || "jpeg";
          const groupOffset = groups.slice(0, groups.findIndex(([name]) => name === variant.groupName)).reduce((sum,[,values]) => sum + values.length, 0);
          const mediaIndex = groupOffset + groups.find(([,values]) => values.some(value => value.name === variant.name))![1].findIndex(value => value.name === variant.name);
          await env.DB.prepare("INSERT INTO product_media (product_id,variant_id,media_type,url,alt_text,sort_order,is_primary,created_at,updated_at) VALUES (?,?,'image',?,?,0,1,?,?)").bind(product.product_id, variantId, `/media/imports/${source.name}-${record.sourceId}-variant-${mediaIndex}.${extension}`, displayName, now, now).run();
        }
      }
      await env.DB.prepare("UPDATE products SET stock_quantity=0,price_agorot=?,purchase_price_agorot=?,updated_at=? WHERE id=?").bind(Math.min(...flattened.map(variant => source.markup ? jabariRetailAgorot(Number(variant.oldSourcePrice || variant.sourcePrice)) : Math.round(Number(variant.oldSourcePrice || variant.sourcePrice) * 100))), Math.min(...flattened.map(variant => Math.round(Number(variant.oldSourcePrice || variant.sourcePrice) * 100))), now, product.product_id).run();
    }
    await env.DB.prepare("INSERT OR REPLACE INTO product_import_progress (seed_key,next_index) VALUES (?,?)").bind(seedKey, endIndex).run();
    if (endIndex >= rows.length) {
      await env.DB.prepare("INSERT OR REPLACE INTO product_import_seeds (seed_key,completed_at) VALUES (?,?)").bind(seedKey, Date.now()).run();
      await env.DB.prepare("DELETE FROM product_import_progress WHERE seed_key=?").bind(seedKey).run();
    }
  }
}

async function ensureProduct2222EditedImage(env: Env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS product_import_seeds (seed_key TEXT PRIMARY KEY, completed_at INTEGER NOT NULL)").run();
  const seedKey = "product-2222-edited-image-2026-09-01-v1";
  if (await env.DB.prepare("SELECT seed_key FROM product_import_seeds WHERE seed_key=?").bind(seedKey).first()) return;
  const product = await env.DB.prepare("SELECT id FROM products WHERE item_number=2222 AND deleted_at IS NULL LIMIT 1").first<{id:number}>();
  if (!product) return;
  const now = Date.now();
  await env.DB.prepare("UPDATE product_media SET url=?,alt_text=?,updated_at=? WHERE product_id=? AND media_type='image'")
    .bind("/product-images/product-2222-edited.webp", "مراية قلاب مدور حديد", now, product.id).run();
  await env.DB.prepare("INSERT OR REPLACE INTO product_import_seeds (seed_key,completed_at) VALUES (?,?)").bind(seedKey, now).run();
}

type StorePolicyRecord={version:number;receiving:string;shipping:string;cancellation:string;exchange:string;updatedAt:number};
const defaultStorePolicies={
  receiving:"يستقبل المتجر الطلبات إلكترونياً على مدار الساعة. تسجيل الطلب لا يعني تأكيده نهائياً؛ يعتمد الطلب بعد مراجعة البيانات وتوفر المنتجات. يحق للمتجر التواصل مع الزبون للتأكيد أو طلب معلومات إضافية، ويمكن تعليق الطلب أو إلغاؤه إذا تعذر التواصل أو كانت البيانات ناقصة. إذا نفد منتج بعد تسجيل الطلب، يتم التواصل لاختيار بديل أو حذف المنتج غير المتوفر.",
  shipping:"تستغرق مدة التوصيل عادةً من يوم إلى يومين، وقد تستغرق وقتاً إضافياً حسب ضغط الطلبات أو المنطقة أو الظروف الجوية وشركة الشحن. أسعار التوصيل الأساسية: الضفة الغربية 20 شيكل، القدس 30 شيكل، والداخل 70 شيكل. قد تضاف رسوم موضحة مسبقاً للطلبات كبيرة الحجم أو التي تحتاج ترتيبات خاصة. الزبون مسؤول عن صحة رقم الهاتف والعنوان.",
  cancellation:"يمكن إلغاء الطلب ما دام لم يخرج للتوصيل. بعد خروجه لا يمكن إلغاؤه أو رفض استلامه، وفي حال رفض الاستلام أو تعذر التسليم بسبب الزبون يبقى ملزماً بدفع رسوم التوصيل. الطلبات المخصصة أو المصنوعة حسب الطلب لا يمكن إلغاؤها بعد بدء تجهيزها.",
  exchange:"يمكن طلب الاستبدال خلال يوم واحد من الاستلام بشرط أن يكون المنتج غير مستخدم وبحالته الأصلية مع كامل ملحقاته وتغليفه. لا يوجد استرجاع نقدي. المنتجات المخصصة أو المكتوب عليها أسماء أو عبارات لا تستبدل إلا إذا وصلت خاطئة أو متضررة. يتحمل الزبون تكلفة الاستبدال عند تغيير رأيه، ويتحمل المتجر التكلفة عند الخطأ أو الضرر. يجب فحص الطلب فور استلامه والإبلاغ عن الكسر أو التلف أو النقص خلال ساعتين مع صور واضحة؛ بعد ساعتين لا تقبل بلاغات الضرر الظاهر."
};
let storePoliciesReady:Promise<void>|null=null;
async function ensureStorePoliciesSchema(env:Env){
  if(!storePoliciesReady)storePoliciesReady=(async()=>{
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS store_policies (id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL DEFAULT 1,receiving TEXT NOT NULL,shipping TEXT NOT NULL,cancellation TEXT NOT NULL,exchange_policy TEXT NOT NULL,updated_at INTEGER NOT NULL)").run();
    await env.DB.prepare("INSERT OR IGNORE INTO store_policies (id,version,receiving,shipping,cancellation,exchange_policy,updated_at) VALUES (1,1,?,?,?,?,?)").bind(defaultStorePolicies.receiving,defaultStorePolicies.shipping,defaultStorePolicies.cancellation,defaultStorePolicies.exchange,Date.now()).run();
  })().catch(error=>{storePoliciesReady=null;throw error});
  return storePoliciesReady;
}
let orderPolicyColumnsReady:Promise<void>|null=null;
async function ensureOrderPolicyColumns(env:Env){
  if(!orderPolicyColumnsReady)orderPolicyColumnsReady=(async()=>{
    const columns=await env.DB.prepare("PRAGMA table_info(orders)").all(),names=new Set((columns.results as Array<Record<string,unknown>>).map(row=>String(row.name)));
    if(!names.has("accepted_policy_version"))await env.DB.prepare("ALTER TABLE orders ADD COLUMN accepted_policy_version INTEGER").run();
    if(!names.has("policy_accepted_at"))await env.DB.prepare("ALTER TABLE orders ADD COLUMN policy_accepted_at INTEGER").run();
  })().catch(error=>{orderPolicyColumnsReady=null;throw error});
  return orderPolicyColumnsReady;
}
async function readPolicies(env:Env):Promise<StorePolicyRecord>{
  await ensureStorePoliciesSchema(env);
  const row=await env.DB.prepare("SELECT version,receiving,shipping,cancellation,exchange_policy,updated_at FROM store_policies WHERE id=1").first<Record<string,unknown>>();
  return {version:Number(row?.version||1),receiving:String(row?.receiving||defaultStorePolicies.receiving),shipping:String(row?.shipping||defaultStorePolicies.shipping),cancellation:String(row?.cancellation||defaultStorePolicies.cancellation),exchange:String(row?.exchange_policy||defaultStorePolicies.exchange),updatedAt:Number(row?.updated_at||Date.now())};
}
async function savePolicies(request:Request,env:Env){
  await ensureStorePoliciesSchema(env);
  const body=await parseJson(request),receiving=asText(body.receiving),shipping=asText(body.shipping),cancellation=asText(body.cancellation),exchange=asText(body.exchange);
  if(!receiving||!shipping||!cancellation||!exchange)return json({error:"نص الأقسام الأربعة مطلوب"},{status:400});
  if([receiving,shipping,cancellation,exchange].some(value=>value.length>12000))return json({error:"نص السياسة طويل جداً"},{status:400});
  await env.DB.prepare("UPDATE store_policies SET version=version+1,receiving=?,shipping=?,cancellation=?,exchange_policy=?,updated_at=? WHERE id=1").bind(receiving,shipping,cancellation,exchange,Date.now()).run();
  return json({ok:true,policies:await readPolicies(env)});
}

async function readStorefront(env: Env) {
  const [row, slides, popup, highlightData] = await Promise.all([
    env.DB.prepare("SELECT * FROM store_settings WHERE id=1").first<Record<string, unknown>>(),
    env.DB.prepare("SELECT id,title,image_url,product_id,category_id,external_url,sort_order,active FROM sliders ORDER BY sort_order,id").all(),
    env.DB.prepare("SELECT id,title,body,image_url,target_url,active FROM popups ORDER BY id DESC LIMIT 1").first<Record<string,unknown>>(),
    readHighlights(env),
  ]);
  const settings = { metaPixelId:String(row?.meta_pixel_id??"1231904457865622"),metaPixelEnabled:Boolean(row?.meta_pixel_enabled??1),storeName:String(row?.store_name||"منار بارتي ستور | Manar Party Store"),siteNameAr:String(row?.site_name_ar||"منار بارتي ستور"),siteNameEn:String(row?.site_name_en||"Manar Party Store"),seoDescription:String(row?.seo_description||"قطع وإكسسوارات التوزيعات بالجملة والتجزئة"),faviconUrl:String(row?.favicon_url||row?.logo_url||""),logoUrl:String(row?.logo_url||""),watermarkUrl:String(row?.watermark_url||""),watermarkOpacity:Math.min(100,Math.max(0,Number(row?.watermark_opacity??25))),watermarkEnabled:Boolean(row?.watermark_enabled??1),watermarkX:Math.min(98,Math.max(2,Number(row?.watermark_x??90))),watermarkY:Math.min(98,Math.max(2,Number(row?.watermark_y??90))),watermarkSize:Math.min(60,Math.max(2,Number(row?.watermark_size??24))),primaryColor:String(row?.primary_color||"#b85f7d"),secondaryColor:String(row?.secondary_color||"#f8e8ef"),backgroundColor:String(row?.background_color||"#ffffff"),currency:String(row?.currency||"ILS"),whatsapp:String(row?.whatsapp||""),whatsappEnabled:Boolean(row?.whatsapp_enabled??1),facebookUrl:String(row?.facebook_url||""),facebookEnabled:Boolean(row?.facebook_enabled??1),instagramUrl:String(row?.instagram_url||""),instagramEnabled:Boolean(row?.instagram_enabled??1),tiktokUrl:String(row?.tiktok_url||""),tiktokEnabled:Boolean(row?.tiktok_enabled??1),sliderEnabled:Boolean(row?.slider_enabled??1),sliderIntervalMs:Number(row?.slider_interval_ms||5000),showOutOfStock:Boolean(row?.show_out_of_stock??1),popupEnabled:Boolean(row?.popup_enabled??0),showOffers:Boolean(row?.show_offers??1),showMostOrdered:Boolean(row?.show_most_ordered??0),showTopRated:Boolean(row?.show_top_rated??0),showNewest:Boolean(row?.show_newest??1),showFeatured:Boolean(row?.show_featured??1),homeProductsLimit:Math.min(24,Math.max(1,Number(row?.home_products_limit||6))),showSubcategoryProductsInParent:Boolean(row?.show_subcategory_products_in_parent??1)};
  return {settings,highlightsEnabled:highlightData.enabled,highlightsIntervalMs:highlightData.intervalMs,highlights:highlightData.highlights,sliders:(slides.results as Array<Record<string,unknown>>).map(item=>({id:Number(item.id),title:String(item.title||""),imageUrl:String(item.image_url),productId:item.product_id==null?null:Number(item.product_id),categoryId:item.category_id==null?null:Number(item.category_id),externalUrl:String(item.external_url||""),sortOrder:Number(item.sort_order),active:Boolean(item.active)})),popup:popup?{id:Number(popup.id),title:String(popup.title||""),body:String(popup.body||""),imageUrl:String(popup.image_url||""),targetUrl:String(popup.target_url||""),active:Boolean(popup.active)}:null};
}

async function saveSettings(request:Request,env:Env){
  await ensureStorefrontColumns(env);
  const body=await parseJson(request),now=Date.now(),interval=Math.min(20000,Math.max(2000,Number(body.sliderIntervalMs)||5000));
  const limit=Math.min(24,Math.max(1,Number(body.homeProductsLimit)||6));
  const metaPixelId=body.metaPixelId===undefined?undefined:asText(body.metaPixelId).trim();
  if(metaPixelId&& !/^\d{5,30}$/.test(metaPixelId))return json({error:"رقم Meta Pixel يجب أن يحتوي على أرقام فقط (5–30 رقمًا)"},{status:400});
  await env.DB.prepare(`INSERT INTO store_settings (id,store_name,logo_url,watermark_url,watermark_opacity,primary_color,secondary_color,background_color,currency,whatsapp,whatsapp_enabled,facebook_url,facebook_enabled,instagram_url,instagram_enabled,tiktok_url,tiktok_enabled,slider_enabled,slider_interval_ms,show_out_of_stock,popup_enabled,show_offers,show_most_ordered,show_top_rated,show_newest,show_featured,home_products_limit,show_subcategory_products_in_parent,created_at,updated_at) VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET store_name=excluded.store_name,logo_url=excluded.logo_url,watermark_url=excluded.watermark_url,watermark_opacity=excluded.watermark_opacity,primary_color=excluded.primary_color,secondary_color=excluded.secondary_color,background_color=excluded.background_color,whatsapp=excluded.whatsapp,whatsapp_enabled=excluded.whatsapp_enabled,facebook_url=excluded.facebook_url,facebook_enabled=excluded.facebook_enabled,instagram_url=excluded.instagram_url,instagram_enabled=excluded.instagram_enabled,tiktok_url=excluded.tiktok_url,tiktok_enabled=excluded.tiktok_enabled,slider_enabled=excluded.slider_enabled,slider_interval_ms=excluded.slider_interval_ms,show_out_of_stock=excluded.show_out_of_stock,popup_enabled=excluded.popup_enabled,show_offers=excluded.show_offers,show_most_ordered=excluded.show_most_ordered,show_top_rated=excluded.show_top_rated,show_newest=excluded.show_newest,show_featured=excluded.show_featured,home_products_limit=excluded.home_products_limit,show_subcategory_products_in_parent=excluded.show_subcategory_products_in_parent,updated_at=excluded.updated_at`).bind(asText(body.storeName)||"Manar Store",asOptionalText(body.logoUrl),asOptionalText(body.watermarkUrl),Math.min(100,Math.max(0,Number(body.watermarkOpacity??25))),validColor(body.primaryColor,"#b85f7d"),validColor(body.secondaryColor,"#f8e8ef"),validColor(body.backgroundColor,"#ffffff"),"ILS",asOptionalText(body.whatsapp),asBoolean(body.whatsappEnabled)?1:0,safeUrl(body.facebookUrl),asBoolean(body.facebookEnabled)?1:0,safeUrl(body.instagramUrl),asBoolean(body.instagramEnabled)?1:0,safeUrl(body.tiktokUrl),asBoolean(body.tiktokEnabled)?1:0,asBoolean(body.sliderEnabled)?1:0,interval,asBoolean(body.showOutOfStock)?1:0,asBoolean(body.popupEnabled)?1:0,asBoolean(body.showOffers)?1:0,asBoolean(body.showMostOrdered)?1:0,asBoolean(body.showTopRated)?1:0,asBoolean(body.showNewest)?1:0,asBoolean(body.showFeatured)?1:0,limit,asBoolean(body.showSubcategoryProductsInParent)?1:0,now,now).run();
  await env.DB.prepare("UPDATE store_settings SET watermark_enabled=?,watermark_x=?,watermark_y=?,watermark_size=? WHERE id=1").bind(asBoolean(body.watermarkEnabled)?1:0,Math.min(98,Math.max(2,Number(body.watermarkX)||90)),Math.min(98,Math.max(2,Number(body.watermarkY)||90)),Math.min(60,Math.max(2,Number(body.watermarkSize)||24))).run();
  await env.DB.prepare("UPDATE store_settings SET site_name_ar=?,site_name_en=?,seo_description=?,favicon_url=? WHERE id=1").bind((asText(body.siteNameAr)||"منار بارتي ستور").slice(0,60),(asText(body.siteNameEn)||"Manar Party Store").slice(0,60),(asText(body.seoDescription)||"قطع وإكسسوارات التوزيعات بالجملة والتجزئة").slice(0,170),asOptionalText(body.faviconUrl)).run();
  if(metaPixelId!==undefined)await env.DB.prepare("UPDATE store_settings SET meta_pixel_id=? WHERE id=1").bind(metaPixelId).run();
  if(body.metaPixelEnabled!==undefined)await env.DB.prepare("UPDATE store_settings SET meta_pixel_enabled=? WHERE id=1").bind(asBoolean(body.metaPixelEnabled)?1:0).run();
  return json({ok:true});
}

async function saveSlide(request:Request,env:Env,id?:number){const body=await parseJson(request),image=asText(body.imageUrl);if(!image)return json({error:"صورة الشريحة مطلوبة"},{status:400});const values=[asOptionalText(body.title),image,body.productId?Number(body.productId):null,body.categoryId?Number(body.categoryId):null,safeUrl(body.externalUrl),Number(body.sortOrder||0),asBoolean(body.active)?1:0,Date.now()];if(id)await env.DB.prepare("UPDATE sliders SET title=?,image_url=?,product_id=?,category_id=?,external_url=?,sort_order=?,active=?,updated_at=? WHERE id=?").bind(...values,id).run();else await env.DB.prepare("INSERT INTO sliders (title,image_url,product_id,category_id,external_url,sort_order,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(...values,Date.now()).run();return json({ok:true});}
async function savePopup(request:Request,env:Env){const body=await parseJson(request),now=Date.now(),current=await env.DB.prepare("SELECT id FROM popups ORDER BY id DESC LIMIT 1").first<{id:number}>(),values=[asOptionalText(body.title),asOptionalText(body.body),asOptionalText(body.imageUrl),safeTarget(body.targetUrl),asBoolean(body.active)?1:0,now];if(current)await env.DB.prepare("UPDATE popups SET title=?,body=?,image_url=?,target_url=?,active=?,updated_at=? WHERE id=?").bind(...values,current.id).run();else await env.DB.prepare("INSERT INTO popups (title,body,image_url,target_url,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").bind(...values,now).run();return json({ok:true});}


const SESSION_COOKIE="manar_customer_session";
const SESSION_MAX_AGE=400*24*60*60;
const ACCOUNT_EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function hex(bytes:Uint8Array){return Array.from(bytes,byte=>byte.toString(16).padStart(2,"0")).join("")}
function randomHex(length:number){return hex(crypto.getRandomValues(new Uint8Array(length)))}
async function sha256(value:string){return hex(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value))))}
async function passwordHash(password:string,salt:string){
  const digest=await new Promise<Buffer>((resolve,reject)=>{
    nodeScrypt(password,Buffer.from(salt,"hex"),32,{N:16384,r:8,p:1,maxmem:64*1024*1024},(error,key)=>error?reject(error):resolve(key));
  });
  return "scrypt$"+digest.toString("hex");
}
async function passwordMatches(password:string,salt:string,storedHash:string){
  if(storedHash.startsWith("scrypt$"))return equalHash(await passwordHash(password,salt),storedHash);
  // Accounts created with the earlier PBKDF2 code remain readable.
  const digest=await new Promise<Buffer>((resolve,reject)=>{
    nodePbkdf2(password,salt,150000,32,"sha256",(error,key)=>error?reject(error):resolve(key));
  });
  return equalHash(digest.toString("hex"),storedHash);
}
function equalHash(left:string,right:string){if(left.length!==right.length)return false;let difference=0;for(let i=0;i<left.length;i++)difference|=left.charCodeAt(i)^right.charCodeAt(i);return difference===0}
let customerSchemaReady:Promise<void>|null=null;
async function ensureCustomerAuthSchema(env:Env){
  if(!customerSchemaReady)customerSchemaReady=initializeCustomerAuthSchema(env).catch(error=>{customerSchemaReady=null;throw error});
  await customerSchemaReady;
}
async function initializeCustomerAuthSchema(env:Env){
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS customer_accounts (id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,password_salt TEXT NOT NULL,name TEXT NOT NULL,phone TEXT NOT NULL DEFAULT '',city TEXT NOT NULL DEFAULT '',address TEXT NOT NULL DEFAULT '',created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS customer_sessions (id INTEGER PRIMARY KEY AUTOINCREMENT,account_id INTEGER NOT NULL,token_hash TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL,last_seen_at INTEGER NOT NULL,revoked_at INTEGER)").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_customer_sessions_account ON customer_sessions(account_id)").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS customer_auth_limits (key TEXT PRIMARY KEY,attempts INTEGER NOT NULL,window_start INTEGER NOT NULL)").run();
  const shippingZoneColumns=await env.DB.prepare("PRAGMA table_info(shipping_zones)").all<{name:string}>();
  if(shippingZoneColumns.results.length&&!shippingZoneColumns.results.some(column=>column.name==="code")){
    const legacyBase="shipping_zones_legacy_20260923";
    const firstBackup=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").bind(legacyBase).first();
    const secondBackup=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").bind(legacyBase+"_2").first();
    const backupName=!firstBackup?legacyBase:!secondBackup?legacyBase+"_2":legacyBase+"_3";
    await env.DB.prepare("ALTER TABLE shipping_zones RENAME TO "+backupName).run();
  }
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS shipping_zones (code TEXT PRIMARY KEY,label TEXT NOT NULL,price_agorot INTEGER NOT NULL,active INTEGER NOT NULL DEFAULT 1,sort_order INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL)").run();
  const zoneNow=Date.now();
  await env.DB.prepare("INSERT OR IGNORE INTO shipping_zones (code,label,price_agorot,active,sort_order,updated_at) VALUES ('west_bank','الضفة الغربية',2000,1,0,?),('jerusalem','القدس',3000,1,1,?),('inside','الداخل',7000,1,2,?)").bind(zoneNow,zoneNow,zoneNow).run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS customer_addresses (id INTEGER PRIMARY KEY AUTOINCREMENT,account_id INTEGER NOT NULL,label TEXT NOT NULL,recipient_name TEXT NOT NULL,phone TEXT NOT NULL,city TEXT NOT NULL,address TEXT NOT NULL,shipping_zone TEXT NOT NULL,is_default INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,FOREIGN KEY(account_id) REFERENCES customer_accounts(id) ON DELETE CASCADE)").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_customer_addresses_account ON customer_addresses(account_id)").run();
  const columns=await env.DB.prepare("PRAGMA table_info(orders)").all<{name:string}>();
  if(!columns.results.some(row=>row.name==="customer_account_id"))await env.DB.prepare("ALTER TABLE orders ADD COLUMN customer_account_id INTEGER").run();
}
function customerCookie(token:string,maxAge=SESSION_MAX_AGE){return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`}
function requestCookie(request:Request){
  const raw=request.headers.get("cookie")||"";
  const token=raw.split(";").map(part=>part.trim()).find(part=>part.startsWith(SESSION_COOKIE+"="))?.slice(SESSION_COOKIE.length+1)||"";
  return /^[a-f0-9]{64}$/.test(token)?token:"";
}
type CustomerAccount={id:number;email:string;name:string;phone:string;city:string;address:string};
async function getCustomerAccount(request:Request,env:Env):Promise<CustomerAccount|null>{
  if(env.APP_SURFACE==="admin")return null;
  const token=requestCookie(request);if(!token)return null;
  return env.DB.prepare("SELECT a.id,a.email,a.name,a.phone,a.city,a.address FROM customer_sessions s JOIN customer_accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.revoked_at IS NULL").bind(await sha256(token)).first<CustomerAccount>();
}
async function customerRateLimit(env:Env,key:string,limit:number,windowMs:number){
  const now=Date.now();
  await env.DB.prepare("INSERT INTO customer_auth_limits (key,attempts,window_start) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN ?-window_start>? THEN 1 ELSE attempts+1 END,window_start=CASE WHEN ?-window_start>? THEN ? ELSE window_start END").bind(key,now,now,windowMs,now,windowMs,now).run();
  const row=await env.DB.prepare("SELECT attempts FROM customer_auth_limits WHERE key=?").bind(key).first<{attempts:number}>();
  return Number(row?.attempts||0)<=limit;
}
function customerOriginValid(request:Request){
  const origin=request.headers.get("origin");
  return !origin||origin===new URL(request.url).origin;
}
async function createCustomerSession(env:Env,accountId:number){
  const token=randomHex(32),now=Date.now();
  await env.DB.prepare("INSERT INTO customer_sessions (account_id,token_hash,created_at,last_seen_at) VALUES (?,?,?,?)").bind(accountId,await sha256(token),now,now).run();
  return token;
}
type ShippingZone={code:string;label:string;price:number;active:boolean;sortOrder:number};
async function readShippingZones(env:Env,includeInactive=false):Promise<ShippingZone[]>{
  await ensureCustomerAuthSchema(env);
  const rows=await env.DB.prepare("SELECT code,label,price_agorot,active,sort_order FROM shipping_zones "+(includeInactive?"":"WHERE active=1 ")+"ORDER BY sort_order,code").all<{code:string;label:string;price_agorot:number;active:number;sort_order:number}>();
  return rows.results.map(row=>({code:row.code,label:row.label,price:row.price_agorot/100,active:row.active!==0,sortOrder:row.sort_order}));
}
async function saveShippingZones(request:Request,env:Env){
  await ensureCustomerAuthSchema(env);
  const body=await parseJson(request),zones=Array.isArray(body.zones)?body.zones as Array<Record<string,unknown>>:[];
  const allowed=new Set(["west_bank","jerusalem","inside"]);
  if(zones.length!==3||zones.some(zone=>!allowed.has(asText(zone.code))))return json({error:"بيانات مناطق الشحن غير مكتملة"},{status:400});
  for(const [index,zone] of zones.entries()){
    const code=asText(zone.code),label=asText(zone.label).slice(0,60),price=Number(zone.price);
    if(!label||!Number.isFinite(price)||price<0||price>1000)return json({error:"اسم المنطقة أو سعر الشحن غير صحيح"},{status:400});
    await env.DB.prepare("UPDATE shipping_zones SET label=?,price_agorot=?,active=?,sort_order=?,updated_at=? WHERE code=?").bind(label,Math.round(price*100),asBoolean(zone.active)?1:0,index,Date.now(),code).run();
  }
  return json({ok:true,zones:await readShippingZones(env,true)});
}
async function customerApi(request:Request,env:Env,url:URL):Promise<Response>{
  if(env.APP_SURFACE==="admin")return json({error:"Not Found"},{status:404});
  await ensureCustomerAuthSchema(env);
  if(request.method!=="GET"&&!customerOriginValid(request))return json({error:"طلب غير مسموح"},{status:403});
  const path=url.pathname;
  if(request.method==="POST"&&path==="/api/account/register"){
    const body=await parseJson(request),email=asText(body.email).toLowerCase(),password=typeof body.password==="string"?body.password:"",name=asText(body.name).slice(0,100),phone=asText(body.phone).slice(0,30),city=asText(body.city).slice(0,100),address=asText(body.address).slice(0,250);
    if(!ACCOUNT_EMAIL.test(email)||email.length>254||!name||password.length<6||password.length>128)return json({error:"أدخل الاسم وبريدًا صحيحًا وكلمة مرور من 6 خانات على الأقل"},{status:400});
    const ip=request.headers.get("cf-connecting-ip")||"unknown";
    if(!await customerRateLimit(env,"register:"+await sha256(ip),10,3600000))return json({error:"محاولات كثيرة، حاول لاحقًا"},{status:429});
    const existing=await env.DB.prepare("SELECT id FROM customer_accounts WHERE email=?").bind(email).first();
    if(existing)return json({error:"هذا البريد مسجل مسبقًا"},{status:409});
    const salt=randomHex(16),hash=await passwordHash(password,salt),now=Date.now();
    let result:D1Result;
    try{result=await env.DB.prepare("INSERT INTO customer_accounts (email,password_hash,password_salt,name,phone,city,address,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(email,hash,salt,name,phone,city,address,now,now).run()}
    catch{return json({error:"تعذر إنشاء الحساب، تحقق من البريد وحاول مجددًا"},{status:409})}
    const token=await createCustomerSession(env,Number(result.meta.last_row_id));
    return json({ok:true},{headers:{"set-cookie":customerCookie(token)}});
  }
  if(request.method==="POST"&&path==="/api/account/login"){
    const body=await parseJson(request),email=asText(body.email).toLowerCase(),password=typeof body.password==="string"?body.password:"";
    if(!ACCOUNT_EMAIL.test(email)||!password)return json({error:"البريد أو كلمة المرور غير صحيحة"},{status:401});
    const ip=request.headers.get("cf-connecting-ip")||"unknown";
    if(!await customerRateLimit(env,"login-email:"+await sha256(email),10,900000)||!await customerRateLimit(env,"login-ip:"+await sha256(ip),50,900000))return json({error:"محاولات كثيرة، حاول بعد 15 دقيقة"},{status:429});
    const account=await env.DB.prepare("SELECT id,password_hash,password_salt FROM customer_accounts WHERE email=?").bind(email).first<{id:number;password_hash:string;password_salt:string}>();
    const matches=await passwordMatches(password,account?.password_salt||"not-an-account",account?.password_hash||"scrypt$"+("0".repeat(64)));
    if(!account||!matches)return json({error:"البريد أو كلمة المرور غير صحيحة"},{status:401});
    const token=await createCustomerSession(env,account.id);
    return json({ok:true},{headers:{"set-cookie":customerCookie(token)}});
  }
  if(request.method==="POST"&&path==="/api/account/logout"){
    const token=requestCookie(request);
    if(token)await env.DB.prepare("UPDATE customer_sessions SET revoked_at=? WHERE token_hash=?").bind(Date.now(),await sha256(token)).run();
    return json({ok:true},{headers:{"set-cookie":customerCookie("",0)}});
  }
  const account=await getCustomerAccount(request,env);
  if(!account)return json({error:"سجّل دخولك أولًا"},{status:401});
  if(request.method==="GET"&&path==="/api/account/addresses"){
    let rows=await env.DB.prepare("SELECT id,label,recipient_name,phone,city,address,shipping_zone,is_default FROM customer_addresses WHERE account_id=? ORDER BY is_default DESC,id").bind(account.id).all<{id:number;label:string;recipient_name:string;phone:string;city:string;address:string;shipping_zone:string;is_default:number}>();
    if(!rows.results.length&&account.address&&account.city){
      const now=Date.now();
      await env.DB.prepare("INSERT INTO customer_addresses (account_id,label,recipient_name,phone,city,address,shipping_zone,is_default,created_at,updated_at) VALUES (?,?,?,?,?,?,?,1,?,?)").bind(account.id,"المنزل",account.name,account.phone,account.city,account.address,"west_bank",now,now).run();
      rows=await env.DB.prepare("SELECT id,label,recipient_name,phone,city,address,shipping_zone,is_default FROM customer_addresses WHERE account_id=? ORDER BY is_default DESC,id").bind(account.id).all<{id:number;label:string;recipient_name:string;phone:string;city:string;address:string;shipping_zone:string;is_default:number}>();
    }
    return json({addresses:rows.results.map(row=>({id:row.id,label:row.label,recipientName:row.recipient_name,phone:row.phone,city:row.city,address:row.address,shippingZone:row.shipping_zone,isDefault:row.is_default!==0}))});
  }
  const addressMatch=path.match(/^\/api\/account\/addresses\/(\d+)$/);
  if((request.method==="POST"&&path==="/api/account/addresses")||(request.method==="PUT"&&addressMatch)){
    const body=await parseJson(request),label=asText(body.label).slice(0,60),recipientName=asText(body.recipientName).slice(0,100),phone=asText(body.phone).slice(0,30),city=asText(body.city).slice(0,100),address=asText(body.address).slice(0,250),shippingZone=asText(body.shippingZone),makeDefault=asBoolean(body.isDefault),now=Date.now();
    if(!label||!recipientName||phone.length<7||!city||!address)return json({error:"اسم العنوان والمستلم والهاتف والمدينة والعنوان مطلوبة"},{status:400});
    const zone=await env.DB.prepare("SELECT code FROM shipping_zones WHERE code=? AND active=1").bind(shippingZone).first();
    if(!zone)return json({error:"منطقة الشحن غير متاحة"},{status:400});
    if(makeDefault)await env.DB.prepare("UPDATE customer_addresses SET is_default=0 WHERE account_id=?").bind(account.id).run();
    if(addressMatch){
      const id=Number(addressMatch[1]),result=await env.DB.prepare("UPDATE customer_addresses SET label=?,recipient_name=?,phone=?,city=?,address=?,shipping_zone=?,is_default=?,updated_at=? WHERE id=? AND account_id=?").bind(label,recipientName,phone,city,address,shippingZone,makeDefault?1:0,now,id,account.id).run();
      if(result.meta?.changes===0)return json({error:"العنوان غير موجود"},{status:404});
    }else{
      const count=await env.DB.prepare("SELECT COUNT(*) AS count FROM customer_addresses WHERE account_id=?").bind(account.id).first<{count:number}>();
      const isDefault=makeDefault||Number(count?.count||0)===0;
      if(isDefault)await env.DB.prepare("UPDATE customer_addresses SET is_default=0 WHERE account_id=?").bind(account.id).run();
      await env.DB.prepare("INSERT INTO customer_addresses (account_id,label,recipient_name,phone,city,address,shipping_zone,is_default,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(account.id,label,recipientName,phone,city,address,shippingZone,isDefault?1:0,now,now).run();
    }
    return json({ok:true});
  }
  if(request.method==="DELETE"&&addressMatch){
    const id=Number(addressMatch[1]),row=await env.DB.prepare("SELECT is_default FROM customer_addresses WHERE id=? AND account_id=?").bind(id,account.id).first<{is_default:number}>();
    if(!row)return json({error:"العنوان غير موجود"},{status:404});
    await env.DB.prepare("DELETE FROM customer_addresses WHERE id=? AND account_id=?").bind(id,account.id).run();
    if(row.is_default)await env.DB.prepare("UPDATE customer_addresses SET is_default=1 WHERE id=(SELECT id FROM customer_addresses WHERE account_id=? ORDER BY id LIMIT 1)").bind(account.id).run();
    return json({ok:true});
  }
  if(request.method==="GET"&&path==="/api/account/me"){
    const token=requestCookie(request);
    await env.DB.prepare("UPDATE customer_sessions SET last_seen_at=? WHERE token_hash=?").bind(Date.now(),await sha256(token)).run();
    return json({account},{headers:{"set-cookie":customerCookie(token)}});
  }
  if(request.method==="PUT"&&path==="/api/account/me"){
    const body=await parseJson(request),name=asText(body.name).slice(0,100),phone=asText(body.phone).slice(0,30),city=asText(body.city).slice(0,100),address=asText(body.address).slice(0,250);
    if(!name)return json({error:"الاسم مطلوب"},{status:400});
    await env.DB.prepare("UPDATE customer_accounts SET name=?,phone=?,city=?,address=?,updated_at=? WHERE id=?").bind(name,phone,city,address,Date.now(),account.id).run();
    return json({ok:true});
  }
  if(request.method==="PUT"&&path==="/api/account/password"){
    const body=await parseJson(request),current=typeof body.currentPassword==="string"?body.currentPassword:"",next=typeof body.newPassword==="string"?body.newPassword:"";
    if(next.length<6||next.length>128)return json({error:"كلمة المرور الجديدة يجب أن تكون 6 خانات على الأقل"},{status:400});
    const row=await env.DB.prepare("SELECT password_hash,password_salt FROM customer_accounts WHERE id=?").bind(account.id).first<{password_hash:string;password_salt:string}>();
    if(!row||!await passwordMatches(current,row.password_salt,row.password_hash))return json({error:"كلمة المرور الحالية غير صحيحة"},{status:403});
    const salt=randomHex(16);
    await env.DB.prepare("UPDATE customer_accounts SET password_hash=?,password_salt=?,updated_at=? WHERE id=?").bind(await passwordHash(next,salt),salt,Date.now(),account.id).run();
    await env.DB.prepare("UPDATE customer_sessions SET revoked_at=? WHERE account_id=? AND token_hash<>? AND revoked_at IS NULL").bind(Date.now(),account.id,await sha256(requestCookie(request))).run();
    return json({ok:true});
  }
  if(request.method==="GET"&&path==="/api/account/orders"){
    await ensureOrderExtrasSchema(env);
    const orders=await env.DB.prepare("SELECT id,order_number,status,total_agorot,shipping_agorot,created_at FROM orders WHERE customer_account_id=? AND deleted_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 100").bind(account.id).all<{id:number;order_number:number;status:string;total_agorot:number;shipping_agorot:number;created_at:number}>();
    const items=await env.DB.prepare("SELECT oi.order_id,oi.product_name,oi.variant_label,oi.quantity,oi.item_number FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.customer_account_id=? AND o.deleted_at IS NULL ORDER BY oi.id").bind(account.id).all<{order_id:number;product_name:string;variant_label:string|null;quantity:number;item_number:number}>();
    const fees=await env.DB.prepare("SELECT f.order_id,f.label,f.amount_agorot FROM order_extra_fees f JOIN orders o ON o.id=f.order_id WHERE o.customer_account_id=? AND o.deleted_at IS NULL ORDER BY f.id").bind(account.id).all<{order_id:number;label:string;amount_agorot:number}>();
    return json({orders:orders.results.map(order=>({number:order.order_number,status:order.status,total:order.total_agorot/100,shipping:order.shipping_agorot/100,createdAt:order.created_at,extraFees:fees.results.filter(fee=>fee.order_id===order.id).map(fee=>({label:fee.label,amount:fee.amount_agorot/100})),items:items.results.filter(item=>item.order_id===order.id).map(item=>({name:item.product_name,variant:item.variant_label,quantity:item.quantity,itemNumber:item.item_number}))}))});
  }
  return json({error:"Not Found"},{status:404});
}

let orderExtrasReady:Promise<void>|null=null;
async function ensureOrderExtrasSchema(env:Env){
 if(!orderExtrasReady)orderExtrasReady=env.DB.prepare("CREATE TABLE IF NOT EXISTS order_extra_fees (id INTEGER PRIMARY KEY AUTOINCREMENT,order_id INTEGER NOT NULL,label TEXT NOT NULL,amount_agorot INTEGER NOT NULL,created_at INTEGER NOT NULL,FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE)").run().then(()=>undefined).catch(error=>{orderExtrasReady=null;throw error});
 await orderExtrasReady;
}
let analyticsReady:Promise<void>|null=null;
async function ensureAnalyticsSchema(env:Env){
 if(!analyticsReady)analyticsReady=(async()=>{await env.DB.prepare("CREATE TABLE IF NOT EXISTS store_daily_visitors (day TEXT NOT NULL,visitor_hash TEXT NOT NULL,views INTEGER NOT NULL DEFAULT 1,first_seen_at INTEGER NOT NULL,last_seen_at INTEGER NOT NULL,PRIMARY KEY(day,visitor_hash))").run();await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_store_daily_visitors_day ON store_daily_visitors(day)").run()})().catch(error=>{analyticsReady=null;throw error});
 await analyticsReady;
}
function analyticsDay(date=new Date()){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Hebron",year:"numeric",month:"2-digit",day:"2-digit"}).format(date)}
async function trackStoreVisit(request:Request,env:Env){
 await ensureAnalyticsSchema(env);
 const body=await parseJson(request),visitorId=asText(body.visitorId);
 if(!/^[a-zA-Z0-9-]{16,80}$/.test(visitorId))return json({error:"معرّف الزيارة غير صحيح"},{status:400});
 const now=Date.now(),day=analyticsDay();
 await env.DB.prepare("INSERT INTO store_daily_visitors (day,visitor_hash,views,first_seen_at,last_seen_at) VALUES (?,?,1,?,?) ON CONFLICT(day,visitor_hash) DO UPDATE SET views=views+1,last_seen_at=excluded.last_seen_at").bind(day,await sha256(visitorId),now,now).run();
 return json({ok:true});
}
async function trackHighlightView(request:Request,env:Env,highlightId:number){
 const requestOrigin=request.headers.get("origin"),origin=new URL(request.url).origin;
 if(requestOrigin&&requestOrigin!==origin)return json({error:"مصدر الطلب غير مسموح"},{status:403});
 if(!Number.isInteger(highlightId)||highlightId<1)return json({error:"رقم الهايلايت غير صحيح"},{status:400});
 const result=await env.DB.prepare("UPDATE store_highlights SET view_count=view_count+1 WHERE id=? AND active=1").bind(highlightId).run();
 if(Number(result.meta?.changes||0)===0)return json({error:"الهايلايت غير موجودة"},{status:404});
 return json({ok:true},{headers:{"cache-control":"no-store"}});
}
async function trackHighlightImageView(request:Request,env:Env,highlightId:number,imageNumber:number){
 const requestOrigin=request.headers.get("origin"),origin=new URL(request.url).origin;
 if(requestOrigin&&requestOrigin!==origin)return json({error:"مصدر الطلب غير مسموح"},{status:403});
 if(!Number.isInteger(highlightId)||highlightId<1||!Number.isInteger(imageNumber)||imageNumber<1)return json({error:"رقم صورة الهايلايت غير صحيح"},{status:400});
 await ensureHighlightSchema(env);
 const result=await env.DB.prepare("UPDATE highlight_image_numbers SET view_count=view_count+1 WHERE highlight_id=? AND image_number=? AND EXISTS (SELECT 1 FROM store_highlights WHERE id=? AND active=1)").bind(highlightId,imageNumber,highlightId).run();
 if(Number(result.meta?.changes||0)===0)return json({error:"صورة الهايلايت غير موجودة"},{status:404});
 return json({ok:true},{headers:{"cache-control":"no-store"}});
}
async function trackProductView(request:Request,env:Env,productId:number){
 const requestOrigin=request.headers.get("origin"),origin=new URL(request.url).origin;
 if(requestOrigin&&requestOrigin!==origin)return json({error:"مصدر الطلب غير مسموح"},{status:403});
 if(!Number.isInteger(productId)||productId<1)return json({error:"رقم المنتج غير صحيح"},{status:400});
 const result=await env.DB.prepare("UPDATE products SET view_count=view_count+1 WHERE id=? AND active=1").bind(productId).run();
 if(Number(result.meta?.changes||0)===0)return json({error:"المنتج غير موجود"},{status:404});
 return json({ok:true},{headers:{"cache-control":"no-store"}});
}
const orderStatuses=["new","confirmed","preparing","shipped","delivered","cancelled"] as const;
async function createOrder(request:Request,env:Env,ctx:ExecutionContext){
  await ensureCustomizationSchema(env);
  await ensureCustomerAuthSchema(env);
  await ensureStorePoliciesSchema(env);
  await ensureOrderPolicyColumns(env);
  const requestOrigin=request.headers.get("origin");
  if(requestOrigin!==new URL(request.url).origin)return json({error:"مصدر الطلب غير مسموح"},{status:403});
  const body=await parseJson(request),name=asText(body.customerName),phone=asText(body.phone),city=asText(body.city),address=asText(body.address),zone=asText(body.shippingZone),notes=asOptionalText(body.notes);
  const currentPolicies=await readPolicies(env),acceptedPolicyVersion=Number(body.policyVersion);
  if(body.policyAccepted!==true||acceptedPolicyVersion!==currentPolicies.version)return json({error:"يجب قراءة سياسات المتجر والموافقة على النسخة الحالية قبل تأكيد الطلب"},{status:400});
  if(!name)return json({error:"الاسم الكامل مطلوب"},{status:400});
  const phoneDigits=phone.replace(/\D/g,"");
  if(phoneDigits.length<7)return json({error:"رقم الهاتف يجب أن يحتوي على 7 أرقام على الأقل"},{status:400});
  const orderIp=request.headers.get("cf-connecting-ip")||"unknown";
  if(!await customerRateLimit(env,"order-ip:"+await sha256(orderIp),20,600000)||!await customerRateLimit(env,"order-phone:"+await sha256(phoneDigits),6,1800000))return json({error:"تم إرسال طلبات كثيرة، انتظر قليلًا ثم حاول مجددًا"},{status:429});
  if(!city)return json({error:"المدينة مطلوبة"},{status:400});
  if(!address)return json({error:"العنوان بالتفصيل مطلوب"},{status:400});
  const shippingRow=await env.DB.prepare("SELECT price_agorot FROM shipping_zones WHERE code=? AND active=1").bind(zone).first<{price_agorot:number}>();
  if(!shippingRow)return json({error:"منطقة التوصيل غير صحيحة أو غير مفعلة"},{status:400});
  const shipping=Number(shippingRow.price_agorot);
  const requested=Array.isArray(body.items)?body.items as Array<Record<string,unknown>>:[];
  if(!requested.length||requested.length>100)return json({error:"السلة فارغة أو تتجاوز الحد"},{status:400});
  const lines:Array<{productId:number;variantId:number|null;itemNumber:number;name:string;variantLabel:string|null;customizations:Record<string,string>;qty:number;unit:number;total:number}>=[];
  for(const item of requested){
    const productId=Number(item.productId),variantId=item.variantId?Number(item.variantId):null,qty=Math.min(99,Math.max(1,Number(item.qty)||1));
    const product=await env.DB.prepare("SELECT id,item_number,name,price_agorot,stock_quantity FROM products WHERE id=? AND active=1 AND deleted_at IS NULL").bind(productId).first<Record<string,unknown>>();
    if(!product)return json({error:"أحد الأصناف لم يعد متاحاً"},{status:409});
    let stock=Number(product.stock_quantity),unit=Number(product.price_agorot),label:string|null=null;
    if(variantId){
      const variant=await env.DB.prepare("SELECT v.price_agorot,v.stock_quantity,pov.value FROM product_variants v LEFT JOIN variant_option_values vov ON vov.variant_id=v.id LEFT JOIN product_option_values pov ON pov.id=vov.option_value_id WHERE v.id=? AND v.product_id=? AND v.active=1 LIMIT 1").bind(variantId,productId).first<Record<string,unknown>>();
      if(!variant)return json({error:`الخيار المحدد للصنف ${String(product.name)} لم يعد متاحاً؛ احذفه من السلة واختره من جديد`},{status:409});
      stock=Number(variant.stock_quantity);unit=variant.price_agorot==null?unit:Number(variant.price_agorot);label=variant.value?String(variant.value):null;
    }else{
      const variantCount=await env.DB.prepare("SELECT COUNT(*) AS count FROM product_variants WHERE product_id=? AND active=1").bind(productId).first<{count:number}>();
      if(Number(variantCount?.count||0)>0)return json({error:`اختر خيار الصنف ${String(product.name)} من جديد قبل إتمام الطلب`},{status:409});
    }
    if(stock<qty)return json({error:`المتوفر من ${String(product.name)}${label?` — ${label}`:""} هو ${stock} فقط`},{status:409});
    const definitions=await env.DB.prepare("SELECT label,max_length,required FROM product_custom_fields WHERE product_id=? ORDER BY sort_order,id").bind(productId).all(),submitted=item.customizations&&typeof item.customizations==="object"?item.customizations as Record<string,unknown>:{},customizations:Record<string,string>={};
    for(const field of definitions.results as Array<Record<string,unknown>>){const fieldLabel=String(field.label),value=asText(submitted[fieldLabel]).slice(0,Number(field.max_length||60));if(Boolean(field.required)&&!value)return json({error:`الحقل ${fieldLabel} مطلوب للصنف ${String(product.name)}`},{status:400});if(value)customizations[fieldLabel]=value}
    const lineNote=asText(item.notes).slice(0,500);
    lines.push({productId,variantId,itemNumber:Number(product.item_number),name:String(product.name),variantLabel:label,customizations:{...customizations,...(lineNote?{"ملاحظات على المنتج":lineNote}:{})},qty,unit,total:unit*qty});
  }
  const account=await getCustomerAccount(request,env);
  const subtotal=lines.reduce((sum,line)=>sum+line.total,0),now=Date.now(),number=Number((await env.DB.prepare("SELECT COALESCE(MAX(order_number),1000)+1 AS next FROM orders").first<{next:number}>())?.next||1001),result=await env.DB.prepare("INSERT INTO orders (order_number,status,customer_name,phone,address,city,subtotal_agorot,shipping_agorot,discount_agorot,total_agorot,payment_method,payment_status,notes,created_at,updated_at,customer_account_id,accepted_policy_version,policy_accepted_at) VALUES (?,'new',?,?,?,?,?,?,0,?,'cash_on_delivery','pending',?,?,?,?,?,?)").bind(number,name,phone,address,city,subtotal,shipping,subtotal+shipping,notes,now,now,account?.id||null,acceptedPolicyVersion,now).run(),orderId=Number(result.meta.last_row_id);
  await env.DB.batch(lines.map(line=>env.DB.prepare("INSERT INTO order_items (order_id,product_id,variant_id,item_number,product_name,variant_label,customization_json,quantity,unit_price_agorot,line_total_agorot) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(orderId,line.productId,line.variantId,line.itemNumber,line.name,line.variantLabel,JSON.stringify(line.customizations),line.qty,line.unit,line.total)));
  ctx.waitUntil(notifyNewOrder(env,orderId,number,new URL(request.url).origin,account?.id||null,body.pushDeviceId,body.pushDeviceToken).catch(()=>console.error("new_order_push_failed")));
  return json({ok:true,orderNumber:number,total:(subtotal+shipping)/100});
}

async function readOrders(env:Env){
  await ensureCustomizationSchema(env);
  await ensureOrderExtrasSchema(env);
  await ensureOrderPolicyColumns(env);
  const [orders,items,mediaResult,feesResult]=await Promise.all([
    env.DB.prepare("SELECT id,order_number,status,customer_name,phone,address,city,subtotal_agorot,shipping_agorot,total_agorot,payment_method,payment_status,notes,created_at,updated_at,accepted_policy_version,policy_accepted_at FROM orders WHERE deleted_at IS NULL ORDER BY created_at DESC,id DESC").all(),
    env.DB.prepare("SELECT id,order_id,product_id,variant_id,item_number,product_name,variant_label,customization_json,quantity,unit_price_agorot,line_total_agorot FROM order_items ORDER BY id").all(),
    env.DB.prepare("SELECT product_id,variant_id,url FROM product_media WHERE media_type='image' ORDER BY is_primary DESC,sort_order,id").all(),
    env.DB.prepare("SELECT id,order_id,label,amount_agorot FROM order_extra_fees ORDER BY id").all()
  ]);
  const media=mediaResult.results as Array<Record<string,unknown>>;
  return (orders.results as Array<Record<string,unknown>>).map(order=>({id:Number(order.id),orderNumber:Number(order.order_number),status:String(order.status),customerName:String(order.customer_name||""),phone:String(order.phone||""),address:String(order.address||""),city:String(order.city||""),subtotal:Number(order.subtotal_agorot)/100,shipping:Number(order.shipping_agorot)/100,total:Number(order.total_agorot)/100,paymentMethod:String(order.payment_method),paymentStatus:String(order.payment_status),notes:String(order.notes||""),createdAt:Number(order.created_at),policyVersion:order.accepted_policy_version==null?null:Number(order.accepted_policy_version),policyAcceptedAt:order.policy_accepted_at==null?null:Number(order.policy_accepted_at),extraFees:(feesResult.results as Array<Record<string,unknown>>).filter(fee=>Number(fee.order_id)===Number(order.id)).map(fee=>({id:Number(fee.id),label:String(fee.label),amount:Number(fee.amount_agorot)/100})),items:(items.results as Array<Record<string,unknown>>).filter(item=>Number(item.order_id)===Number(order.id)).map(item=>{const productId=item.product_id==null?null:Number(item.product_id),variantId=item.variant_id==null?null:Number(item.variant_id),image=media.find(entry=>Number(entry.product_id)===productId&&entry.variant_id!=null&&Number(entry.variant_id)===variantId)||media.find(entry=>Number(entry.product_id)===productId&&entry.variant_id==null);let customizations:Record<string,string>={};try{customizations=JSON.parse(String(item.customization_json||"{}")) as Record<string,string>}catch{}return{id:Number(item.id),productId,variantId,itemNumber:Number(item.item_number),productName:String(item.product_name),variantLabel:String(item.variant_label||""),customizations,imageUrl:String(image?.url||""),quantity:Number(item.quantity),unitPrice:Number(item.unit_price_agorot)/100,lineTotal:Number(item.line_total_agorot)/100}})}));
}

async function updateOrder(request:Request,env:Env,id:number,ctx:ExecutionContext){
  await ensureOrderExtrasSchema(env);
  const body=await parseJson(request),status=asText(body.status),submittedFees=Array.isArray(body.extraFees)?body.extraFees as Array<Record<string,unknown>>:null;
  const fees=submittedFees?.map(fee=>({label:asText(fee.label).slice(0,100),amount:Math.max(0,Math.round(Number(fee.amount||0)*100))})).filter(fee=>fee.label&&fee.amount>0).slice(0,20)||null;
  if(submittedFees&&fees?.length!==submittedFees.length)return json({error:"سبب ومبلغ كل رسم إضافي مطلوبان"},{status:400});
  if(!orderStatuses.includes(status as typeof orderStatuses[number]))return json({error:"حالة الطلب غير صحيحة"},{status:400});
  const current=await env.DB.prepare("SELECT status FROM orders WHERE id=? AND deleted_at IS NULL").bind(id).first<{status:string}>();
  if(!current)return json({error:"الطلب غير موجود"},{status:404});
  const shipping=Math.max(0,Math.round(Number(body.shipping??0)*100)),now=Date.now(),existingFeeTotal=fees?0:Number((await env.DB.prepare("SELECT COALESCE(SUM(amount_agorot),0) AS total FROM order_extra_fees WHERE order_id=?").bind(id).first<{total:number}>())?.total||0),feeTotal=fees?fees.reduce((sum,fee)=>sum+fee.amount,0):existingFeeTotal,statements=[env.DB.prepare("UPDATE orders SET status=?,shipping_agorot=?,total_agorot=subtotal_agorot+?+?,updated_at=? WHERE id=?").bind(status,shipping,shipping,feeTotal,now,id)];
  if(fees){statements.push(env.DB.prepare("DELETE FROM order_extra_fees WHERE order_id=?").bind(id));for(const fee of fees)statements.push(env.DB.prepare("INSERT INTO order_extra_fees (order_id,label,amount_agorot,created_at) VALUES (?,?,?,?)").bind(id,fee.label,fee.amount,now))}
  if(current.status==="new"&&status==="confirmed"){
    const items=await env.DB.prepare("SELECT id,product_id,variant_id,product_name,variant_label,quantity FROM order_items WHERE order_id=?").bind(id).all();
    for(const item of items.results as Array<Record<string,unknown>>){
      const quantity=Number(item.quantity);
      let resolvedVariantId=item.variant_id==null?null:Number(item.variant_id);
      let stock=resolvedVariantId?await env.DB.prepare("SELECT stock_quantity FROM product_variants WHERE id=? AND product_id=? AND active=1").bind(resolvedVariantId,Number(item.product_id)).first<{stock_quantity:number}>():null;
      if(!stock&&item.variant_label&&item.product_id!=null){
        const replacement=await env.DB.prepare("SELECT v.id,v.stock_quantity FROM product_variants v JOIN variant_option_values vov ON vov.variant_id=v.id JOIN product_option_values pov ON pov.id=vov.option_value_id WHERE v.product_id=? AND pov.value=? AND v.active=1 LIMIT 1").bind(Number(item.product_id),String(item.variant_label)).first<{id:number;stock_quantity:number}>();
        if(replacement){resolvedVariantId=Number(replacement.id);stock={stock_quantity:Number(replacement.stock_quantity)};statements.push(env.DB.prepare("UPDATE order_items SET variant_id=? WHERE id=?").bind(resolvedVariantId,Number(item.id)))}
      }
      if(!resolvedVariantId)stock=await env.DB.prepare("SELECT stock_quantity FROM products WHERE id=? AND deleted_at IS NULL").bind(Number(item.product_id)).first<{stock_quantity:number}>();
      if(!stock||Number(stock.stock_quantity)<quantity)return json({error:`لا يمكن تأكيد الطلب: المتوفر من ${String(item.product_name)}${item.variant_label?` — ${String(item.variant_label)}`:""} هو ${Number(stock?.stock_quantity||0)} فقط`},{status:409});
      if(resolvedVariantId)statements.push(env.DB.prepare("UPDATE product_variants SET stock_quantity=stock_quantity-?,updated_at=? WHERE id=?").bind(quantity,now,resolvedVariantId));
      if(item.product_id!=null)statements.push(env.DB.prepare("UPDATE products SET stock_quantity=CASE WHEN ? IS NULL THEN stock_quantity-? ELSE stock_quantity END,order_count=order_count+?,updated_at=? WHERE id=?").bind(resolvedVariantId,quantity,quantity,now,Number(item.product_id)));
    }
  }
  await env.DB.batch(statements);
  if(current.status!==status)ctx.waitUntil(notifyOrderStatus(env,id,status).catch(()=>console.error("order_status_push_failed")));
  return json({ok:true});
}

async function readCatalog(env: Env, includeInactive = false) {
  const visibility = includeInactive ? null : await env.DB.prepare("SELECT show_out_of_stock FROM store_settings WHERE id=1").first<{show_out_of_stock:number}>();
  const showOutOfStock = Boolean(visibility?.show_out_of_stock ?? 1);
  const categoryWhere = includeInactive ? "" : "WHERE active = 1";
  const productWhere = includeInactive ? "WHERE deleted_at IS NULL" : "WHERE p.active = 1 AND p.deleted_at IS NULL";
  const [categoryResult, productResult, optionResult, valueResult, variantResult, linkResult, mediaResult, keywordResult,customFieldResult] = await Promise.all([
    env.DB.prepare(`SELECT id, category_number, parent_id, name, slug, description, banner_url, icon_url, sort_order, active FROM categories ${categoryWhere} ORDER BY sort_order, id`).all(),
    env.DB.prepare(`SELECT p.*, c.name AS category_name, pc.name AS parent_category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id LEFT JOIN categories pc ON pc.id = c.parent_id ${productWhere} ORDER BY p.created_at DESC, p.id DESC`).all(),
    env.DB.prepare("SELECT id, product_id, name, display_type, sort_order FROM product_options ORDER BY sort_order, id").all(),
    env.DB.prepare("SELECT id, option_id, value, color_hex, sort_order FROM product_option_values ORDER BY sort_order, id").all(),
    env.DB.prepare("SELECT id, product_id, sku, price_agorot, wholesale_price_agorot, stock_quantity, active FROM product_variants ORDER BY id").all(),
    env.DB.prepare("SELECT variant_id, option_value_id FROM variant_option_values").all(),
    env.DB.prepare("SELECT id, product_id, variant_id, media_type, url, alt_text, sort_order, is_primary FROM product_media ORDER BY is_primary DESC, sort_order, id").all(),
    env.DB.prepare("SELECT product_id, keyword FROM product_keywords ORDER BY keyword").all(),
    env.DB.prepare("SELECT id,product_id,label,placeholder,max_length,required,sort_order FROM product_custom_fields ORDER BY sort_order,id").all(),
  ]);

  const categories = (categoryResult.results as Array<Record<string, unknown>>).map((row) => ({
    id: Number(row.id), categoryNumber: Number(row.category_number), parentId: row.parent_id == null ? null : Number(row.parent_id),
    name: String(row.name), slug: String(row.slug), description: String(row.description || ""), bannerUrl: String(row.banner_url || ""), iconUrl: String(row.icon_url || ""),
    sortOrder: Number(row.sort_order), active: Boolean(row.active),
  }));
  const options = optionResult.results as Array<Record<string, unknown>>;
  const values = valueResult.results as Array<Record<string, unknown>>;
  const variants = variantResult.results as Array<Record<string, unknown>>;
  const links = linkResult.results as Array<Record<string, unknown>>;
  const media = mediaResult.results as Array<Record<string, unknown>>;
  const keywords = keywordResult.results as Array<Record<string, unknown>>;
  const customFields=customFieldResult.results as Array<Record<string,unknown>>;
  const productSuppliers: Array<Record<string,unknown>> = [];

  const grouped = <T extends Record<string, unknown>>(rows: T[], key: string) => {
    const map = new Map<number, T[]>();
    for (const row of rows) {
      const id = Number(row[key]);
      const bucket = map.get(id);
      if (bucket) bucket.push(row); else map.set(id, [row]);
    }
    return map;
  };
  const mediaByProduct = grouped(media, "product_id");
  const optionsByProduct = grouped(options, "product_id");
  const valuesByOption = grouped(values, "option_id");
  const variantsByProduct = grouped(variants, "product_id");
  const linksByVariant = grouped(links, "variant_id");
  const keywordsByProduct = grouped(keywords, "product_id");
  const customFieldsByProduct = grouped(customFields, "product_id");
  const suppliersByProduct = grouped(productSuppliers, "product_id");

  const products = (productResult.results as Array<Record<string, unknown>>).map((row) => {
    const id = Number(row.id);
    const productMedia = mediaByProduct.get(id) || [];
    const images = productMedia.filter((item) => item.media_type === "image" && item.variant_id == null).map((item) => String(item.url));
    const video = productMedia.find((item) => item.media_type === "video" && item.variant_id == null);
    const option = optionsByProduct.get(id)?.[0];
    const optionValues = option ? valuesByOption.get(Number(option.id)) || [] : [];
    const optionValueById = new Map(optionValues.map(item => [Number(item.id), item]));
    const productVariants = (variantsByProduct.get(id) || []).filter((variant) => includeInactive || Boolean(variant.active)).map((variant) => {
      const link = linksByVariant.get(Number(variant.id))?.[0];
      const value = optionValueById.get(Number(link?.option_value_id));
      const variantImages = productMedia.filter((item) => Number(item.variant_id) === Number(variant.id) && item.media_type === "image").map((item) => String(item.url));
      return { id: Number(variant.id), name: String(value?.value || variant.sku || "خيار"), sku: String(variant.sku || ""), displayType: String(option?.display_type || "text"), color: value?.color_hex ? String(value.color_hex) : undefined, stock: Number(variant.stock_quantity), price: amount(variant.price_agorot as number | null), wholesale: amount(variant.wholesale_price_agorot as number | null), image: variantImages[0], images: variantImages };
    });
    const inStock = productVariants.length > 0 ? productVariants.some((item) => item.stock > 0) : Number(row.stock_quantity) > 0;
    return {
      id, itemNumber: Number(row.item_number), name: String(row.name), slug: String(row.slug), categoryId: row.category_id == null ? null : Number(row.category_id),
      category: String(row.parent_category_name || row.category_name || "بدون قسم"), subcategory: row.parent_category_name ? String(row.category_name) : undefined,
      price: amount(row.price_agorot as number) || 0, wholesale: amount(row.wholesale_price_agorot as number | null), purchasePrice: amount(row.purchase_price_agorot as number | null), oldPrice: amount(row.offer_price_agorot as number | null),
      image: images[0], images, video: video ? String(video.url) : undefined, variantName: option ? String(option.name) : undefined,
      keywords: (keywordsByProduct.get(id) || []).map((item) => String(item.keyword)).join(" "),
      customFields:(customFieldsByProduct.get(id) || []).map(item=>({id:Number(item.id),label:String(item.label),placeholder:String(item.placeholder||""),maxLength:Number(item.max_length||60),required:Boolean(item.required)})),
      suppliers:(suppliersByProduct.get(id) || []).map(item=>({id:Number(item.supplier_id),name:String(item.supplier_name),sourceProductId:String(item.source_product_id||""),sourceUrl:String(item.source_url||""),supplierPrice:amount(item.supplier_price_agorot as number|null),preferred:Boolean(item.preferred)})),
      description: includeInactive ? String(row.description || row.short_description || "") : cleanCatalogDescription(row.description) || cleanCatalogDescription(row.short_description), specifications: String(row.specifications || ""), stock: Number(row.stock_quantity), inStock, active: Boolean(row.active), featured: Boolean(row.featured), views: Number(row.view_count), orders: Number(row.order_count), rating: Number(row.rating_average_x100) / 100, ratingCount:Number(row.rating_count||0),createdAt:Number(row.created_at||0), variants: productVariants,
    };
  });
  return { categories, products: includeInactive || showOutOfStock ? products : products.filter((product) => product.inStock) };
}

async function parseJson(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 1_000_000) throw new Error("الطلب أكبر من الحد المسموح");
  return request.json() as Promise<Record<string, unknown>>;
}

async function saveCategory(request: Request, env: Env, id?: number) {
  await ensureCustomizationSchema(env);
  const body = await parseJson(request);
  const name = asText(body.name);
  if (!name) return json({ error: "اسم القسم مطلوب" }, { status: 400 });
  const parentId = body.parentId ? Number(body.parentId) : null;
  const number = Number(body.categoryNumber) || Number((await env.DB.prepare("SELECT COALESCE(MAX(category_number), 1000) + 1 AS next FROM categories").first())?.next);
  const slug = slugify(asText(body.slug) || name);
  if (id) {
    await env.DB.prepare("UPDATE categories SET category_number=?, parent_id=?, name=?, slug=?, description=?, banner_url=?, icon_url=?, sort_order=?, active=?, updated_at=? WHERE id=?")
      .bind(number, parentId, name, slug, asOptionalText(body.description), asOptionalText(body.bannerUrl), asOptionalText(body.iconUrl), Number(body.sortOrder || 0), asBoolean(body.active) ? 1 : 0, Date.now(), id).run();
  } else {
    await env.DB.prepare("INSERT INTO categories (category_number,parent_id,name,slug,description,banner_url,icon_url,sort_order,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .bind(number, parentId, name, slug, asOptionalText(body.description), asOptionalText(body.bannerUrl), asOptionalText(body.iconUrl), Number(body.sortOrder || 0), asBoolean(body.active) ? 1 : 0, Date.now(), Date.now()).run();
  }
  return json({ ok: true });
}

async function saveProduct(request: Request, env: Env, id?: number) {
  await ensureCustomizationSchema(env);
  const body = await parseJson(request);
  const name = asText(body.name);
  if (!name) return json({ error: "اسم الصنف مطلوب" }, { status: 400 });
  const categoryId = body.categoryId ? Number(body.categoryId) : null;
  const itemNumber = Number(body.itemNumber) || Number((await env.DB.prepare("SELECT COALESCE(MAX(item_number), 1000) + 1 AS next FROM products").first())?.next);
  const slug = slugify(asText(body.slug) || `${name}-${itemNumber}`);
  const now = Date.now();
  let productId = id;
  if (id) {
    await env.DB.prepare("UPDATE products SET item_number=?, category_id=?, name=?, slug=?, description=?, specifications=?, price_agorot=?, wholesale_price_agorot=?, purchase_price_agorot=?, stock_quantity=?, active=?, featured=?, offer_price_agorot=?, updated_at=? WHERE id=?")
      .bind(itemNumber, categoryId, name, slug, asOptionalText(body.description), asOptionalText(body.specifications), agorot(body.price), nullableAgorot(body.wholesale), nullableAgorot(body.purchasePrice), Number(body.stock || 0), asBoolean(body.active) ? 1 : 0, asBoolean(body.featured) ? 1 : 0, nullableAgorot(body.oldPrice), now, id).run();
    await env.DB.batch([
      env.DB.prepare("DELETE FROM product_keywords WHERE product_id=?").bind(id),
      env.DB.prepare("DELETE FROM product_options WHERE product_id=?").bind(id),
      env.DB.prepare("DELETE FROM product_variants WHERE product_id=?").bind(id),
      env.DB.prepare("DELETE FROM product_media WHERE product_id=?").bind(id),
      env.DB.prepare("DELETE FROM product_custom_fields WHERE product_id=?").bind(id),
    ]);
  } else {
    const result = await env.DB.prepare("INSERT INTO products (item_number,category_id,name,slug,description,specifications,price_agorot,wholesale_price_agorot,purchase_price_agorot,stock_quantity,active,featured,offer_price_agorot,view_count,order_count,rating_average_x100,rating_count,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,0,0,0,?,?)")
      .bind(itemNumber, categoryId, name, slug, asOptionalText(body.description), asOptionalText(body.specifications), agorot(body.price), nullableAgorot(body.wholesale), nullableAgorot(body.purchasePrice), Number(body.stock || 0), asBoolean(body.active) ? 1 : 0, asBoolean(body.featured) ? 1 : 0, nullableAgorot(body.oldPrice), now, now).run();
    productId = Number(result.meta.last_row_id);
  }
  if (!productId) return json({ error: "تعذر حفظ الصنف" }, { status: 500 });
  const customFields=(Array.isArray(body.customFields)?body.customFields as Array<Record<string,unknown>>:[]).slice(0,5).filter(field=>asText(field.label));
  if(customFields.length)await env.DB.batch(customFields.map((field,index)=>env.DB.prepare("INSERT INTO product_custom_fields (product_id,label,placeholder,max_length,required,sort_order) VALUES (?,?,?,?,?,?)").bind(productId,asText(field.label),asOptionalText(field.placeholder),Math.min(200,Math.max(1,Number(field.maxLength)||60)),asBoolean(field.required)?1:0,index)));
  const keywordList = asText(body.keywords).split(/[،,\n]+/).map((value) => value.trim()).filter(Boolean);
  if (keywordList.length) await env.DB.batch(keywordList.map((keyword) => env.DB.prepare("INSERT INTO product_keywords (product_id,keyword) VALUES (?,?)").bind(productId, keyword)));
  const media = Array.isArray(body.media) ? body.media as Array<Record<string, unknown>> : [];
  if (media.length) await env.DB.batch(media.map((item, index) => env.DB.prepare("INSERT INTO product_media (product_id,variant_id,media_type,url,alt_text,sort_order,is_primary,created_at,updated_at) VALUES (?,NULL,?,?,?,?,?,?,?)").bind(productId, item.type === "video" ? "video" : "image", asText(item.url), asOptionalText(item.altText), index, index === 0 && item.type !== "video" ? 1 : 0, now, now)));
  const variants = Array.isArray(body.variants) ? body.variants as Array<Record<string, unknown>> : [];
  let savedVariantImages = 0;
  if (variants.length) {
    const displayType = variants.some((variant) => variant.displayType === "color") ? "color" : "text";
    const optionResult = await env.DB.prepare("INSERT INTO product_options (product_id,name,display_type,sort_order) VALUES (?,?,?,0)").bind(productId, asText(body.variantName) || "الخيار", displayType).run();
    const optionId = Number(optionResult.meta.last_row_id);
    for (let index = 0; index < variants.length; index += 1) {
      const variant = variants[index];
      const valueResult = await env.DB.prepare("INSERT INTO product_option_values (option_id,value,color_hex,sort_order) VALUES (?,?,?,?)").bind(optionId, asText(variant.name), asOptionalText(variant.color), index).run();
      const variantResult = await env.DB.prepare("INSERT INTO product_variants (product_id,sku,price_agorot,wholesale_price_agorot,stock_quantity,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").bind(productId, asOptionalText(variant.sku), nullableAgorot(variant.price), nullableAgorot(variant.wholesale), Number(variant.stock || 0), 1, now, now).run();
      const variantId = Number(variantResult.meta.last_row_id);
      await env.DB.prepare("INSERT INTO variant_option_values (variant_id,option_value_id) VALUES (?,?)").bind(variantId, Number(valueResult.meta.last_row_id)).run();
      const variantImages = [...new Set(Array.isArray(variant.images) ? variant.images.map(asText).filter(Boolean) : asText(variant.image) ? [asText(variant.image)] : [])];
      if (variantImages.length) {
        await env.DB.batch(variantImages.map((url, mediaIndex) => env.DB.prepare("INSERT INTO product_media (product_id,variant_id,media_type,url,sort_order,is_primary,created_at,updated_at) VALUES (?,?,\"image\",?,?,?,?,?)").bind(productId, variantId, url, mediaIndex, mediaIndex === 0 ? 1 : 0, now, now)));
        savedVariantImages += variantImages.length;
      }
    }
  }
  return json({ ok: true, id: productId, itemNumber, savedVariantImages });
}

async function readOperations(env:Env){
  await ensureAnalyticsSchema(env);
  const [suppliers,purchases,items,customers,stats]=await Promise.all([
    env.DB.prepare("SELECT id,supplier_number,name,phone,address,notes,active FROM suppliers ORDER BY name").all(),
    env.DB.prepare("SELECT p.id,p.purchase_number,p.supplier_id,p.status,p.invoice_reference,p.purchased_at,p.total_agorot,p.notes,s.name AS supplier_name FROM purchases p LEFT JOIN suppliers s ON s.id=p.supplier_id WHERE p.deleted_at IS NULL ORDER BY p.purchased_at DESC,p.id DESC").all(),
    env.DB.prepare("SELECT id,purchase_id,product_id,variant_id,item_number,product_name,quantity,unit_cost_agorot,line_total_agorot,notes FROM purchase_items ORDER BY id").all(),
    env.DB.prepare("SELECT customer_name,phone,city,COUNT(*) AS orders_count,SUM(total_agorot) AS total_agorot,MAX(created_at) AS last_order_at FROM orders WHERE deleted_at IS NULL AND status!='cancelled' GROUP BY phone,customer_name,city ORDER BY last_order_at DESC").all(),
    env.DB.prepare("SELECT (SELECT COUNT(*) FROM orders WHERE deleted_at IS NULL) AS orders_count,(SELECT COUNT(*) FROM orders WHERE status='new' AND deleted_at IS NULL) AS new_orders,(SELECT COUNT(*) FROM products WHERE deleted_at IS NULL AND active=1) AS products_count,(SELECT COUNT(*) FROM products WHERE deleted_at IS NULL AND stock_quantity<=0 AND NOT EXISTS(SELECT 1 FROM product_variants v WHERE v.product_id=products.id AND v.stock_quantity>0 AND v.active=1)) AS out_of_stock,(SELECT COALESCE(SUM(total_agorot),0) FROM orders WHERE status IN ('confirmed','preparing','shipped','delivered') AND deleted_at IS NULL) AS sales_agorot").first<Record<string,unknown>>()
  ]);
  const purchaseItems=items.results as Array<Record<string,unknown>>;
  const now=Date.now(),today=analyticsDay(),day7=analyticsDay(new Date(now-6*86400000)),day30=analyticsDay(new Date(now-29*86400000));
  const [traffic,orderMetrics,recentResult,topResult,trafficChart,orderChart]=await Promise.all([
    env.DB.prepare("SELECT COUNT(DISTINCT CASE WHEN day=? THEN visitor_hash END) AS visitors_today,COUNT(DISTINCT CASE WHEN day>=? THEN visitor_hash END) AS visitors_7d,COUNT(DISTINCT CASE WHEN day>=? THEN visitor_hash END) AS visitors_30d,COALESCE(SUM(CASE WHEN day=? THEN views ELSE 0 END),0) AS views_today FROM store_daily_visitors").bind(today,day7,day30,today).first<Record<string,unknown>>(),
    env.DB.prepare("SELECT COUNT(CASE WHEN date(created_at/1000,\'unixepoch\',\'+3 hours\')=? THEN 1 END) AS orders_today,COALESCE(SUM(CASE WHEN date(created_at/1000,\'unixepoch\',\'+3 hours\')=? AND status!=\'cancelled\' THEN total_agorot ELSE 0 END),0) AS sales_today,COALESCE(SUM(CASE WHEN created_at>=? AND status!=\'cancelled\' THEN total_agorot ELSE 0 END),0) AS sales_30d,COUNT(CASE WHEN created_at>=? AND status!=\'cancelled\' THEN 1 END) AS orders_30d,COALESCE(AVG(CASE WHEN status!=\'cancelled\' THEN total_agorot END),0) AS average_order FROM orders WHERE deleted_at IS NULL").bind(today,today,now-30*86400000,now-30*86400000).first<Record<string,unknown>>(),
    env.DB.prepare("SELECT id,order_number,customer_name,total_agorot,status,created_at FROM orders WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 5").all(),
    env.DB.prepare("SELECT oi.item_number,oi.product_name,SUM(oi.quantity) AS quantity,SUM(oi.line_total_agorot) AS sales_agorot FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.deleted_at IS NULL AND o.status!='cancelled' GROUP BY oi.item_number,oi.product_name ORDER BY quantity DESC LIMIT 5").all(),
    env.DB.prepare("SELECT day,COUNT(DISTINCT visitor_hash) AS visitors,SUM(views) AS views FROM store_daily_visitors WHERE day>=? GROUP BY day ORDER BY day").bind(day7).all(),
    env.DB.prepare("SELECT date(created_at/1000,'unixepoch','+3 hours') AS day,COUNT(*) AS orders,COALESCE(SUM(CASE WHEN status!='cancelled' THEN total_agorot ELSE 0 END),0) AS sales_agorot FROM orders WHERE deleted_at IS NULL AND created_at>=? GROUP BY day ORDER BY day").bind(now-7*86400000).all()
  ]);
  const visitors30=Number(traffic?.visitors_30d||0),orders30=Number(orderMetrics?.orders_30d||0);
  return {
    suppliers:(suppliers.results as Array<Record<string,unknown>>).map(row=>({id:Number(row.id),supplierNumber:Number(row.supplier_number),name:String(row.name),phone:String(row.phone||""),address:String(row.address||""),notes:String(row.notes||""),active:Boolean(row.active)})),
    purchases:(purchases.results as Array<Record<string,unknown>>).map(row=>({id:Number(row.id),purchaseNumber:Number(row.purchase_number),supplierId:row.supplier_id==null?null:Number(row.supplier_id),supplierName:String(row.supplier_name||"بدون مورد"),status:String(row.status),invoiceReference:String(row.invoice_reference||""),purchasedAt:Number(row.purchased_at),total:Number(row.total_agorot)/100,notes:String(row.notes||""),items:purchaseItems.filter(item=>Number(item.purchase_id)===Number(row.id)).map(item=>({id:Number(item.id),productId:item.product_id==null?null:Number(item.product_id),variantId:item.variant_id==null?null:Number(item.variant_id),itemNumber:Number(item.item_number||0),productName:String(item.product_name),quantity:Number(item.quantity),unitCost:Number(item.unit_cost_agorot)/100,lineTotal:Number(item.line_total_agorot)/100,notes:String(item.notes||"")}))})),
    customers:(customers.results as Array<Record<string,unknown>>).map(row=>({name:String(row.customer_name||""),phone:String(row.phone||""),city:String(row.city||""),ordersCount:Number(row.orders_count),total:Number(row.total_agorot)/100,lastOrderAt:Number(row.last_order_at)})),
    stats:{ordersCount:Number(stats?.orders_count||0),newOrders:Number(stats?.new_orders||0),productsCount:Number(stats?.products_count||0),outOfStock:Number(stats?.out_of_stock||0),sales:Number(stats?.sales_agorot||0)/100,visitorsToday:Number(traffic?.visitors_today||0),visitors7d:Number(traffic?.visitors_7d||0),visitors30d:visitors30,pageviewsToday:Number(traffic?.views_today||0),ordersToday:Number(orderMetrics?.orders_today||0),salesToday:Number(orderMetrics?.sales_today||0)/100,sales30d:Number(orderMetrics?.sales_30d||0)/100,averageOrder:Number(orderMetrics?.average_order||0)/100,conversion30d:visitors30?Math.round(orders30/visitors30*1000)/10:0},
    recentOrders:(recentResult.results as Array<Record<string,unknown>>).map(row=>({id:Number(row.id),number:Number(row.order_number),customerName:String(row.customer_name),total:Number(row.total_agorot)/100,status:String(row.status),createdAt:Number(row.created_at)})),
    topProducts:(topResult.results as Array<Record<string,unknown>>).map(row=>({itemNumber:Number(row.item_number),name:String(row.product_name),quantity:Number(row.quantity),sales:Number(row.sales_agorot)/100})),
    chart:{traffic:trafficChart.results,orders:orderChart.results}
  };
}

async function saveSupplier(request:Request,env:Env,id?:number){const body=await parseJson(request),name=asText(body.name);if(!name)return json({error:"اسم المورد مطلوب"},{status:400});const number=Number(body.supplierNumber)||Number((await env.DB.prepare("SELECT COALESCE(MAX(supplier_number),1000)+1 AS next FROM suppliers").first<{next:number}>())?.next||1001),now=Date.now();if(id)await env.DB.prepare("UPDATE suppliers SET supplier_number=?,name=?,phone=?,address=?,notes=?,active=?,updated_at=? WHERE id=?").bind(number,name,asOptionalText(body.phone),asOptionalText(body.address),asOptionalText(body.notes),asBoolean(body.active)?1:0,now,id).run();else await env.DB.prepare("INSERT INTO suppliers (supplier_number,name,phone,address,notes,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").bind(number,name,asOptionalText(body.phone),asOptionalText(body.address),asOptionalText(body.notes),1,now,now).run();return json({ok:true});}

async function savePurchase(request:Request,env:Env,id?:number){const body=await parseJson(request),rows=Array.isArray(body.items)?body.items as Array<Record<string,unknown>>:[],valid=rows.map(item=>({productId:Number(item.productId),variantId:item.variantId?Number(item.variantId):null,quantity:Math.max(1,Number(item.quantity)||1),unitCost:agorot(item.unitCost),notes:asOptionalText(item.notes)})).filter(item=>item.productId>0&&item.unitCost>=0);if(!valid.length)return json({error:"أضف صنفاً واحداً على الأقل"},{status:400});const total=valid.reduce((sum,item)=>sum+item.quantity*item.unitCost,0),now=Date.now(),supplierId=body.supplierId?Number(body.supplierId):null,purchasedAt=Number(body.purchasedAt)||now;let purchaseId=id;if(id){const current=await env.DB.prepare("SELECT status FROM purchases WHERE id=? AND deleted_at IS NULL").bind(id).first<{status:string}>();if(!current)return json({error:"فاتورة المشتريات غير موجودة"},{status:404});if(current.status==="posted")return json({error:"الفاتورة المرحلة لا يمكن تعديلها"},{status:409});await env.DB.prepare("UPDATE purchases SET supplier_id=?,invoice_reference=?,purchased_at=?,total_agorot=?,notes=?,updated_at=? WHERE id=?").bind(supplierId,asOptionalText(body.invoiceReference),purchasedAt,total,asOptionalText(body.notes),now,id).run();await env.DB.prepare("DELETE FROM purchase_items WHERE purchase_id=?").bind(id).run()}else{const number=Number((await env.DB.prepare("SELECT COALESCE(MAX(purchase_number),1000)+1 AS next FROM purchases").first<{next:number}>())?.next||1001),result=await env.DB.prepare("INSERT INTO purchases (purchase_number,supplier_id,status,invoice_reference,purchased_at,total_agorot,notes,created_at,updated_at) VALUES (?,?,'draft',?,?,?,?,?,?)").bind(number,supplierId,asOptionalText(body.invoiceReference),purchasedAt,total,asOptionalText(body.notes),now,now).run();purchaseId=Number(result.meta.last_row_id)}if(!purchaseId)return json({error:"تعذر حفظ الفاتورة"},{status:500});for(const item of valid){const product=await env.DB.prepare("SELECT item_number,name FROM products WHERE id=? AND deleted_at IS NULL").bind(item.productId).first<{item_number:number;name:string}>();if(!product)return json({error:"أحد الأصناف غير موجود"},{status:400});await env.DB.prepare("INSERT INTO purchase_items (purchase_id,product_id,variant_id,item_number,product_name,quantity,unit_cost_agorot,line_total_agorot,notes) VALUES (?,?,?,?,?,?,?,?,?)").bind(purchaseId,item.productId,item.variantId,product.item_number,product.name,item.quantity,item.unitCost,item.quantity*item.unitCost,item.notes).run()}return json({ok:true,id:purchaseId});}

async function postPurchase(env:Env,id:number){const purchase=await env.DB.prepare("SELECT status FROM purchases WHERE id=? AND deleted_at IS NULL").bind(id).first<{status:string}>();if(!purchase)return json({error:"الفاتورة غير موجودة"},{status:404});if(purchase.status!=="draft")return json({error:"تم ترحيل هذه الفاتورة مسبقاً"},{status:409});const items=await env.DB.prepare("SELECT product_id,variant_id,quantity,unit_cost_agorot FROM purchase_items WHERE purchase_id=?").bind(id).all(),now=Date.now(),statements:D1PreparedStatement[]=[];for(const item of items.results as Array<Record<string,unknown>>){if(item.variant_id!=null)statements.push(env.DB.prepare("UPDATE product_variants SET stock_quantity=stock_quantity+?,purchase_price_agorot=?,updated_at=? WHERE id=?").bind(Number(item.quantity),Number(item.unit_cost_agorot),now,Number(item.variant_id)));else statements.push(env.DB.prepare("UPDATE products SET stock_quantity=stock_quantity+?,purchase_price_agorot=?,updated_at=? WHERE id=?").bind(Number(item.quantity),Number(item.unit_cost_agorot),now,Number(item.product_id)))}statements.push(env.DB.prepare("UPDATE purchases SET status='posted',updated_at=? WHERE id=?").bind(now,id));await env.DB.batch(statements);return json({ok:true});}

async function importProducts(request:Request,env:Env){const body=await parseJson(request),rows=Array.isArray(body.rows)?body.rows as Array<Record<string,unknown>>:[];if(!rows.length||rows.length>2000)return json({error:"الملف فارغ أو يتجاوز 2000 صنف"},{status:400});let created=0,updated=0;for(const row of rows){const name=asText(row.name),categoryNumber=Number(row.categoryNumber),price=Number(row.price),itemNumber=Number(row.itemNumber);if(!name||!categoryNumber||!Number.isFinite(price))continue;const category=await env.DB.prepare("SELECT id FROM categories WHERE category_number=?").bind(categoryNumber).first<{id:number}>();if(!category)continue;const existing=itemNumber?await env.DB.prepare("SELECT id FROM products WHERE item_number=? AND deleted_at IS NULL").bind(itemNumber).first<{id:number}>():null;const payload=new Request(request.url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({itemNumber,name,categoryId:category.id,price,wholesale:row.wholesale,purchasePrice:row.purchasePrice,stock:Number(row.stock||0),keywords:row.keywords,description:row.description,active:true,featured:false,variants:[],media:[]})});await saveProduct(payload,env,existing?.id);if(existing)updated++;else created++}return json({ok:true,created,updated});}


function isImportedErrorName(value: unknown): boolean {
  return /^(?:forbidden|403\\s+forbidden|404\\s+not found|access denied)$/i.test(String(value ?? "").trim());
}
function cleanCatalogDescription(value: unknown): string {
  const text = String(value ?? "").trim();
  // Supplier error pages can be imported as descriptions; never publish them.
  if (/you (?:don't|do not|don’t) have permission to access this resource|additionally, a 403|^403\\s*(?:forbidden)?$/i.test(text)) return "";
  return text;
}
function xmlEscape(value:string){return value.replace(/[<>&'"]/g,character=>({"<":"&lt;",">":"&gt;","&":"&amp;","'":"&apos;",'"':"&quot;"}[character]||character))}
function htmlEscape(value:string){return value.replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]||character))}
function absoluteStoreUrl(value:string,origin:string){if(!value)return origin+"/og.png";try{return new URL(value,origin).toString()}catch{return origin+"/og.png"}}
function securityHeaders(headers:Headers){
  headers.set("x-content-type-options","nosniff");
  headers.set("x-frame-options","DENY");
  headers.set("referrer-policy","strict-origin-when-cross-origin");
  headers.set("permissions-policy","camera=(), microphone=(), geolocation=()");
  headers.set("content-security-policy","frame-ancestors 'none'");
  return headers;
}
async function publicSeoRoute(request:Request,env:Env,url:URL):Promise<Response|null>{
  if(env.APP_SURFACE!=="storefront"||request.method!=="GET")return null;
  if(url.pathname==="/robots.txt"){
    const body="User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /account\nSitemap: "+url.origin+"/sitemap.xml\n";
    return new Response(body,{headers:securityHeaders(new Headers({"content-type":"text/plain; charset=utf-8","cache-control":"public, max-age=3600"}))});
  }
  if(url.pathname==="/google-merchant-feed.xml"){
    const catalog=await readCatalog(env,false);
    const products=catalog.products.filter(product=>product.active&&!isImportedErrorName(product.name)&&Number(product.price)>0&&Boolean(product.image));
    const clean=(value:unknown)=>String(value??"").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g," ").trim();
    const items=products.map(product=>{
      const title=clean(product.name).slice(0,150);
      const description=clean(product.description||product.specifications||product.name).slice(0,5000);
      const link=url.origin+"/product/"+Number(product.id);
      const image=absoluteStoreUrl(String(product.image||""),url.origin);
      const availability=product.inStock?"in_stock":"out_of_stock";
      const id=clean(product.itemNumber||product.id);
      return "    <item>\n"+
        "      <g:id>"+xmlEscape(id)+"</g:id>\n"+
        "      <g:title>"+xmlEscape(title)+"</g:title>\n"+
        "      <g:description>"+xmlEscape(description)+"</g:description>\n"+
        "      <g:link>"+xmlEscape(link)+"</g:link>\n"+
        "      <g:image_link>"+xmlEscape(image)+"</g:image_link>\n"+
        "      <g:availability>"+availability+"</g:availability>\n"+
        "      <g:price>"+Number(product.price).toFixed(2)+" ILS</g:price>\n"+
        "      <g:condition>new</g:condition>\n"+
        "      <g:brand>Manar Store</g:brand>\n"+
        "      <g:identifier_exists>false</g:identifier_exists>\n"+
        "    </item>";
    }).join("\n");
    const body='<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n  <channel>\n    <title>Manar Store</title>\n    <link>'+xmlEscape(url.origin)+'</link>\n    <description>منتجات منار ستور</description>\n'+items+'\n  </channel>\n</rss>';
    return new Response(body,{headers:securityHeaders(new Headers({"content-type":"application/xml; charset=utf-8","cache-control":"public, max-age=900, s-maxage=1800"}))});
  }
  if(url.pathname!=="/sitemap.xml")return null;
  const [products,categories]=await Promise.all([
    env.DB.prepare("SELECT id,updated_at FROM products WHERE active=1 AND deleted_at IS NULL AND lower(trim(name)) NOT IN ('forbidden','403 forbidden','404 not found','access denied') ORDER BY id").all<{id:number;updated_at:number}>(),
    env.DB.prepare("SELECT slug,updated_at FROM categories WHERE active=1 ORDER BY id").all<{slug:string;updated_at:number}>()
  ]);
  const pages:Array<{loc:string;lastmod?:number}>=[{loc:url.origin+"/"}];
  for(const row of categories.results)pages.push({loc:url.origin+"/category/"+encodeURIComponent(row.slug),lastmod:Number(row.updated_at||0)});
  for(const row of products.results)pages.push({loc:url.origin+"/product/"+Number(row.id),lastmod:Number(row.updated_at||0)});
  pages.push({loc:url.origin+"/policies/terms"});
  pages.push({loc:url.origin+"/privacy"});
  const body='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+pages.map(page=>"  <url><loc>"+xmlEscape(page.loc)+"</loc>"+(page.lastmod?"<lastmod>"+new Date(page.lastmod).toISOString()+"</lastmod>":"")+"</url>").join("\n")+"\n</urlset>";
  return new Response(body,{headers:securityHeaders(new Headers({"content-type":"application/xml; charset=utf-8","cache-control":"public, max-age=1800"}))});
}
async function storefrontSeo(env:Env,url:URL):Promise<string>{
  await ensureStorefrontColumns(env);
  const settings=await env.DB.prepare("SELECT store_name,site_name_ar,site_name_en,seo_description,logo_url,favicon_url FROM store_settings WHERE id=1").first<{store_name:string;site_name_ar:string;site_name_en:string;seo_description:string;logo_url:string;favicon_url:string}>();
  const storeName=String(settings?.site_name_ar||settings?.store_name||"منار بارتي ستور");
  const alternateName=String(settings?.site_name_en||"Manar Party Store");
  const homeTitle=storeName+" | "+alternateName;
  const homeDescription=String(settings?.seo_description||"قطع وإكسسوارات التوزيعات بالجملة والتجزئة");
  const favicon=absoluteStoreUrl((url.hostname==="manarstore.ps"||url.hostname==="www.manarstore.ps")?"/favicon.png":String(settings?.favicon_url||settings?.logo_url||"/og.png"),url.origin);
  const cleanPath=url.pathname!=="/"&&url.pathname.endsWith("/")?url.pathname.slice(0,-1):url.pathname;
  let canonicalUrl=url.origin+cleanPath;
  let robots="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";
  let title=homeTitle,description=homeDescription,image=absoluteStoreUrl(String(settings?.logo_url||"/og.png"),url.origin),type="website",jsonLd:Record<string,unknown>={"@context":"https://schema.org","@type":"WebSite",name:storeName,alternateName,url:url.origin+"/",description:homeDescription};
  const productMatch=url.pathname.match(/^\/product\/(\d+)\/?$/);
  if(productMatch){
    const value=Number(productMatch[1]);
    const product=await env.DB.prepare("SELECT p.id,p.item_number,p.name,p.description,p.price_agorot,(p.stock_quantity>0 OR EXISTS(SELECT 1 FROM product_variants v WHERE v.product_id=p.id AND v.active=1 AND v.stock_quantity>0)) AS available,(SELECT url FROM product_media m WHERE m.product_id=p.id AND m.media_type='image' ORDER BY m.is_primary DESC,m.sort_order,m.id LIMIT 1) AS image_url FROM products p WHERE p.id=? AND p.active=1 AND p.deleted_at IS NULL LIMIT 1").bind(value).first<Record<string,unknown>>();
    if(product&&!isImportedErrorName(product.name)){
      const name=String(product.name),price=(Number(product.price_agorot||0)/100).toFixed(2);
      title=name+" – "+storeName;
      description=cleanCatalogDescription(product.description).replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim().slice(0,155)||name+" متوفر لدى "+storeName+" بسعر "+price+" شيكل.";
      canonicalUrl=url.origin+"/product/"+Number(product.id);
      image=absoluteStoreUrl(String(product.image_url||""),url.origin);type="product";
      jsonLd={"@context":"https://schema.org","@type":"Product",name,sku:String(product.item_number),image:[image],description,url:canonicalUrl,offers:{"@type":"Offer",priceCurrency:"ILS",price,availability:Boolean(product.available)?"https://schema.org/InStock":"https://schema.org/OutOfStock",url:canonicalUrl}};
    }else{
      title="الصنف غير موجود – "+storeName;
      description="هذا الصنف غير متوفر حاليًا. تصفّح المنتجات المتاحة في "+storeName+".";
      robots="noindex,follow";
    }
  }else{
    const categoryMatch=url.pathname.match(/^\/category\/([^/]+)\/?$/);
    if(categoryMatch){
      const slug=decodeURIComponent(categoryMatch[1]);
      const category=await env.DB.prepare("SELECT name,description,banner_url FROM categories WHERE slug=? AND active=1 LIMIT 1").bind(slug).first<Record<string,unknown>>();
      if(category){
        const name=String(category.name);title=name+" – "+storeName;
        description=String(category.description||"").trim().slice(0,155)||"تصفّح منتجات قسم "+name+" في "+storeName+".";
        image=absoluteStoreUrl(String(category.banner_url||settings?.logo_url||"/og.png"),url.origin);
        jsonLd={"@context":"https://schema.org","@type":"CollectionPage",name,description,url:canonicalUrl,image};
      }
    }
  }
  const safeJson=JSON.stringify(jsonLd).replace(/</g,"\\u003c");
  return '<title>'+htmlEscape(title)+'</title><meta name="description" content="'+htmlEscape(description)+'"><meta name="robots" content="'+robots+'"><link rel="icon" href="'+htmlEscape(favicon)+'"><link rel="apple-touch-icon" href="'+htmlEscape(favicon)+'"><meta property="og:site_name" content="'+htmlEscape(storeName)+'"><link rel="canonical" href="'+htmlEscape(canonicalUrl)+'"><meta property="og:title" content="'+htmlEscape(title)+'"><meta property="og:description" content="'+htmlEscape(description)+'"><meta property="og:type" content="'+type+'"><meta property="og:url" content="'+htmlEscape(canonicalUrl)+'"><meta property="og:image" content="'+htmlEscape(image)+'"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="'+htmlEscape(title)+'"><meta name="twitter:description" content="'+htmlEscape(description)+'"><meta name="twitter:image" content="'+htmlEscape(image)+'"><script type="application/ld+json">'+safeJson+'</script>';
}
function injectSeo(html:string,head:string){
  return html.replace(/<title[^>]*>[\s\S]*?<\/title>/i,"").replace(/<meta[^>]+(?:name=["']description["']|property=["']og:[^"']+["']|name=["']twitter:[^"']+["'])[^>]*>/gi,"").replace(/<link[^>]+rel=["'](?:canonical|icon|apple-touch-icon)["'][^>]*>/gi,"").replace("</head>",head+"</head>");
}

async function api(request: Request, env: Env, url: URL,ctx:ExecutionContext): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/product-images/product-2222-edited.webp") {
    const binary = atob(product2222ImageBase64);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    return new Response(bytes, { headers: { "content-type": "image/webp", "cache-control": "public, max-age=31536000, immutable" } });
  }
  if(request.method==="GET"&&url.pathname==="/api/seo"&&env.APP_SURFACE==="storefront"){
    const path=url.searchParams.get("path")||"/";
    if(!path.startsWith("/")||path.startsWith("//")||path.includes("\\\\")||path.length>500)return json({error:"Invalid path"},{status:400});
    const target=new URL(path,url.origin);
    if(target.origin!==url.origin)return json({error:"Invalid path"},{status:400});
    return json({head:await storefrontSeo(env,target)},{headers:{"cache-control":"no-store"}});
  }
  if (request.method === "GET" && url.pathname === "/api/catalog") return publicJson(await readCatalog(env, false));
  if (request.method === "GET" && url.pathname === "/api/storefront") return publicJson(await readStorefront(env));
  if (request.method === "GET" && url.pathname === "/api/policies") return publicJson({policies:await readPolicies(env)});
  if (request.method === "GET" && url.pathname === "/api/shipping-zones") return publicJson({zones:await readShippingZones(env)});
  if(request.method==="POST"&&url.pathname==="/api/analytics/cart"&&env.APP_SURFACE==="storefront")return recordCart(request,env.DB);
  if (request.method === "POST" && url.pathname === "/api/analytics/visit") return trackStoreVisit(request,env);
  const productViewMatch=url.pathname.match(/^\/api\/products\/(\d+)\/view$/);
  if(request.method==="POST"&&productViewMatch)return trackProductView(request,env,Number(productViewMatch[1]));
  const highlightImageViewMatch=url.pathname.match(/^\/api\/highlights\/(\d+)\/images\/(\d+)\/view$/);
  if(request.method==="POST"&&highlightImageViewMatch)return trackHighlightImageView(request,env,Number(highlightImageViewMatch[1]),Number(highlightImageViewMatch[2]));
  const highlightViewMatch=url.pathname.match(/^\/api\/highlights\/(\d+)\/view$/);
  if(request.method==="POST"&&highlightViewMatch)return trackHighlightView(request,env,Number(highlightViewMatch[1]));
  if (request.method === "POST" && url.pathname === "/api/orders") return createOrder(request,env,ctx);
  if(url.pathname.startsWith("/api/push/")&&env.APP_SURFACE==="storefront"){
    await ensureCustomerAuthSchema(env);
    if(request.method==="POST"&&!await customerRateLimit(env,"push:"+await sha256(request.headers.get("cf-connecting-ip")||"unknown"),100,3600000))return json({error:"انتظر قليلًا ثم أعد المحاولة"},{status:429});
    const account=await getCustomerAccount(request,env),response=await pushApi(request,env,"customer",account?.id||null);
    if(response?.ok&&url.pathname.endsWith("/test"))ctx.waitUntil(drainPushQueue(env).catch(()=>console.error("push_failed")));
    return response;
  }
  if (url.pathname.startsWith("/api/account/")) return customerApi(request,env,url);
  if (request.method === "GET" && url.pathname === "/media") return json({ error: "Not Found" }, { status: 404 });
  if (request.method === "GET" && url.pathname.startsWith("/media/")) {
    const key = decodeURIComponent(url.pathname.slice(7));
    const rangeHeader = request.headers.get("range");
    let object = await env.MEDIA.get(key, rangeHeader ? { range: request.headers } : undefined);
    if (!object && importedMediaSources.has(key)) {
      let remote: Response | null = null;
      for (const source of importedMediaSources.get(key) || []) {
        const candidate = await fetch(source, { headers: { accept: "image/*", "user-agent": "ManarStore/1.0" } });
        if (candidate.ok && candidate.headers.get("content-type")?.startsWith("image/")) { remote = candidate; break; }
      }
      if (remote) {
        const bytes = await remote.arrayBuffer();
        const contentType = remote.headers.get("content-type")?.split(";")[0] || "image/jpeg";
        await env.MEDIA.put(key, bytes, { httpMetadata: { contentType } });
        return new Response(bytes, { headers: { "content-type": contentType, "cache-control": "public, max-age=31536000, immutable" } });
      }
    }
    if (!object) return new Response("Not Found", { status: 404 });
    const headers = new Headers(); object.writeHttpMetadata(headers); headers.set("etag", object.httpEtag); headers.set("cache-control", "public, max-age=31536000, immutable");
    headers.set("accept-ranges", "bytes");
    if (rangeHeader && object.range) {
      headers.set("content-range", `bytes ${object.range.offset}-${object.range.offset + object.range.length - 1}/${object.size}`);
      headers.set("content-length", String(object.range.length));
      return new Response(object.body, { status: 206, headers });
    }
    return new Response(object.body, { headers });
  }
  if (!url.pathname.startsWith("/api/admin/")) return null;
  if (env.APP_SURFACE !== "admin") return json({ error: "Not Found" }, { status: 404 });
  if(request.method==="GET"&&url.pathname==="/api/admin/navigation"){await ensureHighlightSchema(env);const row=await env.DB.prepare("SELECT (SELECT COUNT(*) FROM orders WHERE deleted_at IS NULL) AS orders,(SELECT COUNT(*) FROM orders WHERE deleted_at IS NULL AND status='new') AS newOrders,(SELECT COUNT(*) FROM categories) AS categories,(SELECT COUNT(*) FROM store_highlights) AS highlights").first<{orders:number;newOrders:number;categories:number;highlights:number}>();return json(row||{orders:0,newOrders:0,categories:0,highlights:0},{headers:{"cache-control":"no-store"}});}
  if(request.method==="GET"&&url.pathname==="/api/admin/dashboard"){await ensureAnalyticsSchema(env);const days=Number(url.searchParams.get("days")||30);if(![7,30,90].includes(days))return json({error:"الفترة غير صالحة"},{status:400});return json(await readAdminDashboard(env.DB,days),{headers:{"cache-control":"no-store"}});}
  if(request.method==="GET"&&url.pathname==="/api/admin/cart-metrics")return json({...await readCartMetrics(env.DB),...await readCartDetails(env.DB)},{headers:{"cache-control":"no-store"}});
  if(url.pathname.startsWith("/api/admin/push/")){
    if(request.method==="GET"&&url.pathname.endsWith("/summary"))return json(await pushAdminSummary(env));
    const response=url.pathname.endsWith("/campaign")&&request.method==="POST"?await queueCampaign(request,env):await pushApi(request,env,"admin",null);
    if(response?.ok&&(url.pathname.endsWith("/test")||url.pathname.endsWith("/campaign")))ctx.waitUntil(drainPushQueue(env).catch(()=>console.error("push_failed")));
    return response;
  }
  if (request.method === "GET" && url.pathname === "/api/admin/catalog") return json(await readCatalog(env, true));
  if (request.method === "GET" && url.pathname === "/api/admin/shipping-zones") return json({zones:await readShippingZones(env,true)});
  if (request.method === "PUT" && url.pathname === "/api/admin/shipping-zones") return saveShippingZones(request,env);
  if (request.method === "GET" && url.pathname === "/api/admin/operations") return json(await readOperations(env));
  if (request.method === "POST" && url.pathname === "/api/admin/import-products") return importProducts(request,env);
  if (request.method === "POST" && url.pathname === "/api/admin/suppliers") return saveSupplier(request,env);
  const supplierMatch=url.pathname.match(/^\/api\/admin\/suppliers\/(\d+)$/);
  if(supplierMatch&&request.method==="PUT")return saveSupplier(request,env,Number(supplierMatch[1]));
  if(supplierMatch&&request.method==="DELETE"){await env.DB.prepare("UPDATE suppliers SET active=0,updated_at=? WHERE id=?").bind(Date.now(),Number(supplierMatch[1])).run();return json({ok:true});}
  if (request.method === "POST" && url.pathname === "/api/admin/purchases") return savePurchase(request,env);
  const purchaseMatch=url.pathname.match(/^\/api\/admin\/purchases\/(\d+)$/);
  if(purchaseMatch&&request.method==="PUT")return savePurchase(request,env,Number(purchaseMatch[1]));
  if(purchaseMatch&&request.method==="DELETE"){await env.DB.prepare("UPDATE purchases SET deleted_at=?,updated_at=? WHERE id=? AND status='draft'").bind(Date.now(),Date.now(),Number(purchaseMatch[1])).run();return json({ok:true});}
  const postPurchaseMatch=url.pathname.match(/^\/api\/admin\/purchases\/(\d+)\/post$/);
  if(postPurchaseMatch&&request.method==="POST")return postPurchase(env,Number(postPurchaseMatch[1]));
  if (request.method === "GET" && url.pathname === "/api/admin/orders") return json({orders:await readOrders(env)});
  const orderMatch=url.pathname.match(/^\/api\/admin\/orders\/(\d+)$/);
  if(orderMatch&&request.method==="PUT")return updateOrder(request,env,Number(orderMatch[1]),ctx);
  if (request.method === "GET" && url.pathname === "/api/admin/storefront") return json(await readStorefront(env));
  if (request.method === "GET" && url.pathname === "/api/admin/policies") return json({policies:await readPolicies(env)});
  if (request.method === "PUT" && url.pathname === "/api/admin/policies") return savePolicies(request,env);
  if (request.method === "GET" && url.pathname === "/api/admin/highlights") return json(await readHighlights(env,true));
  if (request.method === "PUT" && url.pathname === "/api/admin/highlights/visibility"){
    await ensureHighlightSchema(env);
    const body=await parseJson(request);
    await env.DB.prepare("INSERT INTO highlight_visibility (id,enabled) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled").bind(asBoolean(body.enabled)?1:0).run();
    return json({ok:true});
  }
  if (request.method === "PUT" && url.pathname === "/api/admin/highlights/duration"){
    await ensureHighlightSchema(env);
    const body=await parseJson(request),intervalMs=Number(body.intervalMs);
    if(!Number.isInteger(intervalMs)||intervalMs<2000||intervalMs>20000)return json({error:"مدة العرض يجب أن تكون بين ثانيتين و20 ثانية"},{status:400});
    await env.DB.prepare("INSERT INTO highlight_visibility (id,interval_ms) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET interval_ms=excluded.interval_ms").bind(intervalMs).run();
    return json({ok:true});
  }
  if (request.method === "POST" && url.pathname === "/api/admin/highlights") return saveHighlight(request,env);
  const highlightMatch=url.pathname.match(/^\/api\/admin\/highlights\/(\d+)$/);
  if(highlightMatch&&request.method==="PUT")return saveHighlight(request,env,Number(highlightMatch[1]));
  if(highlightMatch&&request.method==="DELETE"){
    await ensureHighlightSchema(env);
    await env.DB.prepare("DELETE FROM store_highlights WHERE id=?").bind(Number(highlightMatch[1])).run();
    return json({ok:true});
  }
  if (request.method === "PUT" && url.pathname === "/api/admin/settings") return saveSettings(request,env);
  if (request.method === "POST" && url.pathname === "/api/admin/sliders") return saveSlide(request,env);
  if (request.method === "PUT" && url.pathname === "/api/admin/popup") return savePopup(request,env);
  const slideMatch=url.pathname.match(/^\/api\/admin\/sliders\/(\d+)$/);
  if(slideMatch&&request.method==="PUT")return saveSlide(request,env,Number(slideMatch[1]));
  if(slideMatch&&request.method==="DELETE"){await env.DB.prepare("DELETE FROM sliders WHERE id=?").bind(Number(slideMatch[1])).run();return json({ok:true});}
  if (request.method === "POST" && url.pathname === "/api/admin/categories") return saveCategory(request, env);
  const categoryMatch = url.pathname.match(/^\/api\/admin\/categories\/(\d+)$/);
  if (categoryMatch && request.method === "PUT") return saveCategory(request, env, Number(categoryMatch[1]));
  if (categoryMatch && request.method === "DELETE") { await env.DB.prepare("DELETE FROM categories WHERE id=?").bind(Number(categoryMatch[1])).run(); return json({ ok: true }); }
  if (request.method === "POST" && url.pathname === "/api/admin/products") return saveProduct(request, env);
  const featuredMatch=url.pathname.match(/^\/api\/admin\/products\/(\d+)\/featured$/);
  if(featuredMatch&&request.method==="PATCH"){
    const body=await parseJson(request);
    await env.DB.prepare("UPDATE products SET featured=?,updated_at=? WHERE id=? AND deleted_at IS NULL").bind(asBoolean(body.featured)?1:0,Date.now(),Number(featuredMatch[1])).run();
    return json({ok:true});
  }
  const productMatch = url.pathname.match(/^\/api\/admin\/products\/(\d+)$/);
  if (productMatch && request.method === "PUT") return saveProduct(request, env, Number(productMatch[1]));
  if (productMatch && request.method === "DELETE") { await env.DB.prepare("UPDATE products SET deleted_at=?, active=0 WHERE id=?").bind(Date.now(), Number(productMatch[1])).run(); return json({ ok: true }); }
  if (request.method === "POST" && url.pathname === "/api/admin/ai-image") {
    const body = await parseJson(request);
    const imageUrl = asText(body.imageUrl);
    const inputImageBase64 = asText(body.inputImageBase64);
    if (!imageUrl.startsWith("/media/")) return json({ error: "هذه الصورة غير قابلة للمعالجة حالياً" }, { status: 400 });
    if (!inputImageBase64 || inputImageBase64.length > 2_000_000 || !/^[A-Za-z0-9+/=]+$/.test(inputImageBase64)) return json({ error: "بيانات الصورة المصغرة غير صحيحة" }, { status: 400 });
    let inputBytes: Uint8Array;
    try {
      const binary = atob(inputImageBase64);
      inputBytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    } catch {
      return json({ error: "تعذر قراءة الصورة المصغرة" }, { status: 400 });
    }
    const result = await env.AI.run("@cf/bria/background-removal", { image: Array.from(inputBytes) });
    const output = result instanceof ReadableStream ? await new Response(result).arrayBuffer() : result instanceof ArrayBuffer ? result : result instanceof Uint8Array ? result.buffer as ArrayBuffer : null;
    if (!output || !output.byteLength) return json({ error: "لم يرجع نموذج إزالة الخلفية صورة" }, { status: 502 });
    const outputKey = `ai-previews/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.png`;
    await env.MEDIA.put(outputKey, output, { httpMetadata: { contentType: "image/png" } });
    return json({ url: `/media/${encodeURIComponent(outputKey)}` });
  }
  if (request.method === "POST" && url.pathname === "/api/admin/media/source") {
    const body=await parseJson(request),source=asText(body.url);
    let target:URL;try{target=new URL(source)}catch{return json({error:"رابط الصورة غير صحيح"},{status:400})}
    const blocked=(value:URL)=>value.protocol!=="https:"||Boolean(value.username||value.password)||value.hostname==="localhost"||value.hostname.endsWith(".local")||value.hostname.endsWith(".internal")||/^\[.*\]$/.test(value.hostname)||/^\d{1,3}(\.\d{1,3}){3}$/.test(value.hostname);
    if(blocked(target))return json({error:"يجب استخدام رابط صورة HTTPS عام"},{status:400});
    let remote:Response|null=null;
    for(let redirect=0;redirect<4;redirect++){
      remote=await fetch(target.toString(),{headers:{accept:"image/*","user-agent":"ManarStore/1.0"},redirect:"manual"});
      if(remote.status<300||remote.status>=400)break;
      const location=remote.headers.get("location");if(!location)return json({error:"تعذر متابعة رابط الصورة"},{status:400});
      target=new URL(location,target);if(blocked(target))return json({error:"تحويل رابط الصورة غير مسموح"},{status:400});
    }
    if(!remote?.ok)return json({error:"تعذر تنزيل الصورة من الرابط"},{status:400});
    const type=remote.headers.get("content-type")?.split(";")[0]||"";
    if(!type.startsWith("image/")||type==="image/svg+xml")return json({error:"الرابط لا يحتوي على صورة مدعومة"},{status:400});
    const declared=Number(remote.headers.get("content-length")||0);if(declared>12_000_000)return json({error:"حجم الصورة يتجاوز 12MB"},{status:413});
    const bytes=await remote.arrayBuffer();if(bytes.byteLength>12_000_000)return json({error:"حجم الصورة يتجاوز 12MB"},{status:413});
    return new Response(bytes,{headers:{"content-type":type,"cache-control":"no-store"}});
  }
  if (request.method === "POST" && url.pathname === "/api/admin/media") {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (!contentLength || contentLength > 52_000_000) return json({ error: "حجم الملف غير مسموح" }, { status: 413 });
    const form = await request.formData(); const file = form.get("file");
    if (!(file instanceof File)) return json({ error: "الملف مطلوب" }, { status: 400 });
    const allowed = file.type.startsWith("image/") || file.type.startsWith("video/");
    if (!allowed) return json({ error: "نوع الملف غير مدعوم" }, { status: 400 });
    if (file.type.startsWith("image/") && file.size > 12_000_000) return json({ error: "حجم الصورة يتجاوز 12MB" }, { status: 413 });
    if (file.type.startsWith("video/") && file.size > 50_000_000) return json({ error: "حجم الفيديو يتجاوز 50MB" }, { status: 413 });
    const extension = file.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") || (file.type.startsWith("video/") ? "mp4" : "webp");
    const key = `products/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${extension}`;
    await env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
    return json({ url: `/media/${encodeURIComponent(key)}` });
  }
  return json({ error: "Not Found" }, { status: 404 });
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async scheduled(_event:unknown,env:Env,ctx:ExecutionContext){ctx.waitUntil(drainPushQueue(env).catch(()=>console.error("scheduled_push_failed")))},
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if(env.APP_SURFACE==="storefront"&&(url.hostname==="manarstore.ps"||url.hostname==="www.manarstore.ps")&&(url.protocol!=="https:"||url.hostname!=="manarstore.ps")){
      const target=new URL(url);target.protocol="https:";target.hostname="manarstore.ps";
      return Response.redirect(target.toString(),308);
    }
    const isAdminPath = url.pathname === "/admin" || url.pathname.startsWith("/admin/");

    if (env.APP_SURFACE === "admin" && url.pathname === "/robots.txt") {
      return new Response("User-agent: *\nDisallow: /\n", {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "public, max-age=3600",
          "x-robots-tag": "noindex, nofollow, noarchive",
        },
      });
    }

    if (env.APP_SURFACE === "storefront" && isAdminPath) {
      return new Response("Not Found", {
        status: 404,
        headers: { "cache-control": "no-store" },
      });
    }

    if (env.APP_SURFACE === "admin" && url.pathname === "/") {
      return Response.redirect(new URL("/admin", request.url), 302);
    }

    try {
      const seoRouteResponse=await publicSeoRoute(request,env,url);
      if(seoRouteResponse)return seoRouteResponse;
      const cacheablePublicApi = request.method === "GET" && url.pathname === "/api/catalog";
      if (cacheablePublicApi) {
        const cache = caches.default;
        const cacheKey = new Request(url.toString(), { method: "GET" });
        const cached = await cache.match(cacheKey);
        if (cached) return cached;
        const apiResponse = await api(request, env, url,ctx);
        if (apiResponse) {
          ctx.waitUntil(cache.put(cacheKey, apiResponse.clone()));
          return apiResponse;
        }
      }
      const apiResponse = await api(request, env, url,ctx);
      if (apiResponse) return apiResponse;
    } catch (error) {
      console.error(JSON.stringify({ event: "api_error", path: url.pathname, message: error instanceof Error ? error.message : "unknown" }));
      return json({ error: error instanceof Error ? error.message : "حدث خطأ غير متوقع" }, { status: 500 });
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    const appResponse=await handler.fetch(request, env, ctx);
    const headers=securityHeaders(new Headers(appResponse.headers));
    if(env.APP_SURFACE==="admin")headers.set("x-robots-tag","noindex, nofollow, noarchive");
    if(request.method==="GET"&&headers.get("content-type")?.includes("text/html")){
      const html=await appResponse.text();
      const head=env.APP_SURFACE==="storefront"
        ?(await storefrontSeo(env,url))+googleAnalyticsHead+(await readMetaPixelHead(env,url))
        :'<title>لوحة إدارة Manar Store</title><meta name="description" content="لوحة إدارة المتجر"><meta name="robots" content="noindex,nofollow">';
      headers.delete("content-length");headers.delete("content-encoding");
      const seoData=env.APP_SURFACE==="storefront"?'<script id="storefront-seo" type="application/json">'+JSON.stringify({path:url.pathname,head}).replace(/</g,"\\u003c")+'</script>':"";
      return new Response(injectSeo(html,head+seoData),{status:appResponse.status,statusText:appResponse.statusText,headers});
    }
    return new Response(appResponse.body,{status:appResponse.status,statusText:appResponse.statusText,headers});
  },
};

export default worker;


