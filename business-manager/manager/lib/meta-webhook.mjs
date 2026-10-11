export const MANAR_PAGE_ID='116720256838717';
export async function validSignature(body,signature,secret){
 if(!secret||!/^sha256=[a-f0-9]{64}$/.test(signature||''))return false;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 const bytes=Uint8Array.from(signature.slice(7).match(/../g),x=>parseInt(x,16));
 return crypto.subtle.verify('HMAC',key,bytes,new TextEncoder().encode(body));
}
export function incomingMessages(payload,pageId=MANAR_PAGE_ID){
 if(payload?.object!=='page'||!Array.isArray(payload.entry))return [];
 const result=[];
 for(const entry of payload.entry){
  if(String(entry.id)!==pageId||!Array.isArray(entry.messaging))continue;
  for(const event of entry.messaging){
   const message=event.message;
   if(!message||message.is_echo||typeof message.mid!=='string'||message.mid.length>300||String(event.recipient?.id)!==pageId||!/^\d{1,40}$/.test(String(event.sender?.id||'')))continue;
   const attachments=Array.isArray(message.attachments)?message.attachments.slice(0,10).map(x=>({type:String(x.type||'unknown').slice(0,30)})):[];
   const title=typeof message.text==='string'?message.text.slice(0,10000):attachments.length?'رسالة تحتوي مرفقًا؛ تحتاج مراجعة يدوية':'';
   if(!title)continue;
   result.push({id:'meta:'+pageId+':'+message.mid,payload:{title,sender:String(event.sender.id),channel:'Messenger',pageId,status:'بانتظار المراجعة',attachments,timestamp:Number.isFinite(event.timestamp)?event.timestamp:null}});
  }
 }
 return result;
}
