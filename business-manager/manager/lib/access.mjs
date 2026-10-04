export const BUSINESSES=['manar','business2','business3'];
export function accessError(request,{write=false,business=null}={}){
 if(!request.headers.get('oai-authenticated-user-id')||!request.headers.get('oai-authenticated-user-email'))return {status:401,error:'تسجيل الدخول مطلوب'};
 if(write&&request.headers.get('origin')!==new URL(request.url).origin)return {status:403,error:'طلب غير مسموح'};
 if(business!==null&&!BUSINESSES.includes(business))return {status:400,error:'بزنس غير معروف'};
 if(write&&business!==null&&business!=='manar')return {status:403,error:'هذا البزنس غير مفعّل'};
 return null;
}
