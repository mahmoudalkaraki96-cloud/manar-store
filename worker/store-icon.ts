interface IconDatabase{prepare(sql:string):{first<T>():Promise<T|null>}}
export const STORE_ICON_PATH="/_store/favicon";
const neutralIcon='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#475569"/><path d="M17 25h30l-3 25H20zM24 25v-6a8 8 0 0 1 16 0v6" fill="none" stroke="white" stroke-width="4"/></svg>';
export async function storeIconResponse(request:Request,db:IconDatabase):Promise<Response>{
 const headers={"cache-control":"no-store","x-content-type-options":"nosniff"};
 if(request.method!=="GET"&&request.method!=="HEAD")return new Response(null,{status:405,headers:{...headers,allow:"GET, HEAD"}});
 const settings=await db.prepare("SELECT favicon_url,logo_url FROM store_settings WHERE id=1").first<{favicon_url?:string;logo_url?:string}>();
 for(const source of [settings?.favicon_url,settings?.logo_url]){
  if(!source?.trim())continue;
  try{const target=new URL(source.trim(),request.url);if(target.protocol!=="https:"||target.username||target.password||target.pathname===STORE_ICON_PATH)continue;return new Response(null,{status:302,headers:{...headers,location:target.toString()}})}catch{}
 }
 return new Response(request.method==="HEAD"?null:neutralIcon,{headers:{...headers,"content-type":"image/svg+xml; charset=utf-8"}});
}
