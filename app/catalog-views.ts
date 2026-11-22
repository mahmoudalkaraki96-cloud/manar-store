// Client loaders for /api/catalog/<view> (1.8.6): each page loads only the products it shows.
// Same {categories, products} shape and the same one-minute background refresh as the full catalog.
import {freshCache,type CatalogResponse,type Category,type Product} from "./catalog-types";

type View=ReturnType<typeof freshCache<CatalogResponse>>;
const views=new Map<string,View>();

function fetchView(path:string):Promise<CatalogResponse>{
 return fetch(path,{cache:"no-store"}).then(response=>{
  // Unknown category/product: answer like the full catalog would (categories, no products) so pages show "not found".
  if(response.status===404&&!path.startsWith("/api/catalog/categories"))return loadCategories().then(data=>({...data,products:[]}));
  if(!response.ok)throw new Error("catalog_view_"+response.status);
  return response.json() as Promise<CatalogResponse>;
 });
}
// 1.9.6: every product a page has loaded, so opening one shows it at once while its own view loads.
const known=new Map<number,Product>();
let knownCategories:Category[]=[];
function remember(data:CatalogResponse){
 for(const product of data.products||[])known.set(product.id,product);
 if(data.categories?.length)knownCategories=data.categories;
 return data;
}
function view(path:string){
 let cache=views.get(path);
 if(!cache){cache=freshCache<CatalogResponse>("catalog:"+path,()=>fetchView(path));views.set(path,cache)}
 return cache.get().then(remember);
}
/** A product already loaded by this visit (with its loaded neighbours from the same category), or undefined. */
export function productPreview(id:number|string):CatalogResponse|undefined{
 const product=known.get(Number(id));
 if(!product)return undefined;
 const related=[...known.values()].filter(item=>item.id!==product.id&&item.categoryId===product.categoryId).slice(0,12);
 return {categories:knownCategories,products:[product,...related]};
}

export const loadCategories=()=>view("/api/catalog/categories");
export const loadHomeCatalog=()=>view("/api/catalog/home");
export const loadCategoryCatalog=(slug:string)=>view(`/api/catalog/category/${encodeURIComponent(slug)}`);
export const loadCollectionCatalog=(name:string)=>view(`/api/catalog/collection/${encodeURIComponent(name)}`);
export const loadProductCatalog=(id:number|string)=>view(`/api/catalog/product/${encodeURIComponent(String(id))}`);
/** Products for the cart and favorites, by id. */
export function loadItemsCatalog(ids:number[]){
 const list=[...new Set(ids.filter(id=>Number.isInteger(id)&&id>0))].sort((a,b)=>a-b);
 return list.length?view(`/api/catalog/items?ids=${list.join(",")}`):loadCategories().then(data=>({...data,products:[]}));
}
/** Header search suggestions; not kept between queries. */
export function searchCatalog(query:string,language:string):Promise<CatalogResponse>{
 return fetchView(`/api/catalog/search?q=${encodeURIComponent(query.trim())}&lang=${encodeURIComponent(language)}`);
}
export const refreshCatalogViews=()=>Promise.allSettled([...views.values()].map(cache=>cache.refresh()));
export const catalogViewsStale=()=>[...views.values()].some(cache=>cache.isStale());
