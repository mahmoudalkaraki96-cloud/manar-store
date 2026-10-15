import {recordCart} from './cart-metrics';
import {recordBrowserActivity} from './browser-activity';
type Database=Parameters<typeof recordCart>[1];
export async function recordCartWithActivity(request:Request,db:Database){
 const response=await recordCart(request,db);
 if(response.ok){const cookie=response.headers.get('set-cookie')||request.headers.get('cookie')||'';const id=cookie.match(/(?:^|;\s*)__Host-manar-cart=([a-f0-9-]{36})(?:;|$)/)?.[1];if(id)await recordBrowserActivity(request,db,id);}
 return response;
}
