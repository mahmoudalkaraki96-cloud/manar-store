import {env} from 'cloudflare:workers';
import {incomingMessages,validSignature} from '@/lib/meta-webhook.mjs';
export async function GET(request:Request){
 const vars=env as unknown as Record<string,string>;const u=new URL(request.url);
 if(!vars.META_VERIFY_TOKEN)return new Response('Not configured',{status:503});
 const challenge=u.searchParams.get('hub.challenge');
 if(u.searchParams.get('hub.mode')!=='subscribe'||u.searchParams.get('hub.verify_token')!==vars.META_VERIFY_TOKEN||!challenge||challenge.length>2000)return new Response('Forbidden',{status:403});
 return new Response(challenge,{headers:{'Content-Type':'text/plain','Cache-Control':'no-store'}});
}
export async function POST(request:Request){
 const vars=env as unknown as Record<string,string>;
 if(!vars.META_APP_SECRET)return new Response('Not configured',{status:503});
 // Hosting access is enforced by Sites. A relay must preserve the original body and Meta signature.
 if(Number(request.headers.get('content-length')||0)>262144)return new Response('Too large',{status:413});
 const reader=request.body?.getReader();if(!reader)return new Response('Bad request',{status:400});
 const chunks:Uint8Array[]=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>262144){await reader.cancel();return new Response('Too large',{status:413});}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}const body=new TextDecoder().decode(bytes);
 if(!await validSignature(body,request.headers.get('x-hub-signature-256'),vars.META_APP_SECRET))return new Response('Forbidden',{status:403});
 let payload;try{payload=JSON.parse(body);}catch{return new Response('Bad request',{status:400});}
 try{for(const message of incomingMessages(payload)){await env.DB.prepare('INSERT OR IGNORE INTO records (id,business,kind,payload,created) VALUES (?,?,?,?,?)').bind(message.id,'manar','incoming',JSON.stringify(message.payload),Date.now()).run();}return new Response('EVENT_RECEIVED');}catch{return new Response('Storage unavailable',{status:503});}
}
