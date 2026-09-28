const LOCAL_MEDIA_PREFIX="/media/";

export function productThumbnail(source:string|undefined,width=480){
 if(!source)return "";
 if(source.startsWith("/cdn-cgi/image/"))return source;
 try{
  const parsed=new URL(source,"https://manarstore.ps");
  if(!parsed.pathname.startsWith(LOCAL_MEDIA_PREFIX))return source;
  const safeWidth=Math.max(120,Math.min(960,Math.round(width)));
  return `/cdn-cgi/image/width=${safeWidth},fit=scale-down,quality=72,format=auto,onerror=redirect${parsed.pathname}${parsed.search}`;
 }catch{
  return source;
 }
}
