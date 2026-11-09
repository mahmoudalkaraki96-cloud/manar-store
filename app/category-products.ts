type CategoryNode={id:number;parentId:number|null;active?:boolean};
type CategorizedProduct={id:number;categoryId:number|null;active?:boolean};

export function categoryTreeIds(categories:readonly CategoryNode[],rootId:number):Set<number>{
 const visible=categories.filter(category=>category.active!==false);
 if(!visible.some(category=>category.id===rootId))return new Set();
 const ids=new Set<number>([rootId]);
 let added=true;
 while(added){added=false;for(const category of visible)if(category.parentId!=null&&ids.has(category.parentId)&&!ids.has(category.id)){ids.add(category.id);added=true}}
 return ids;
}

export function categoryProducts<P extends CategorizedProduct>(categories:readonly CategoryNode[],products:readonly P[],rootId:number,includeDescendants=false):P[]{
 const ids=includeDescendants?categoryTreeIds(categories,rootId):new Set([rootId]),seen=new Set<number>();
 return products.filter(product=>{if(product.active===false||product.categoryId==null||!ids.has(product.categoryId)||seen.has(product.id))return false;seen.add(product.id);return true});
}
