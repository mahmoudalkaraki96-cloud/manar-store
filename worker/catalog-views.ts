// Page-sized slices of the catalog (1.8.6). Every view keeps the {categories, products} shape of /api/catalog,
// with only the products that page shows, so the storefront's existing filtering and sorting stay unchanged.
import {matchesLocale,type CatalogResponse,type Category,type Product} from "../app/catalog-types";

export const CATALOG_VIEW_NAMES=["categories","home","category","collection","product","items","search"] as const;
const MAX_IDS=200,MAX_SEARCH=60,RELATED=12;

function treeIds(categories:Category[],rootId:number){
 const ids=new Set<number>([rootId]);let added=true;
 while(added){added=false;for(const c of categories)if(c.parentId!=null&&ids.has(c.parentId)&&!ids.has(c.id)){ids.add(c.id);added=true}}
 return ids;
}
const pick=(data:CatalogResponse,products:Product[]):CatalogResponse=>{
 const seen=new Set<number>(),order=new Map(data.products.map((p,i)=>[p.id,i]));
 // Same relative order as the full list, so "first N" rows on the client match what the full list would give.
 const list=products.filter(p=>!seen.has(p.id)&&seen.add(p.id)).sort((a,b)=>(order.get(a.id)??0)-(order.get(b.id)??0));
 return {...data,products:list};
};
const top=(list:Product[],limit:number)=>list.slice(0,limit);
const collections:Record<string,(products:Product[])=>Product[]>={
 offers:p=>p.filter(x=>x.oldPrice),
 featured:p=>p.filter(x=>x.featured),
 newest:p=>[...p].sort((a,b)=>b.createdAt-a.createdAt),
 "most-ordered":p=>p.filter(x=>x.orders>0).sort((a,b)=>b.orders-a.orders),
 "top-rated":p=>p.filter(x=>x.ratingCount>0).sort((a,b)=>b.rating-a.rating),
};

export function categoriesView(data:CatalogResponse):CatalogResponse{return {...data,products:[]}}

/** Union of every home-page row (each limited to the store's row size) plus each top-level category's row. */
export function homeView(data:CatalogResponse,limit:number):CatalogResponse{
 const n=Math.max(1,Math.min(24,Math.round(limit)||6)),chosen:Product[]=[];
 for(const select of Object.values(collections))chosen.push(...top(select(data.products),n));
 for(const root of data.categories.filter(c=>c.parentId==null)){const ids=treeIds(data.categories,root.id);chosen.push(...top(data.products.filter(p=>p.categoryId!=null&&ids.has(p.categoryId)),n))}
 return pick(data,chosen);
}

/** All products in a category and its subcategories (the category page filters and sorts them). */
export function categoryView(data:CatalogResponse,slug:string):CatalogResponse|null{
 const category=data.categories.find(c=>c.slug===slug);if(!category)return null;
 const ids=treeIds(data.categories,category.id);
 return pick(data,data.products.filter(p=>p.categoryId!=null&&ids.has(p.categoryId)));
}

export function collectionView(data:CatalogResponse,name:string):CatalogResponse|null{
 const select=collections[name];return select?pick(data,select(data.products)):null;
}

/** One product (by id or item number) and the products the page shows as related (same category). */
export function productView(data:CatalogResponse,key:number):CatalogResponse|null{
 const product=data.products.find(p=>p.id===key)||data.products.find(p=>p.itemNumber===key);if(!product)return null;
 return pick(data,[product,...top(data.products.filter(p=>p.id!==product.id&&p.categoryId===product.categoryId),RELATED)]);
}

export function itemsView(data:CatalogResponse,ids:number[]):CatalogResponse{
 const wanted=new Set(ids.filter(id=>Number.isInteger(id)&&id>0).slice(0,MAX_IDS));
 return pick(data,data.products.filter(p=>wanted.has(p.id)));
}

/** Header search: products matching in the visitor's language (or the base text), capped for a dropdown. */
export function searchView(data:CatalogResponse,query:string,language:string):CatalogResponse{
 const q=query.trim().slice(0,80);if(!q)return {...data,products:[]};
 return {...data,products:data.products.filter(p=>matchesLocale(p,q,language)).slice(0,MAX_SEARCH)};
}

/** Parses /api/catalog/<view>[/<arg>]; null when the path is not a catalog view. */
export function catalogViewRequest(pathname:string,search:URLSearchParams){
 const m=pathname.match(/^\/api\/catalog\/([a-z]+)(?:\/([^/]+))?\/?$/);if(!m)return null;
 const [,view,raw]=m,arg=raw?decodeURIComponent(raw):"";
 switch(view){
  case "categories":return {view,arg:""};
  case "home":return {view,arg:""};
  case "category":return arg?{view,arg}:null;
  case "collection":return arg in collections?{view,arg}:null;
  case "product":return /^\d+$/.test(arg)?{view,arg}:null;
  case "items":return {view,arg:(search.get("ids")||"").split(",").filter(id=>/^\d+$/.test(id)).slice(0,MAX_IDS).sort((a,b)=>Number(a)-Number(b)).join(",")};
  case "search":return {view,arg:(search.get("q")||"").trim().slice(0,80),lang:(search.get("lang")||"").toUpperCase().replace(/[^A-Z-]/g,"").slice(0,8)};
  default:return null;
 }
}
