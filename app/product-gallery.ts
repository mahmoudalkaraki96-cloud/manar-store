import type {Product,Variant} from "./catalog-types";

const uniqueImages=(urls:Array<string|undefined>)=>[...new Set(urls.filter((url):url is string=>Boolean(url?.trim())))];

/** Variant media is exclusive. Product.images is the real general gallery;
 * Product.image may only be a variant fallback used by catalog cards. */
export function productGalleryImages(product:Product,variant?:Variant):string[]{
 const selected=uniqueImages([...(variant?.images||[]),variant?.image]);
 if(selected.length)return selected;
 const general=uniqueImages(product.images===undefined?[product.image]:product.images);
 if(general.length)return general;
 return variant?[]:uniqueImages([product.image]);
}
