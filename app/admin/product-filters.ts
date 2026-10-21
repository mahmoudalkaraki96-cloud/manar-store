import {matches,norm,type Product,type Category} from '../catalog-types';
export type ProductFilters={search:string;status:string;category:string;supplier:string;variants:string;image:string;min:string;max:string;sort:string;name:string;number:string;categoryText:string;featured:string;stockMin:string;stockMax:string;viewsMin:string};
export const emptyProductFilters:ProductFilters={search:'',status:'all',category:'all',supplier:'all',variants:'all',image:'all',min:'',max:'',sort:'newest',name:'',number:'',categoryText:'',featured:'all',stockMin:'',stockMax:'',viewsMin:''};
export function categoryLabel(id:number,categories:Category[]):string {
 const names:string[]=[],seen=new Set<number>();let current=categories.find(c=>c.id===id);
 while(current&&!seen.has(current.id)){seen.add(current.id);names.unshift(current.name);current=categories.find(c=>c.id===current!.parentId)}
 return names.join(' / ');
}
export function filterProducts(products:Product[],categories:Category[],f:ProductFilters){
 const categoryIds=new Set<number>();
 if(f.category!=='all'&&f.category!=='none'){
  categoryIds.add(Number(f.category));let prior=-1;
  while(prior!==categoryIds.size){prior=categoryIds.size;for(const c of categories)if(c.parentId!=null&&categoryIds.has(c.parentId))categoryIds.add(c.id)}
 }
 const rows=products.filter(p=>{
  if(f.search.trim()&&!matches(p,f.search))return false;
  const stock=p.variants?.length?p.variants.reduce((sum,v)=>sum+Math.max(0,v.stock),0):p.stock;
  const flowerText=(text:string)=>norm(text).replace(/ورود/g,'ورد');
  if(f.name.trim()&&!flowerText(f.name).split(/\s+/).every(term=>flowerText(p.name).includes(term)))return false;
  if(f.number.trim()&&!String(p.itemNumber).includes(f.number.trim().replace(/^#/,'')))return false;
  if(f.categoryText.trim()&&!norm(categoryLabel(p.categoryId!,categories)).includes(norm(f.categoryText.trim())))return false;
  if(f.featured==='yes'&&!p.featured||f.featured==='no'&&p.featured)return false;
  if(f.stockMin!==''&&stock<Number(f.stockMin)||f.stockMax!==''&&stock>Number(f.stockMax)||f.viewsMin!==''&&(p.views||0)<Number(f.viewsMin))return false;
  if(f.status==='active'&&!p.active||f.status==='draft'&&p.active||f.status==='soldout'&&(!p.active||stock>0)||f.status==='low'&&(!p.active||stock<=0||stock>5)||f.status==='available'&&(!p.active||stock<=0)||f.status==='featured'&&!p.featured)return false;
  if(f.category==='none'&&p.categoryId!=null||f.category!=='all'&&f.category!=='none'&&!categoryIds.has(p.categoryId!))return false;
  const suppliers=p.suppliers||[];
  if(f.supplier==='none'&&suppliers.length||f.supplier!=='all'&&f.supplier!=='none'&&!suppliers.some(s=>String(s.id)===f.supplier))return false;
  if(f.variants==='yes'&&!p.variants?.length||f.variants==='no'&&p.variants?.length)return false;
  if(f.image==='yes'&&!p.image||f.image==='no'&&p.image)return false;
  const prices=p.variants?.length?p.variants.map(v=>v.price??p.price):[p.price];
  // A single purchasable option must satisfy both price boundaries.
  return prices.some(price=>(f.min===''||price>=Number(f.min))&&(f.max===''||price<=Number(f.max)));
 });
 const stock=(p:Product)=>p.variants?.length?p.variants.reduce((n,v)=>n+Math.max(0,v.stock),0):p.stock;
 const price=(p:Product)=>p.variants?.length?Math.min(...p.variants.map(v=>v.price??p.price)):p.price;
 return rows.sort((a,b)=>f.sort==='name'?a.name.localeCompare(b.name,'ar'):f.sort==='number'?a.itemNumber-b.itemNumber:f.sort==='stock'?stock(a)-stock(b):f.sort==='price'?price(a)-price(b):b.createdAt-a.createdAt||b.id-a.id);
}
