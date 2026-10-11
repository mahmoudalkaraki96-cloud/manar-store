import {env} from 'cloudflare:workers';
import {accessError} from '@/lib/access.mjs';
import {budgetStatus} from '@/lib/budget.mjs';
export async function GET(request:Request){const d=accessError(request);if(d)return Response.json({error:d.error},{status:d.status});return Response.json(await budgetStatus(env.DB));}
export async function PATCH(request:Request){const d=accessError(request,{write:true,business:'manar'});if(d)return Response.json({error:d.error},{status:d.status});const x=await request.json();if(typeof x.enabled!=='boolean')return Response.json({error:'قيمة غير صحيحة'},{status:400});await env.DB.prepare('UPDATE ai_control SET enabled=? WHERE id=1').bind(x.enabled?1:0).run();return Response.json(await budgetStatus(env.DB));}
