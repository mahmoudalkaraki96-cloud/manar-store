/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

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
interface R2Bucket { get(key: string): Promise<R2ObjectBody | null>; put(key: string, body: ReadableStream, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown> }
interface Fetcher { fetch(request: Request): Promise<Response> }

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const json = (data: unknown, init: ResponseInit = {}) => Response.json(data, {
  ...init,
  headers: { "cache-control": "no-store", ...(init.headers || {}) },
});

const amount = (agorot: number | null) => agorot == null ? undefined : agorot / 100;
const agorot = (value: unknown) => Math.max(0, Math.round(Number(value || 0) * 100));
const nullableAgorot = (value: unknown) => value === "" || value == null ? null : agorot(value);
const asText = (value: unknown) => typeof value === "string" ? value.trim() : "";
const asOptionalText = (value: unknown) => asText(value) || null;
const asBoolean = (value: unknown) => value === true || value === 1;
const slugify = (value: string) => value.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || crypto.randomUUID();

async function readCatalog(env: Env, includeInactive = false) {
  const categoryWhere = includeInactive ? "" : "WHERE active = 1";
  const productWhere = includeInactive ? "WHERE deleted_at IS NULL" : "WHERE p.active = 1 AND p.deleted_at IS NULL";
  const [categoryResult, productResult, optionResult, valueResult, variantResult, linkResult, mediaResult, keywordResult] = await Promise.all([
    env.DB.prepare(`SELECT id, category_number, parent_id, name, slug, description, banner_url, sort_order, active FROM categories ${categoryWhere} ORDER BY sort_order, id`).all(),
    env.DB.prepare(`SELECT p.*, c.name AS category_name, pc.name AS parent_category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id LEFT JOIN categories pc ON pc.id = c.parent_id ${productWhere} ORDER BY p.created_at DESC, p.id DESC`).all(),
    env.DB.prepare("SELECT id, product_id, name, display_type, sort_order FROM product_options ORDER BY sort_order, id").all(),
    env.DB.prepare("SELECT id, option_id, value, color_hex, sort_order FROM product_option_values ORDER BY sort_order, id").all(),
    env.DB.prepare("SELECT id, product_id, sku, price_agorot, wholesale_price_agorot, stock_quantity, active FROM product_variants ORDER BY id").all(),
    env.DB.prepare("SELECT variant_id, option_value_id FROM variant_option_values").all(),
    env.DB.prepare("SELECT id, product_id, variant_id, media_type, url, alt_text, sort_order, is_primary FROM product_media ORDER BY is_primary DESC, sort_order, id").all(),
    env.DB.prepare("SELECT product_id, keyword FROM product_keywords ORDER BY keyword").all(),
  ]);

  const categories = (categoryResult.results as Array<Record<string, unknown>>).map((row) => ({
    id: Number(row.id), categoryNumber: Number(row.category_number), parentId: row.parent_id == null ? null : Number(row.parent_id),
    name: String(row.name), slug: String(row.slug), description: String(row.description || ""), bannerUrl: String(row.banner_url || ""),
    sortOrder: Number(row.sort_order), active: Boolean(row.active),
  }));
  const options = optionResult.results as Array<Record<string, unknown>>;
  const values = valueResult.results as Array<Record<string, unknown>>;
  const variants = variantResult.results as Array<Record<string, unknown>>;
  const links = linkResult.results as Array<Record<string, unknown>>;
  const media = mediaResult.results as Array<Record<string, unknown>>;
  const keywords = keywordResult.results as Array<Record<string, unknown>>;

  const products = (productResult.results as Array<Record<string, unknown>>).map((row) => {
    const id = Number(row.id);
    const productMedia = media.filter((item) => Number(item.product_id) === id);
    const images = productMedia.filter((item) => item.media_type === "image" && item.variant_id == null).map((item) => String(item.url));
    const video = productMedia.find((item) => item.media_type === "video" && item.variant_id == null);
    const option = options.find((item) => Number(item.product_id) === id);
    const optionValues = option ? values.filter((item) => Number(item.option_id) === Number(option.id)) : [];
    const productVariants = variants.filter((variant) => Number(variant.product_id) === id && (includeInactive || Boolean(variant.active))).map((variant) => {
      const link = links.find((item) => Number(item.variant_id) === Number(variant.id));
      const value = optionValues.find((item) => Number(item.id) === Number(link?.option_value_id));
      const variantImages = productMedia.filter((item) => Number(item.variant_id) === Number(variant.id) && item.media_type === "image").map((item) => String(item.url));
      return { id: Number(variant.id), name: String(value?.value || variant.sku || "خيار"), sku: String(variant.sku || ""), displayType: String(option?.display_type || "text"), color: value?.color_hex ? String(value.color_hex) : undefined, stock: Number(variant.stock_quantity), price: amount(variant.price_agorot as number | null), wholesale: amount(variant.wholesale_price_agorot as number | null), image: variantImages[0], images: variantImages };
    });
    return {
      id, itemNumber: Number(row.item_number), name: String(row.name), slug: String(row.slug), categoryId: row.category_id == null ? null : Number(row.category_id),
      category: String(row.parent_category_name || row.category_name || "بدون قسم"), subcategory: row.parent_category_name ? String(row.category_name) : undefined,
      price: amount(row.price_agorot as number) || 0, wholesale: amount(row.wholesale_price_agorot as number | null), purchasePrice: amount(row.purchase_price_agorot as number | null), oldPrice: amount(row.offer_price_agorot as number | null),
      image: images[0], images, video: video ? String(video.url) : undefined, variantName: option ? String(option.name) : undefined,
      keywords: keywords.filter((item) => Number(item.product_id) === id).map((item) => String(item.keyword)).join(" "),
      description: String(row.description || row.short_description || ""), specifications: String(row.specifications || ""), stock: Number(row.stock_quantity), active: Boolean(row.active), featured: Boolean(row.featured), views: Number(row.view_count), orders: Number(row.order_count), rating: Number(row.rating_average_x100) / 100, variants: productVariants,
    };
  });
  return { categories, products };
}

async function parseJson(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 1_000_000) throw new Error("الطلب أكبر من الحد المسموح");
  return request.json() as Promise<Record<string, unknown>>;
}

async function saveCategory(request: Request, env: Env, id?: number) {
  const body = await parseJson(request);
  const name = asText(body.name);
  if (!name) return json({ error: "اسم القسم مطلوب" }, { status: 400 });
  const parentId = body.parentId ? Number(body.parentId) : null;
  const number = Number(body.categoryNumber) || Number((await env.DB.prepare("SELECT COALESCE(MAX(category_number), 1000) + 1 AS next FROM categories").first())?.next);
  const slug = slugify(asText(body.slug) || name);
  if (id) {
    await env.DB.prepare("UPDATE categories SET category_number=?, parent_id=?, name=?, slug=?, description=?, banner_url=?, sort_order=?, active=?, updated_at=? WHERE id=?")
      .bind(number, parentId, name, slug, asOptionalText(body.description), asOptionalText(body.bannerUrl), Number(body.sortOrder || 0), asBoolean(body.active) ? 1 : 0, Date.now(), id).run();
  } else {
    await env.DB.prepare("INSERT INTO categories (category_number,parent_id,name,slug,description,banner_url,sort_order,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .bind(number, parentId, name, slug, asOptionalText(body.description), asOptionalText(body.bannerUrl), Number(body.sortOrder || 0), asBoolean(body.active) ? 1 : 0, Date.now(), Date.now()).run();
  }
  return json({ ok: true });
}

async function saveProduct(request: Request, env: Env, id?: number) {
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
    ]);
  } else {
    const result = await env.DB.prepare("INSERT INTO products (item_number,category_id,name,slug,description,specifications,price_agorot,wholesale_price_agorot,purchase_price_agorot,stock_quantity,active,featured,offer_price_agorot,view_count,order_count,rating_average_x100,rating_count,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,0,0,0,?,?)")
      .bind(itemNumber, categoryId, name, slug, asOptionalText(body.description), asOptionalText(body.specifications), agorot(body.price), nullableAgorot(body.wholesale), nullableAgorot(body.purchasePrice), Number(body.stock || 0), asBoolean(body.active) ? 1 : 0, asBoolean(body.featured) ? 1 : 0, nullableAgorot(body.oldPrice), now, now).run();
    productId = Number(result.meta.last_row_id);
  }
  if (!productId) return json({ error: "تعذر حفظ الصنف" }, { status: 500 });
  const keywordList = asText(body.keywords).split(/[،,\n]+/).map((value) => value.trim()).filter(Boolean);
  if (keywordList.length) await env.DB.batch(keywordList.map((keyword) => env.DB.prepare("INSERT INTO product_keywords (product_id,keyword) VALUES (?,?)").bind(productId, keyword)));
  const media = Array.isArray(body.media) ? body.media as Array<Record<string, unknown>> : [];
  if (media.length) await env.DB.batch(media.map((item, index) => env.DB.prepare("INSERT INTO product_media (product_id,variant_id,media_type,url,alt_text,sort_order,is_primary,created_at,updated_at) VALUES (?,NULL,?,?,?,?,?,?,?)").bind(productId, item.type === "video" ? "video" : "image", asText(item.url), asOptionalText(item.altText), index, index === 0 && item.type !== "video" ? 1 : 0, now, now)));
  const variants = Array.isArray(body.variants) ? body.variants as Array<Record<string, unknown>> : [];
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
      const variantImages = Array.isArray(variant.images) ? variant.images.filter((url) => typeof url === "string") as string[] : [];
      if (variantImages.length) await env.DB.batch(variantImages.map((url, mediaIndex) => env.DB.prepare("INSERT INTO product_media (product_id,variant_id,media_type,url,sort_order,is_primary,created_at,updated_at) VALUES (?,?,\"image\",?,?,?,?,?)").bind(productId, variantId, url, mediaIndex, mediaIndex === 0 ? 1 : 0, now, now)));
    }
  }
  return json({ ok: true, id: productId, itemNumber });
}

async function api(request: Request, env: Env, url: URL): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/api/catalog") return json(await readCatalog(env, false));
  if (request.method === "GET" && url.pathname === "/media") return json({ error: "Not Found" }, { status: 404 });
  if (request.method === "GET" && url.pathname.startsWith("/media/")) {
    const key = decodeURIComponent(url.pathname.slice(7));
    const object = await env.MEDIA.get(key);
    if (!object) return new Response("Not Found", { status: 404 });
    const headers = new Headers(); object.writeHttpMetadata(headers); headers.set("etag", object.httpEtag); headers.set("cache-control", "public, max-age=31536000, immutable");
    return new Response(object.body, { headers });
  }
  if (!url.pathname.startsWith("/api/admin/")) return null;
  if (env.APP_SURFACE !== "admin") return json({ error: "Not Found" }, { status: 404 });
  if (request.method === "GET" && url.pathname === "/api/admin/catalog") return json(await readCatalog(env, true));
  if (request.method === "POST" && url.pathname === "/api/admin/categories") return saveCategory(request, env);
  const categoryMatch = url.pathname.match(/^\/api\/admin\/categories\/(\d+)$/);
  if (categoryMatch && request.method === "PUT") return saveCategory(request, env, Number(categoryMatch[1]));
  if (categoryMatch && request.method === "DELETE") { await env.DB.prepare("DELETE FROM categories WHERE id=?").bind(Number(categoryMatch[1])).run(); return json({ ok: true }); }
  if (request.method === "POST" && url.pathname === "/api/admin/products") return saveProduct(request, env);
  const productMatch = url.pathname.match(/^\/api\/admin\/products\/(\d+)$/);
  if (productMatch && request.method === "PUT") return saveProduct(request, env, Number(productMatch[1]));
  if (productMatch && request.method === "DELETE") { await env.DB.prepare("UPDATE products SET deleted_at=?, active=0 WHERE id=?").bind(Date.now(), Number(productMatch[1])).run(); return json({ ok: true }); }
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
