export type CatalogTranslations = Partial<Record<"EN" | "HE", Partial<Record<"name" | "description" | "specifications", string>>>>;

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

let catalogPromise: Promise<CatalogResponse> | null = null;

export function loadCatalog(): Promise<CatalogResponse> {
  if (catalogPromise) return catalogPromise;
  catalogPromise = fetch(`/api/catalog?v=${Date.now()}`, { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error("تعذر تحميل بيانات المتجر");
      return response.json() as Promise<CatalogResponse>;
    })
    .catch((error) => {
      catalogPromise = null;
      throw error;
    });
  return catalogPromise;
}

export function stockLimit(product:Product|undefined,variant?:Variant):number{return product?.inventoryEnabled===false?99:Math.max(0,Number(variant?.stock??product?.stock)||0)}
export function productAvailable(product:Product,variant?:Variant):boolean{return product.inventoryEnabled===false||(variant?variant.stock>0:product.variants?.length?product.variants.some(item=>item.stock>0):product.inStock)}

export function catalogText(item: {translations?: CatalogTranslations}, language: "AR" | "EN" | "HE", field: "name" | "description" | "specifications") {
 return language === "AR" ? "" : item.translations?.[language]?.[field] || "";
}

export function matchesLocale(product: Product, query: string, language: "AR" | "EN" | "HE") {
 if (language === "AR") return matches(product, query);
 const searchable = norm([
  product.itemNumber, catalogText(product, language, "name"),
  catalogText(product, language, "description"), catalogText(product, language, "specifications"),
  ...(product.variants || []).map(variant => catalogText(variant, language, "name")),
 ].join(" "));
 return norm(query).split(/\s+/).filter(Boolean).every(term => searchable.includes(term));
}
