type Category = { id: number; active: boolean; parentId: number | null; name: string };
type Variant = { id: number; name: string };
type Product = { id: number; active: boolean; categoryId: number | null; category: string; name: string; variants?: Variant[] };
type Catalog = { categories: Category[]; products: Product[] };
export type TranslationEntry = { key: string; source: string; en: string; he: string; status: string };
export const storeLanguages: string[];
export function previewCatalogImport(catalog: Catalog, rows: unknown[]): {
  accepted: TranslationEntry[];
  errors: { line: number; code: string; key?: string }[];
};
export function localizeCatalog<T extends Catalog>(catalog: T, entries: TranslationEntry[], language: string): T;
