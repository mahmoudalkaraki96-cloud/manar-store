import {thumbnailWidth} from "../shared/image-sizes";

/** True for images the thumbnail service can resize (our own uploads, not SVG). */
function resizable(source:string){
 const parsed=new URL(source,typeof location!=="undefined"?location.origin:"https://store.invalid");
 if(parsed.pathname.startsWith("/_media/thumbnail")||parsed.pathname.startsWith("/media/thumbnails/"))return null;
 if(!(parsed.pathname.startsWith("/media/")||parsed.pathname.startsWith("/product-images/")))return null;
 if(/\.svg(?:$|\?)/i.test(parsed.pathname))return null;
 return parsed.pathname+parsed.search;
}

export function productThumbnail(source:string|undefined,width=480,format?:"avif"){
 if(!source)return "";
 try{
  const original=resizable(source);
  if(!original)return source;
  return `/_media/thumbnail?src=${encodeURIComponent(original)}&width=${thumbnailWidth(width)}${format?`&format=${format}`:""}`;
 }catch{return source}
}

/**
 * Product-page image in sizes for every screen: phones take 1080, large screens 1280, small layouts 640.
 * AVIF is offered first through <picture>; browsers without AVIF use the WebP list.
 */
export function productImageSources(source:string|undefined){
 if(!source)return null;
 try{
  if(!resizable(source))return null;
  const list=(format?:"avif")=>[640,1080,1280].map(width=>`${productThumbnail(source,width,width>=1080?format:undefined)} ${width}w`).join(", ");
  return {src:productThumbnail(source,1080),webp:list(),avif:list("avif"),sizes:"(max-width: 900px) 100vw, 640px"};
 }catch{return null}
}
