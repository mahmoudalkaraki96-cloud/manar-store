// Client loaders for /api/catalog/<view> (1.8.6): each page loads only the products it shows.
// Same {categories, products} shape and the same one-minute background refresh as the full catalog.
import {freshCache,type CatalogResponse} from "./catalog-types";

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
function view(path:string){
 let cache=views.get(path);
 if(!cache){cache=freshCache<CatalogResponse>("catalog:"+path,()=>fetchView(path));views.set(path,cache)}
 return cache.get();
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
