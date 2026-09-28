const THUMBNAIL_PATHS=["/media/","/product-images/"];

export function productThumbnail(source:string|undefined,width=480){
 if(!source)return "";
 if(source.startsWith("/cdn-cgi/image/"))return source;
 try{
  const parsed=new URL(source,"https://manarstore.ps");
  if(!THUMBNAIL_PATHS.some(prefix=>parsed.pathname.startsWith(prefix)))return source;
  const safeWidth=Math.max(120,Math.min(960,Math.round(width)));
  return `/cdn-cgi/image/width=${safeWidth},fit=scale-down,quality=72,format=auto,onerror=redirect${parsed.pathname}${parsed.search}`;
 }catch{
  return source;
 }
}
