// Keyed by the store's configured language codes (store_languages); the base fields hold the source content language.
export type CatalogTranslations = Partial<Record<string, Partial<Record<"name" | "description" | "specifications", string>>>>;

export type Category = {
  translations?: CatalogTranslations;
  id: number;
  categoryNumber: number;
  parentId: number | null;
  name: string;
  slug: string;
  description: string;
  bannerUrl: string;
  iconUrl: string;
  sortOrder: number;
  active: boolean;
};

export type Variant = {
  translations?: CatalogTranslations;
  oldPrice?: number;
  id?: number;
  name: string;
  sku: string;
  displayType: "color" | "text";
  color?: string;
  stock: number;
  price?: number;
  wholesale?: number;
  image?: string;
  images?: string[];
};
export type CustomField={id?:number;label:string;placeholder:string;required:boolean;maxLength:number};
export type ProductSupplier={id:number;name:string;sourceProductId:string;sourceUrl:string;supplierPrice?:number;preferred:boolean};

export type Product = {
  translations?: CatalogTranslations;
  inventoryEnabled?: boolean;
  id: number;
  itemNumber: number;
  name: string;
  slug: string;
  categoryId: number | null;
  categoryTranslations?: CatalogTranslations;
  category: string;
  subcategory?: string;
  price: number;
  wholesale?: number;
  purchasePrice?: number;
  oldPrice?: number;
  image?: string;
  images?: string[];
  video?: string;
  variantName?: string;
  variantDisplay?: "color" | "text";
  keywords?: string;
  seoTitle?: string;
  seoDescription?: string;
  imageAlt?: string;
  description: string;
  specifications?: string;
  stock: number;
  inStock: boolean;
  active: boolean;
  isNew?: boolean;
  featured: boolean;
  views: number;
  orders: number;
  rating: number;
  ratingCount: number;
  createdAt: number;
  variants?: Variant[];
  customFields?: CustomField[];
  suppliers?: ProductSupplier[];
};

export type CatalogResponse = { categories: Category[]; products: Product[] };

export const norm = (value: string) => value.toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");
export const matches = (product: Product, query: string) => norm(query).split(/\s+/).filter(Boolean).every((term) => norm(`${product.name} ${product.category} ${product.subcategory || ""} ${product.itemNumber} ${product.keywords || ""} ${(product.variants || []).map((variant) => `${variant.name} ${variant.sku}`).join(" ")}`).includes(term));

// Kept here (no imports) so this module stays loadable on its own in tests and tools.
/** Fired on window when store data (products or settings) changed after a background refresh. */
export const STORE_DATA_EVENT="store:data-updated";
/** Data older than this is refreshed in the background the next time a page asks for it. */
export const STORE_DATA_MAX_AGE_MS=60_000;

/**
 * Keeps one copy of a response for the whole visit. Pages get it immediately; when it is older than a minute
 * a fresh copy is fetched in the background, and pages are told only if something actually changed.
 */
export function freshCache<T>(name:string,fetcher:()=>Promise<T>,onChange?:(value:T)=>void){
 let value:T|undefined,loadedAt=0,signature="",inflight:Promise<T>|null=null;
 const fetchNow=()=>{
  if(inflight)return inflight;
  inflight=fetcher().then(next=>{
   const nextSignature=JSON.stringify(next),changed=value!==undefined&&nextSignature!==signature;
   value=next;signature=nextSignature;loadedAt=Date.now();
   if(changed){onChange?.(next);if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent(STORE_DATA_EVENT,{detail:name}))}
   return next;
  }).finally(()=>{inflight=null});
  return inflight;
 };
 return {
  get():Promise<T>{
   if(value===undefined)return fetchNow();
   if(Date.now()-loadedAt>STORE_DATA_MAX_AGE_MS)void fetchNow().catch(()=>{});
   return Promise.resolve(value);
  },
  refresh:fetchNow,
  /** Refreshes only data this visit already loaded (never downloads a list no page asked for). */
  refreshLoaded:():Promise<T|undefined>=>value===undefined?Promise.resolve(undefined):fetchNow(),
  // 1.9.3: data never loaded is not "stale"; a page that needs it loads it itself.
  isStale:()=>value!==undefined&&Date.now()-loadedAt>STORE_DATA_MAX_AGE_MS,
  current:()=>value,
 };
}

const catalogCache = freshCache<CatalogResponse>("catalog", () =>
  fetch(`/api/catalog?v=${Date.now()}`, { cache: "no-store" }).then((response) => {
    if (!response.ok) throw new Error("تعذر تحميل بيانات المتجر");
    return response.json() as Promise<CatalogResponse>;
  }));

/** Products and categories for this visit; refreshed in the background once older than a minute. */
export function loadCatalog(): Promise<CatalogResponse> {
  return catalogCache.get();
}
/** Refreshes the full catalog only when this visit loaded it (search, all products); it is large. */
export const refreshCatalog = () => catalogCache.refreshLoaded();
export const catalogIsStale = () => catalogCache.isStale();

export function stockLimit(product:Product|undefined,variant?:Variant):number{return product?.inventoryEnabled===false?99:Math.max(0,Number(variant?.stock??product?.stock)||0)}
export function productAvailable(product:Product,variant?:Variant):boolean{return product.inventoryEnabled===false||(variant?variant.stock>0:product.variants?.length?product.variants.some(item=>item.stock>0):product.inStock)}

/** Translated text for `language`, or "" so callers fall back to the base (source-language) field. */
/** 1.9.4: a variant's name in the visitor's language (falls back to the store's source text). */
export function variantText(variant: Variant, language: string) {
 return catalogText(variant, language, "name") || variant.name;
}
/** 1.9.4: splits "اللون: أبيض" into its repeated prefix and the value, so compact chips can hide the prefix. */
export function variantParts(label: string) {
 const match = /^([^:：]{1,24}[:：])\s*(\S.*)$/.exec(label);
 return match ? {prefix: match[1], value: match[2]} : {prefix: "", value: label};
}
/** 1.9.4: the option group's title is stored only in the source language, so other languages show the translated generic word. */
export function optionTitle(product: Product, language: string, sourceCode: string, fallback: string) {
 return language === sourceCode && product.variantName ? product.variantName : fallback;
}
export function catalogText(item: {translations?: CatalogTranslations}, language: string, field: "name" | "description" | "specifications") {
 return item.translations?.[language]?.[field] || "";
}

export function matchesLocale(product: Product, query: string, language: string) {
 if (matches(product, query)) return true;
 const searchable = norm([
  product.itemNumber, catalogText(product, language, "name"),
  catalogText(product, language, "description"), catalogText(product, language, "specifications"),
  ...(product.variants || []).map(variant => catalogText(variant, language, "name")),
 ].join(" "));
 return norm(query).split(/\s+/).filter(Boolean).every(term => searchable.includes(term));
}
