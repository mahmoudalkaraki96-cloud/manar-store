/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
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
  APP_SURFACE?: "storefront" | "admin";
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface D1Meta { last_row_id?: number | string }
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
async function ensureStorefrontColumns(env:Env){const info=await env.DB.prepare("PRAGMA table_info(store_settings)").all<{name:string}>(),names=new Set(info.results.map(row=>row.name)),columns:Array<[string,string]>=[["background_color","text DEFAULT '#ffffff' NOT NULL"],["whatsapp_enabled","integer DEFAULT 1 NOT NULL"],["facebook_enabled","integer DEFAULT 1 NOT NULL"],["instagram_enabled","integer DEFAULT 1 NOT NULL"],["tiktok_enabled","integer DEFAULT 1 NOT NULL"],["slider_interval_ms","integer DEFAULT 5000 NOT NULL"],["show_out_of_stock","integer DEFAULT 1 NOT NULL"],["show_offers","integer DEFAULT 1 NOT NULL"],["show_most_ordered","integer DEFAULT 0 NOT NULL"],["show_top_rated","integer DEFAULT 0 NOT NULL"],["show_newest","integer DEFAULT 1 NOT NULL"],["show_featured","integer DEFAULT 1 NOT NULL"],["home_products_limit","integer DEFAULT 6 NOT NULL"],["show_subcategory_products_in_parent","integer DEFAULT 1 NOT NULL"],["watermark_opacity","integer DEFAULT 25 NOT NULL"]];for(const [name,definition] of columns)if(!names.has(name))await env.DB.prepare(`ALTER TABLE store_settings ADD COLUMN ${name} ${definition}`).run()}
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

async function readStorefront(env: Env) {
  const [row, slides, popup] = await Promise.all([
    env.DB.prepare("SELECT * FROM store_settings WHERE id=1").first<Record<string, unknown>>(),
    env.DB.prepare("SELECT id,title,image_url,product_id,category_id,external_url,sort_order,active FROM sliders ORDER BY sort_order,id").all(),
    env.DB.prepare("SELECT id,title,body,image_url,target_url,active FROM popups ORDER BY id DESC LIMIT 1").first<Record<string,unknown>>(),
  ]);
  const settings = { storeName:String(row?.store_name||"Manar Store"),logoUrl:String(row?.logo_url||""),watermarkUrl:String(row?.watermark_url||""),watermarkOpacity:Math.min(100,Math.max(0,Number(row?.watermark_opacity??25))),primaryColor:String(row?.primary_color||"#b85f7d"),secondaryColor:String(row?.secondary_color||"#f8e8ef"),backgroundColor:String(row?.background_color||"#ffffff"),currency:String(row?.currency||"ILS"),whatsapp:String(row?.whatsapp||""),whatsappEnabled:Boolean(row?.whatsapp_enabled??1),facebookUrl:String(row?.facebook_url||""),facebookEnabled:Boolean(row?.facebook_enabled??1),instagramUrl:String(row?.instagram_url||""),instagramEnabled:Boolean(row?.instagram_enabled??1),tiktokUrl:String(row?.tiktok_url||""),tiktokEnabled:Boolean(row?.tiktok_enabled??1),sliderEnabled:Boolean(row?.slider_enabled??1),sliderIntervalMs:Number(row?.slider_interval_ms||5000),showOutOfStock:Boolean(row?.show_out_of_stock??1),popupEnabled:Boolean(row?.popup_enabled??0),showOffers:Boolean(row?.show_offers??1),showMostOrdered:Boolean(row?.show_most_ordered??0),showTopRated:Boolean(row?.show_top_rated??0),showNewest:Boolean(row?.show_newest??1),showFeatured:Boolean(row?.show_featured??1),homeProductsLimit:Math.min(24,Math.max(1,Number(row?.home_products_limit||6))),showSubcategoryProductsInParent:Boolean(row?.show_subcategory_products_in_parent??1)};
  return {settings,sliders:(slides.results as Array<Record<string,unknown>>).map(item=>({id:Number(item.id),title:String(item.title||""),imageUrl:String(item.image_url),productId:item.product_id==null?null:Number(item.product_id),categoryId:item.category_id==null?null:Number(item.category_id),externalUrl:String(item.external_url||""),sortOrder:Number(item.sort_order),active:Boolean(item.active)})),popup:popup?{id:Number(popup.id),title:String(popup.title||""),body:String(popup.body||""),imageUrl:String(popup.image_url||""),targetUrl:String(popup.target_url||""),active:Boolean(popup.active)}:null};
}

async function saveSettings(request:Request,env:Env){
  await ensureStorefrontColumns(env);
  const body=await parseJson(request),now=Date.now(),interval=Math.min(20000,Math.max(2000,Number(body.sliderIntervalMs)||5000));
  const limit=Math.min(24,Math.max(1,Number(body.homeProductsLimit)||6));
  await env.DB.prepare(`INSERT INTO store_settings (id,store_name,logo_url,watermark_url,watermark_opacity,primary_color,secondary_color,background_color,currency,whatsapp,whatsapp_enabled,facebook_url,facebook_enabled,instagram_url,instagram_enabled,tiktok_url,tiktok_enabled,slider_enabled,slider_interval_ms,show_out_of_stock,popup_enabled,show_offers,show_most_ordered,show_top_rated,show_newest,show_featured,home_products_limit,show_subcategory_products_in_parent,created_at,updated_at) VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET store_name=excluded.store_name,logo_url=excluded.logo_url,watermark_url=excluded.watermark_url,watermark_opacity=excluded.watermark_opacity,primary_color=excluded.primary_color,secondary_color=excluded.secondary_color,background_color=excluded.background_color,whatsapp=excluded.whatsapp,whatsapp_enabled=excluded.whatsapp_enabled,facebook_url=excluded.facebook_url,facebook_enabled=excluded.facebook_enabled,instagram_url=excluded.instagram_url,instagram_enabled=excluded.instagram_enabled,tiktok_url=excluded.tiktok_url,tiktok_enabled=excluded.tiktok_enabled,slider_enabled=excluded.slider_enabled,slider_interval_ms=excluded.slider_interval_ms,show_out_of_stock=excluded.show_out_of_stock,popup_enabled=excluded.popup_enabled,show_offers=excluded.show_offers,show_most_ordered=excluded.show_most_ordered,show_top_rated=excluded.show_top_rated,show_newest=excluded.show_newest,show_featured=excluded.show_featured,home_products_limit=excluded.home_products_limit,show_subcategory_products_in_parent=excluded.show_subcategory_products_in_parent,updated_at=excluded.updated_at`).bind(asText(body.storeName)||"Manar Store",asOptionalText(body.logoUrl),asOptionalText(body.watermarkUrl),Math.min(100,Math.max(0,Number(body.watermarkOpacity??25))),validColor(body.primaryColor,"#b85f7d"),validColor(body.secondaryColor,"#f8e8ef"),validColor(body.backgroundColor,"#ffffff"),"ILS",asOptionalText(body.whatsapp),asBoolean(body.whatsappEnabled)?1:0,safeUrl(body.facebookUrl),asBoolean(body.facebookEnabled)?1:0,safeUrl(body.instagramUrl),asBoolean(body.instagramEnabled)?1:0,safeUrl(body.tiktokUrl),asBoolean(body.tiktokEnabled)?1:0,asBoolean(body.sliderEnabled)?1:0,interval,asBoolean(body.showOutOfStock)?1:0,asBoolean(body.popupEnabled)?1:0,asBoolean(body.showOffers)?1:0,asBoolean(body.showMostOrdered)?1:0,asBoolean(body.showTopRated)?1:0,asBoolean(body.showNewest)?1:0,asBoolean(body.showFeatured)?1:0,limit,asBoolean(body.showSubcategoryProductsInParent)?1:0,now,now).run();
  return json({ok:true});
}

async function saveSlide(request:Request,env:Env,id?:number){const body=await parseJson(request),image=asText(body.imageUrl);if(!image)return json({error:"صورة الشريحة مطلوبة"},{status:400});const values=[asOptionalText(body.title),image,body.productId?Number(body.productId):null,body.categoryId?Number(body.categoryId):null,safeUrl(body.externalUrl),Number(body.sortOrder||0),asBoolean(body.active)?1:0,Date.now()];if(id)await env.DB.prepare("UPDATE sliders SET title=?,image_url=?,product_id=?,category_id=?,external_url=?,sort_order=?,active=?,updated_at=? WHERE id=?").bind(...values,id).run();else await env.DB.prepare("INSERT INTO sliders (title,image_url,product_id,category_id,external_url,sort_order,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(...values,Date.now()).run();return json({ok:true});}
async function savePopup(request:Request,env:Env){const body=await parseJson(request),now=Date.now(),current=await env.DB.prepare("SELECT id FROM popups ORDER BY id DESC LIMIT 1").first<{id:number}>(),values=[asOptionalText(body.title),asOptionalText(body.body),asOptionalText(body.imageUrl),safeTarget(body.targetUrl),asBoolean(body.active)?1:0,now];if(current)await env.DB.prepare("UPDATE popups SET title=?,body=?,image_url=?,target_url=?,active=?,updated_at=? WHERE id=?").bind(...values,current.id).run();else await env.DB.prepare("INSERT INTO popups (title,body,image_url,target_url,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").bind(...values,now).run();return json({ok:true});}

const orderStatuses=["new","confirmed","preparing","shipped","delivered","cancelled"] as const;
async function createOrder(request:Request,env:Env){
  await ensureCustomizationSchema(env);
  const body=await parseJson(request),name=asText(body.customerName),phone=asText(body.phone),city=asText(body.city),address=asText(body.address),zone=asText(body.shippingZone),notes=asOptionalText(body.notes);
  if(!name||phone.length<7||!city||!address)return json({error:"الاسم ورقم الهاتف والمدينة والعنوان مطلوبة"},{status:400});
  const shipping=zone==="jerusalem"?3000:zone==="inside"?7000:zone==="west_bank"?2000:-1;
  if(shipping<0)return json({error:"منطقة التوصيل غير صحيحة"},{status:400});
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
    for(const field of definitions.results as Array<Record<string,unknown>>){const fieldLabel=String(field.label),value=asText(submitted[fieldLabel]).slice(0,Number(field.max_length||60));if(value)customizations[fieldLabel]=value}
    const lineNote=asText(item.notes).slice(0,500);
    lines.push({productId,variantId,itemNumber:Number(product.item_number),name:String(product.name),variantLabel:label,customizations:{...customizations,...(lineNote?{"ملاحظات على المنتج":lineNote}:{})},qty,unit,total:unit*qty});
  }
  const subtotal=lines.reduce((sum,line)=>sum+line.total,0),now=Date.now(),number=Number((await env.DB.prepare("SELECT COALESCE(MAX(order_number),1000)+1 AS next FROM orders").first<{next:number}>())?.next||1001),result=await env.DB.prepare("INSERT INTO orders (order_number,status,customer_name,phone,address,city,subtotal_agorot,shipping_agorot,discount_agorot,total_agorot,payment_method,payment_status,notes,created_at,updated_at) VALUES (?,'new',?,?,?,?,?,?,0,?,'cash_on_delivery','pending',?,?,?)").bind(number,name,phone,address,city,subtotal,shipping,subtotal+shipping,notes,now,now).run(),orderId=Number(result.meta.last_row_id);
  await env.DB.batch(lines.map(line=>env.DB.prepare("INSERT INTO order_items (order_id,product_id,variant_id,item_number,product_name,variant_label,customization_json,quantity,unit_price_agorot,line_total_agorot) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(orderId,line.productId,line.variantId,line.itemNumber,line.name,line.variantLabel,JSON.stringify(line.customizations),line.qty,line.unit,line.total)));
  return json({ok:true,orderNumber:number,total:(subtotal+shipping)/100});
}

async function readOrders(env:Env){
  await ensureCustomizationSchema(env);
  const [orders,items,mediaResult]=await Promise.all([
    env.DB.prepare("SELECT id,order_number,status,customer_name,phone,address,city,subtotal_agorot,shipping_agorot,total_agorot,payment_method,payment_status,notes,created_at,updated_at FROM orders WHERE deleted_at IS NULL ORDER BY created_at DESC,id DESC").all(),
    env.DB.prepare("SELECT id,order_id,product_id,variant_id,item_number,product_name,variant_label,customization_json,quantity,unit_price_agorot,line_total_agorot FROM order_items ORDER BY id").all(),
    env.DB.prepare("SELECT product_id,variant_id,url FROM product_media WHERE media_type='image' ORDER BY is_primary DESC,sort_order,id").all()
  ]);
  const media=mediaResult.results as Array<Record<string,unknown>>;
  return (orders.results as Array<Record<string,unknown>>).map(order=>({id:Number(order.id),orderNumber:Number(order.order_number),status:String(order.status),customerName:String(order.customer_name||""),phone:String(order.phone||""),address:String(order.address||""),city:String(order.city||""),subtotal:Number(order.subtotal_agorot)/100,shipping:Number(order.shipping_agorot)/100,total:Number(order.total_agorot)/100,paymentMethod:String(order.payment_method),paymentStatus:String(order.payment_status),notes:String(order.notes||""),createdAt:Number(order.created_at),items:(items.results as Array<Record<string,unknown>>).filter(item=>Number(item.order_id)===Number(order.id)).map(item=>{const productId=item.product_id==null?null:Number(item.product_id),variantId=item.variant_id==null?null:Number(item.variant_id),image=media.find(entry=>Number(entry.product_id)===productId&&entry.variant_id!=null&&Number(entry.variant_id)===variantId)||media.find(entry=>Number(entry.product_id)===productId&&entry.variant_id==null);let customizations:Record<string,string>={};try{customizations=JSON.parse(String(item.customization_json||"{}")) as Record<string,string>}catch{}return{id:Number(item.id),productId,variantId,itemNumber:Number(item.item_number),productName:String(item.product_name),variantLabel:String(item.variant_label||""),customizations,imageUrl:String(image?.url||""),quantity:Number(item.quantity),unitPrice:Number(item.unit_price_agorot)/100,lineTotal:Number(item.line_total_agorot)/100}})}));
}

async function updateOrder(request:Request,env:Env,id:number){
  const body=await parseJson(request),status=asText(body.status);
  if(!orderStatuses.includes(status as typeof orderStatuses[number]))return json({error:"حالة الطلب غير صحيحة"},{status:400});
  const current=await env.DB.prepare("SELECT status FROM orders WHERE id=? AND deleted_at IS NULL").bind(id).first<{status:string}>();
  if(!current)return json({error:"الطلب غير موجود"},{status:404});
  const shipping=Math.max(0,Math.round(Number(body.shipping??0)*100)),now=Date.now(),statements=[env.DB.prepare("UPDATE orders SET status=?,shipping_agorot=?,total_agorot=subtotal_agorot+?,updated_at=? WHERE id=?").bind(status,shipping,shipping,now,id)];
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
  return json({ok:true});
}

async function readCatalog(env: Env, includeInactive = false) {
  const visibility = includeInactive ? null : await env.DB.prepare("SELECT show_out_of_stock FROM store_settings WHERE id=1").first<{show_out_of_stock:number}>();
  const showOutOfStock = Boolean(visibility?.show_out_of_stock ?? 1);
  const categoryWhere = includeInactive ? "" : "WHERE active = 1";
  const productWhere = includeInactive ? "WHERE deleted_at IS NULL" : "WHERE p.active = 1 AND p.deleted_at IS NULL";
  const [categoryResult, productResult, optionResult, valueResult, variantResult, linkResult, mediaResult, keywordResult,customFieldResult,supplierResult] = await Promise.all([
    env.DB.prepare(`SELECT id, category_number, parent_id, name, slug, description, banner_url, icon_url, sort_order, active FROM categories ${categoryWhere} ORDER BY sort_order, id`).all(),
    env.DB.prepare(`SELECT p.*, c.name AS category_name, pc.name AS parent_category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id LEFT JOIN categories pc ON pc.id = c.parent_id ${productWhere} ORDER BY p.created_at DESC, p.id DESC`).all(),
    env.DB.prepare("SELECT id, product_id, name, display_type, sort_order FROM product_options ORDER BY sort_order, id").all(),
    env.DB.prepare("SELECT id, option_id, value, color_hex, sort_order FROM product_option_values ORDER BY sort_order, id").all(),
    env.DB.prepare("SELECT id, product_id, sku, price_agorot, wholesale_price_agorot, stock_quantity, active FROM product_variants ORDER BY id").all(),
    env.DB.prepare("SELECT variant_id, option_value_id FROM variant_option_values").all(),
    env.DB.prepare("SELECT id, product_id, variant_id, media_type, url, alt_text, sort_order, is_primary FROM product_media ORDER BY is_primary DESC, sort_order, id").all(),
    env.DB.prepare("SELECT product_id, keyword FROM product_keywords ORDER BY keyword").all(),
    env.DB.prepare("SELECT id,product_id,label,placeholder,max_length,required,sort_order FROM product_custom_fields ORDER BY sort_order,id").all(),
    env.DB.prepare("SELECT ps.product_id,ps.source_product_id,ps.source_url,ps.supplier_price_agorot,ps.preferred,s.id AS supplier_id,s.name AS supplier_name FROM product_suppliers ps JOIN suppliers s ON s.id=ps.supplier_id ORDER BY ps.preferred DESC,s.name").all(),
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
  const productSuppliers=supplierResult.results as Array<Record<string,unknown>>;

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
      description: String(row.description || row.short_description || ""), specifications: String(row.specifications || ""), stock: Number(row.stock_quantity), inStock, active: Boolean(row.active), featured: Boolean(row.featured), views: Number(row.view_count), orders: Number(row.order_count), rating: Number(row.rating_average_x100) / 100, ratingCount:Number(row.rating_count||0),createdAt:Number(row.created_at||0), variants: productVariants,
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
  const [suppliers,purchases,items,customers,stats]=await Promise.all([
    env.DB.prepare("SELECT id,supplier_number,name,phone,address,notes,active FROM suppliers ORDER BY name").all(),
    env.DB.prepare("SELECT p.id,p.purchase_number,p.supplier_id,p.status,p.invoice_reference,p.purchased_at,p.total_agorot,p.notes,s.name AS supplier_name FROM purchases p LEFT JOIN suppliers s ON s.id=p.supplier_id WHERE p.deleted_at IS NULL ORDER BY p.purchased_at DESC,p.id DESC").all(),
    env.DB.prepare("SELECT id,purchase_id,product_id,variant_id,item_number,product_name,quantity,unit_cost_agorot,line_total_agorot,notes FROM purchase_items ORDER BY id").all(),
    env.DB.prepare("SELECT customer_name,phone,city,COUNT(*) AS orders_count,SUM(total_agorot) AS total_agorot,MAX(created_at) AS last_order_at FROM orders WHERE deleted_at IS NULL AND status!='cancelled' GROUP BY phone,customer_name,city ORDER BY last_order_at DESC").all(),
    env.DB.prepare("SELECT (SELECT COUNT(*) FROM orders WHERE deleted_at IS NULL) AS orders_count,(SELECT COUNT(*) FROM orders WHERE status='new' AND deleted_at IS NULL) AS new_orders,(SELECT COUNT(*) FROM products WHERE deleted_at IS NULL AND active=1) AS products_count,(SELECT COUNT(*) FROM products WHERE deleted_at IS NULL AND stock_quantity<=0 AND NOT EXISTS(SELECT 1 FROM product_variants v WHERE v.product_id=products.id AND v.stock_quantity>0 AND v.active=1)) AS out_of_stock,(SELECT COALESCE(SUM(total_agorot),0) FROM orders WHERE status IN ('confirmed','preparing','shipped','delivered') AND deleted_at IS NULL) AS sales_agorot").first<Record<string,unknown>>()
  ]);
  const purchaseItems=items.results as Array<Record<string,unknown>>;
  return {
    suppliers:(suppliers.results as Array<Record<string,unknown>>).map(row=>({id:Number(row.id),supplierNumber:Number(row.supplier_number),name:String(row.name),phone:String(row.phone||""),address:String(row.address||""),notes:String(row.notes||""),active:Boolean(row.active)})),
    purchases:(purchases.results as Array<Record<string,unknown>>).map(row=>({id:Number(row.id),purchaseNumber:Number(row.purchase_number),supplierId:row.supplier_id==null?null:Number(row.supplier_id),supplierName:String(row.supplier_name||"بدون مورد"),status:String(row.status),invoiceReference:String(row.invoice_reference||""),purchasedAt:Number(row.purchased_at),total:Number(row.total_agorot)/100,notes:String(row.notes||""),items:purchaseItems.filter(item=>Number(item.purchase_id)===Number(row.id)).map(item=>({id:Number(item.id),productId:item.product_id==null?null:Number(item.product_id),variantId:item.variant_id==null?null:Number(item.variant_id),itemNumber:Number(item.item_number||0),productName:String(item.product_name),quantity:Number(item.quantity),unitCost:Number(item.unit_cost_agorot)/100,lineTotal:Number(item.line_total_agorot)/100,notes:String(item.notes||"")}))})),
    customers:(customers.results as Array<Record<string,unknown>>).map(row=>({name:String(row.customer_name||""),phone:String(row.phone||""),city:String(row.city||""),ordersCount:Number(row.orders_count),total:Number(row.total_agorot)/100,lastOrderAt:Number(row.last_order_at)})),
    stats:{ordersCount:Number(stats?.orders_count||0),newOrders:Number(stats?.new_orders||0),productsCount:Number(stats?.products_count||0),outOfStock:Number(stats?.out_of_stock||0),sales:Number(stats?.sales_agorot||0)/100}
  };
}

async function saveSupplier(request:Request,env:Env,id?:number){const body=await parseJson(request),name=asText(body.name);if(!name)return json({error:"اسم المورد مطلوب"},{status:400});const number=Number(body.supplierNumber)||Number((await env.DB.prepare("SELECT COALESCE(MAX(supplier_number),1000)+1 AS next FROM suppliers").first<{next:number}>())?.next||1001),now=Date.now();if(id)await env.DB.prepare("UPDATE suppliers SET supplier_number=?,name=?,phone=?,address=?,notes=?,active=?,updated_at=? WHERE id=?").bind(number,name,asOptionalText(body.phone),asOptionalText(body.address),asOptionalText(body.notes),asBoolean(body.active)?1:0,now,id).run();else await env.DB.prepare("INSERT INTO suppliers (supplier_number,name,phone,address,notes,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").bind(number,name,asOptionalText(body.phone),asOptionalText(body.address),asOptionalText(body.notes),1,now,now).run();return json({ok:true});}

async function savePurchase(request:Request,env:Env,id?:number){const body=await parseJson(request),rows=Array.isArray(body.items)?body.items as Array<Record<string,unknown>>:[],valid=rows.map(item=>({productId:Number(item.productId),variantId:item.variantId?Number(item.variantId):null,quantity:Math.max(1,Number(item.quantity)||1),unitCost:agorot(item.unitCost),notes:asOptionalText(item.notes)})).filter(item=>item.productId>0&&item.unitCost>=0);if(!valid.length)return json({error:"أضف صنفاً واحداً على الأقل"},{status:400});const total=valid.reduce((sum,item)=>sum+item.quantity*item.unitCost,0),now=Date.now(),supplierId=body.supplierId?Number(body.supplierId):null,purchasedAt=Number(body.purchasedAt)||now;let purchaseId=id;if(id){const current=await env.DB.prepare("SELECT status FROM purchases WHERE id=? AND deleted_at IS NULL").bind(id).first<{status:string}>();if(!current)return json({error:"فاتورة المشتريات غير موجودة"},{status:404});if(current.status==="posted")return json({error:"الفاتورة المرحلة لا يمكن تعديلها"},{status:409});await env.DB.prepare("UPDATE purchases SET supplier_id=?,invoice_reference=?,purchased_at=?,total_agorot=?,notes=?,updated_at=? WHERE id=?").bind(supplierId,asOptionalText(body.invoiceReference),purchasedAt,total,asOptionalText(body.notes),now,id).run();await env.DB.prepare("DELETE FROM purchase_items WHERE purchase_id=?").bind(id).run()}else{const number=Number((await env.DB.prepare("SELECT COALESCE(MAX(purchase_number),1000)+1 AS next FROM purchases").first<{next:number}>())?.next||1001),result=await env.DB.prepare("INSERT INTO purchases (purchase_number,supplier_id,status,invoice_reference,purchased_at,total_agorot,notes,created_at,updated_at) VALUES (?,?,'draft',?,?,?,?,?,?)").bind(number,supplierId,asOptionalText(body.invoiceReference),purchasedAt,total,asOptionalText(body.notes),now,now).run();purchaseId=Number(result.meta.last_row_id)}if(!purchaseId)return json({error:"تعذر حفظ الفاتورة"},{status:500});for(const item of valid){const product=await env.DB.prepare("SELECT item_number,name FROM products WHERE id=? AND deleted_at IS NULL").bind(item.productId).first<{item_number:number;name:string}>();if(!product)return json({error:"أحد الأصناف غير موجود"},{status:400});await env.DB.prepare("INSERT INTO purchase_items (purchase_id,product_id,variant_id,item_number,product_name,quantity,unit_cost_agorot,line_total_agorot,notes) VALUES (?,?,?,?,?,?,?,?,?)").bind(purchaseId,item.productId,item.variantId,product.item_number,product.name,item.quantity,item.unitCost,item.quantity*item.unitCost,item.notes).run()}return json({ok:true,id:purchaseId});}

async function postPurchase(env:Env,id:number){const purchase=await env.DB.prepare("SELECT status FROM purchases WHERE id=? AND deleted_at IS NULL").bind(id).first<{status:string}>();if(!purchase)return json({error:"الفاتورة غير موجودة"},{status:404});if(purchase.status!=="draft")return json({error:"تم ترحيل هذه الفاتورة مسبقاً"},{status:409});const items=await env.DB.prepare("SELECT product_id,variant_id,quantity,unit_cost_agorot FROM purchase_items WHERE purchase_id=?").bind(id).all(),now=Date.now(),statements:D1PreparedStatement[]=[];for(const item of items.results as Array<Record<string,unknown>>){if(item.variant_id!=null)statements.push(env.DB.prepare("UPDATE product_variants SET stock_quantity=stock_quantity+?,purchase_price_agorot=?,updated_at=? WHERE id=?").bind(Number(item.quantity),Number(item.unit_cost_agorot),now,Number(item.variant_id)));else statements.push(env.DB.prepare("UPDATE products SET stock_quantity=stock_quantity+?,purchase_price_agorot=?,updated_at=? WHERE id=?").bind(Number(item.quantity),Number(item.unit_cost_agorot),now,Number(item.product_id)))}statements.push(env.DB.prepare("UPDATE purchases SET status='posted',updated_at=? WHERE id=?").bind(now,id));await env.DB.batch(statements);return json({ok:true});}

async function importProducts(request:Request,env:Env){const body=await parseJson(request),rows=Array.isArray(body.rows)?body.rows as Array<Record<string,unknown>>:[];if(!rows.length||rows.length>2000)return json({error:"الملف فارغ أو يتجاوز 2000 صنف"},{status:400});let created=0,updated=0;for(const row of rows){const name=asText(row.name),categoryNumber=Number(row.categoryNumber),price=Number(row.price),itemNumber=Number(row.itemNumber);if(!name||!categoryNumber||!Number.isFinite(price))continue;const category=await env.DB.prepare("SELECT id FROM categories WHERE category_number=?").bind(categoryNumber).first<{id:number}>();if(!category)continue;const existing=itemNumber?await env.DB.prepare("SELECT id FROM products WHERE item_number=? AND deleted_at IS NULL").bind(itemNumber).first<{id:number}>():null;const payload=new Request(request.url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({itemNumber,name,categoryId:category.id,price,wholesale:row.wholesale,purchasePrice:row.purchasePrice,stock:Number(row.stock||0),keywords:row.keywords,description:row.description,active:true,featured:false,variants:[],media:[]})});await saveProduct(payload,env,existing?.id);if(existing)updated++;else created++}return json({ok:true,created,updated});}

async function api(request: Request, env: Env, url: URL): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/product-images/product-2222-edited.webp") {
    const binary = atob(product2222ImageBase64);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    return new Response(bytes, { headers: { "content-type": "image/webp", "cache-control": "public, max-age=31536000, immutable" } });
  }
  if (request.method === "GET" && url.pathname === "/api/catalog") return publicJson(await readCatalog(env, false));
  if (request.method === "GET" && url.pathname === "/api/storefront") return publicJson(await readStorefront(env));
  if (request.method === "POST" && url.pathname === "/api/orders") return createOrder(request,env);
  if (request.method === "GET" && url.pathname === "/media") return json({ error: "Not Found" }, { status: 404 });
  if (request.method === "GET" && url.pathname.startsWith("/media/")) {
    const key = decodeURIComponent(url.pathname.slice(7));
    let object = await env.MEDIA.get(key);
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
    return new Response(object.body, { headers });
  }
  if (!url.pathname.startsWith("/api/admin/")) return null;
  if (env.APP_SURFACE !== "admin") return json({ error: "Not Found" }, { status: 404 });
  if (request.method === "GET" && url.pathname === "/api/admin/catalog") return json(await readCatalog(env, true));
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
  if(orderMatch&&request.method==="PUT")return updateOrder(request,env,Number(orderMatch[1]));
  if (request.method === "GET" && url.pathname === "/api/admin/storefront") return json(await readStorefront(env));
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
    if (!contentLength || contentLength > 12_000_000) return json({ error: "حجم الملف غير مسموح" }, { status: 413 });
    const form = await request.formData(); const file = form.get("file");
    if (!(file instanceof File)) return json({ error: "الملف مطلوب" }, { status: 400 });
    const allowed = file.type.startsWith("image/") || file.type.startsWith("video/");
    if (!allowed) return json({ error: "نوع الملف غير مدعوم" }, { status: 400 });
    if (file.type.startsWith("video/") && file.size > 10_000_000) return json({ error: "حجم الفيديو يتجاوز 10MB" }, { status: 413 });
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
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const isAdminPath = url.pathname === "/admin" || url.pathname.startsWith("/admin/");

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
      const cacheablePublicApi = request.method === "GET" && (url.pathname === "/api/catalog" || url.pathname === "/api/storefront");
      if (cacheablePublicApi) {
        const cache = caches.default;
        const cacheKey = new Request(url.toString(), { method: "GET" });
        const cached = await cache.match(cacheKey);
        if (cached) return cached;
        const apiResponse = await api(request, env, url);
        if (apiResponse) {
          ctx.waitUntil(cache.put(cacheKey, apiResponse.clone()));
          return apiResponse;
        }
      }
      const apiResponse = await api(request, env, url);
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

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
