const STORED_THUMBNAILS:Record<string,string>={
 "/media/edited/2026-09-19/trial19/product-1221.webp":"/media/thumbnails/w480/edited/2026-09-19/trial19/product-1221.webp",
 "/media/edited/2026-09-19/batch50-1/product-1220.webp":"/media/thumbnails/w480/edited/2026-09-19/batch50-1/product-1220.webp",
 "/media/edited/2026-09-19/trial19/product-1219.webp":"/media/thumbnails/w480/edited/2026-09-19/trial19/product-1219.webp",
 "/media/edited/2026-09-19/batch50-1/product-1218.webp":"/media/thumbnails/w480/edited/2026-09-19/batch50-1/product-1218.webp",
 "/media/edited/2026-09-19/batch50-1/product-1217.webp":"/media/thumbnails/w480/edited/2026-09-19/batch50-1/product-1217.webp",
};

export function productThumbnail(source:string|undefined,_width=480){
 if(!source)return "";
 try{
  const parsed=new URL(source,"https://manarstore.ps");
  return STORED_THUMBNAILS[parsed.pathname]||source;
 }catch{
  return source;
 }
}
