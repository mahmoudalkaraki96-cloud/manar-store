const DESTINATION='https://manar-business-manager.ideal-mesa-1386.chatgpt.site/api/meta/webhook';
const MAX=262144;
async function readBody(request){const reader=request.body?.getReader();if(!reader)return new Uint8Array();const chunks=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX){await reader.cancel();throw Error('too_large');}chunks.push(value);}const body=new Uint8Array(size);let at=0;for(const chunk of chunks){body.set(chunk,at);at+=chunk.length;}return body;}
async function verify(body,signature,secret){if(!/^sha256=[a-f0-9]{64}$/.test(signature||''))return false;const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);return crypto.subtle.verify('HMAC',key,Uint8Array.from(signature.slice(7).match(/../g),x=>parseInt(x,16)),body);}
export async function handle(request,env,send=fetch){
 const url=new URL(request.url);const reply=(s,status=200)=>new Response(s,{status,headers:{'Content-Type':'text/plain','Cache-Control':'no-store'}});
 if(url.pathname==='/health')return reply('Manar gateway deployed; this does not confirm Meta connection.');
 if(url.pathname!=='/webhook')return reply('Not found',404);
 if(request.method==='GET'){
  if(!env.META_VERIFY_TOKEN)return reply('Not configured',503);
  const challenge=url.searchParams.get('hub.challenge');
  if(url.searchParams.get('hub.mode')!=='subscribe'||url.searchParams.get('hub.verify_token')!==env.META_VERIFY_TOKEN||!challenge||challenge.length>2000)return reply('Forbidden',403);
  return reply(challenge);
 }
 if(request.method!=='POST')return reply('Method not allowed',405);
 if(!env.META_APP_SECRET||!env.SITES_ACCESS_TOKEN)return reply('Not configured',503);
 let body;try{body=await readBody(request);}catch{return reply('Too large',413);}
 const signature=request.headers.get('x-hub-signature-256');if(!await verify(body,signature,env.META_APP_SECRET))return reply('Forbidden',403);
 try{const result=await send(DESTINATION,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(12000),headers:{'Content-Type':'application/json','X-Hub-Signature-256':signature,'OAI-Sites-Authorization':'Bearer '+env.SITES_ACCESS_TOKEN},body});
 // Reject login HTML and redirects; never forward the access token to redirected origins.
 if(result.status!==200||(await result.text()).trim()!=='EVENT_RECEIVED')return reply('Delivery unavailable',503);
 return reply('EVENT_RECEIVED');}catch{return reply('Delivery unavailable',503);}
}
export default {fetch(request,env){return handle(request,env);}};
