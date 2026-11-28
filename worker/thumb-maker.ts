/// <reference path="./wasm-modules.d.ts" />
// 1.10.2: thumbnails made inside the worker with WebAssembly codecs, so they do not depend on the
// Cloudflare Images transformation quota (5,000 unique transformations a month). Used as the
// fallback when env.IMAGES fails, and by the scheduled backfill that pre-makes every product and
// variant thumbnail once and stores it in R2.
import decodeWebp, {init as initWebpDecode} from "@jsquash/webp/decode";
import encodeWebp, {init as initWebpEncode} from "@jsquash/webp/encode";
import decodeJpeg, {init as initJpegDecode} from "@jsquash/jpeg/decode";
import decodePng, {init as initPngDecode} from "@jsquash/png/decode";
import resize, {initResize} from "@jsquash/resize";
import WEBP_DEC from "@jsquash/webp/codec/dec/webp_dec.wasm?module";
import WEBP_ENC_SIMD from "@jsquash/webp/codec/enc/webp_enc_simd.wasm?module";
import JPEG_DEC from "@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm?module";
import PNG_DEC from "@jsquash/png/codec/pkg/squoosh_png_bg.wasm?module";
import RESIZE from "@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm?module";

// Workers have no ImageData; the codecs only need this shape.
class WorkerImageData {
  data:Uint8ClampedArray;width:number;height:number;colorSpace="srgb";
  constructor(data:Uint8ClampedArray|number,width:number,height?:number){
    if(typeof data==="number"){this.width=data;this.height=width;this.data=new Uint8ClampedArray(data*width*4)}
    else{this.data=data;this.width=width;this.height=height??data.length/4/width}
  }
}
const scope=globalThis as unknown as {ImageData?:unknown};
if(typeof scope.ImageData==="undefined")scope.ImageData=WorkerImageData;

let ready:Promise<unknown>|null=null;
function initCodecs(){
  ready??=Promise.all([
    initWebpDecode(WEBP_DEC as WebAssembly.Module),
    initWebpEncode(WEBP_ENC_SIMD as WebAssembly.Module),
    initJpegDecode(JPEG_DEC as WebAssembly.Module),
    initPngDecode(PNG_DEC as unknown as WebAssembly.Module),
    initResize(RESIZE as unknown as WebAssembly.Module),
  ]).catch(error=>{ready=null;throw error});
  return ready;
}

type Pixels={data:Uint8ClampedArray;width:number;height:number};

function sniff(bytes:Uint8Array){
  if(bytes[0]===0xff&&bytes[1]===0xd8)return "jpeg";
  if(bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47)return "png";
  if(bytes[0]===0x52&&bytes[1]===0x49&&bytes[2]===0x46&&bytes[3]===0x46&&bytes[8]===0x57&&bytes[9]===0x45&&bytes[10]===0x42&&bytes[11]===0x50)return "webp";
  return null;
}

/** Decodes an image once so several widths can be made from it. Returns null for formats we cannot read (GIF, AVIF, SVG…). */
export async function decodeImage(buffer:ArrayBuffer):Promise<Pixels|null>{
  const kind=sniff(new Uint8Array(buffer,0,Math.min(16,buffer.byteLength)));
  if(!kind)return null;
  await initCodecs();
  if(kind==="webp")return await decodeWebp(buffer) as Pixels;
  if(kind==="jpeg")return await decodeJpeg(buffer) as Pixels;
  return await decodePng(buffer) as Pixels;
}

/** Resizes to the given width (never enlarges) and encodes WebP. */
export async function encodeThumbnail(image:Pixels,width:number,quality:number):Promise<ArrayBuffer>{
  await initCodecs();
  let target=image;
  if(image.width>width){
    const height=Math.max(1,Math.round(image.height*width/image.width));
    target=await resize(image as unknown as ImageData,{width,height,method:"triangle",fitMethod:"stretch",premultiply:true,linearRGB:false}) as Pixels;
  }
  return encodeWebp(target as unknown as ImageData,{quality,method:4});
}

/** One-shot helper: bytes in, WebP thumbnail out, or null when the format is not supported. */
export async function makeThumbnail(buffer:ArrayBuffer,width:number,quality:number){
  const image=await decodeImage(buffer);
  return image?encodeThumbnail(image,width,quality):null;
}
