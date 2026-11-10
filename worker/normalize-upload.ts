import {isHeifFile} from "../shared/heif";
type Images={input(stream:ReadableStream):{transform(options:Record<string,unknown>):{output(options:{format:string;quality:number}):Promise<{response():Response}>}}};
export class ImageUploadError extends Error{constructor(message:string,public status=422){super(message)}}
export async function normalizeHeifUpload(file:File,images:Images,options:{maxSize?:unknown;quality?:unknown}={}):Promise<File>{
 if(!isHeifFile(file))return file;
 if(file.size>12_000_000)throw new ImageUploadError("حجم الصورة يتجاوز 12MB",413);
 const bound=(value:unknown,fallback:number,min:number,max:number)=>{const n=Number(value);return Number.isFinite(n)&&n>0?Math.max(min,Math.min(max,n)):fallback};
 const maxSize=Math.round(bound(options.maxSize,1400,64,4096)),quality=Math.round(bound(options.quality,.75,.4,.95)*100);
 try{
  const converted=await images.input(file.stream()).transform({width:maxSize,height:maxSize,fit:"scale-down"}).output({format:"image/webp",quality});
  const response=converted.response();if(!response.ok)throw Error("decode_failed");
  const bytes=await response.arrayBuffer();if(!bytes.byteLength)throw Error("empty_image");
  if(bytes.byteLength>12_000_000)throw new ImageUploadError("حجم الصورة بعد التحويل يتجاوز 12MB",413);
  return new File([bytes],file.name.replace(/\.[^.]+$/,"")+".webp",{type:"image/webp"});
 }catch(error){if(error instanceof ImageUploadError)throw error;throw new ImageUploadError("تعذر تحويل صورة HEIC؛ تأكد من سلامة الملف أو جرّب تصديرها بصيغة JPG")}
}
