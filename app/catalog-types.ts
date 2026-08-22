export type Category = {
  id: number;
  categoryNumber: number;
  parentId: number | null;
  name: string;
  slug: string;
  description: string;
  bannerUrl: string;
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
  active: boolean;
  featured: boolean;
  views: number;
  orders: number;
  rating: number;
  variants?: Variant[];
};

export type CatalogResponse = { categories: Category[]; products: Product[] };

export const norm = (value: string) => value.toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");
export const matches = (product: Product, query: string) => norm(query).split(/\s+/).filter(Boolean).every((term) => norm(`${product.name} ${product.category} ${product.subcategory || ""} ${product.itemNumber} ${product.keywords || ""} ${(product.variants || []).map((variant) => `${variant.name} ${variant.sku}`).join(" ")}`).includes(term));

export async function loadCatalog(): Promise<CatalogResponse> {
  const response = await fetch("/api/catalog", { cache: "no-store" });
  if (!response.ok) throw new Error("تعذر تحميل بيانات المتجر");
  return response.json() as Promise<CatalogResponse>;
}
