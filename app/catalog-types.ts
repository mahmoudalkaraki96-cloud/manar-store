export type Category = {
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
  catalogPromise = fetch("/api/catalog")
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
