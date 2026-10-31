import type{Category}from'../catalog-types';
import{categoryLabel}from'./product-filters';
export function orderedAdminCategories(categories:Category[],query=''){
 const seen=new Set<number>(),ordered:Category[]=[];
 const sorted=[...categories].sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0)||a.name.localeCompare(b.name,'ar'));
 const visit=(category:Category)=>{if(seen.has(category.id))return;seen.add(category.id);ordered.push(category);for(const child of sorted)if(child.parentId===category.id)visit(child)};
 for(const category of sorted)if(category.parentId==null)visit(category);
 for(const category of sorted)visit(category);
 const term=query.trim().toLocaleLowerCase('ar');return term?ordered.filter(category=>categoryLabel(category.id,categories).toLocaleLowerCase('ar').includes(term)||String(category.categoryNumber||'').includes(term)):ordered;
}
