const thumbnailWidth=(requested:number)=>requested<=320?256:requested<=480?384:640;

export function productThumbnail(source:string|undefined,width=480){
 if(!source)return "";
 try{
  const parsed=new URL(source,typeof location!=="undefined"?location.origin:"https://store.invalid");
  if(parsed.pathname.startsWith("/_media/thumbnail")||parsed.pathname.startsWith("/media/thumbnails/"))return source;
  if(parsed.pathname.startsWith("/media/")||parsed.pathname.startsWith("/product-images/")){
   if(/\.svg(?:$|\?)/i.test(parsed.pathname))return source;
   const original=parsed.pathname+parsed.search;
   return `/_media/thumbnail?src=${encodeURIComponent(original)}&width=${thumbnailWidth(width)}`;
  }
  return source;
 }catch{return source}
}
