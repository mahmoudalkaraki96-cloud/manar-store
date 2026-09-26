import type {Product,Variant} from "./catalog-types";
import {trackEcommerce} from "./analytics";

export type CartLine={productId:number;variantId?:number;variantSku?:string;variantName?:string;customizations?:Record<string,string>;notes?:string;qty:number;price:number;image?:string};
const key=(name:string)=>`store:${typeof window!=="undefined"?window.location.hostname:"local"}:${name}`;
export const cartStorageKey=()=>key("cart");
export function loadCart():Record<string,CartLine>{
 if(typeof window==="undefined")return {};
 try{
  const current=JSON.parse(localStorage.getItem(cartStorageKey())||"{}") as Record<string,CartLine>;
  const legacy=JSON.parse(localStorage.getItem("manar_cart")||"{}") as Record<string,CartLine>;
  const merged={...legacy,...current};
  if(Object.keys(legacy).length){localStorage.setItem(cartStorageKey(),JSON.stringify(merged));localStorage.removeItem("manar_cart")}
  return merged;
 }catch{return {}}
}
export function saveCart(cart:Record<string,CartLine>){
 localStorage.setItem(cartStorageKey(),JSON.stringify(cart));
 window.dispatchEvent(new CustomEvent("manar:cart",{detail:cart}));
}
export function addCartItem(product:Product,variant?:Variant,qty=1,customizations:Record<string,string>={},unique=false){
 if(variant?variant.stock<=0:!product.inStock)return loadCart();
 const cart=loadCart(),base=`${product.id}:${variant?.id||"base"}`,key=unique?`${base}:custom:${crypto.randomUUID()}`:base,line=cart[key];
 cart[key]={productId:product.id,variantId:variant?.id,variantSku:variant?.sku,variantName:variant?.name,customizations,notes:line?.notes||"",qty:(line?.qty||0)+qty,price:variant?.price??product.price,image:variant?.image||product.image};
 saveCart(cart);
 trackEcommerce("add_to_cart",{currency:"ILS",value:(variant?.price??product.price)*qty,items:[{item_id:String(product.id),item_name:product.name,item_variant:variant?.name,item_category:product.category,price:variant?.price??product.price,quantity:qty}]});
 return cart;
}
export const cartCount=(cart:Record<string,CartLine>)=>Object.values(cart).reduce((sum,line)=>sum+(Number(line.qty)||0),0);
export function syncCart(saved:Record<string,CartLine>,products:Product[]){
 const next:Record<string,CartLine>={};
 for(const [savedKey,line] of Object.entries(saved)){
  const product=products.find(item=>item.id===line.productId);if(!product)continue;
  const variant=product.variants?.length?(product.variants.find(item=>item.id===line.variantId&&item.stock>0)||product.variants.find(item=>item.stock>0)):undefined;
  if(product.variants?.length&&!variant)continue;
  const stock=variant?variant.stock:product.stock;if(stock<=0)continue;
  const customized=(line.customizations&&Object.keys(line.customizations).length>0)||Boolean(line.notes),itemKey=customized?savedKey:`${product.id}:${variant?.id||"base"}`,qty=Math.min(Math.max(1,Number(line.qty)||1),stock),price=variant?.price??product.price;
  next[itemKey]={productId:product.id,variantId:variant?.id,variantSku:variant?.sku,variantName:variant?.name,customizations:line.customizations||{},notes:line.notes||"",qty:(next[itemKey]?.qty||0)+qty,price,image:variant?.image||product.image};
  next[itemKey].qty=Math.min(next[itemKey].qty,stock);
 }
 return next;
}
