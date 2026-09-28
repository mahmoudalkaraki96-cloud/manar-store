export function productThumbnail(source:string|undefined,_width=480){
 if(!source)return "";
 try{
  const parsed=new URL(source,"https://manarstore.ps");
  if(parsed.pathname.startsWith("/media/thumbnails/"))return source;
  if(parsed.pathname.startsWith("/media/")){
   const relative=parsed.pathname.slice("/media/".length).replace(/\.[^./]+$/,".webp");
   return `/media/thumbnails/w480/${relative}`;
  }
  if(parsed.pathname.startsWith("/product-images/")){
   const relative=parsed.pathname.slice(1).replace(/\.[^./]+$/,".webp");
   return `/media/thumbnails/w480/${relative}`;
  }
  return source;
 }catch{
  return source;
 }
}
