import {reserveBudget,settleBudget,usageCost,budgetStatus} from '@/lib/budget.mjs';
import {accessError} from "@/lib/access.mjs";
import {env} from 'cloudflare:workers';
import {runManager} from '@/lib/manager.mjs';
const runtime=env as typeof env & {OPENAI_API_KEY?:string;OPENAI_MODEL?:string};
export async function GET(request:Request){const denied=accessError(request);if(denied)return Response.json({error:denied.error},{status:denied.status});return Response.json({configured:Boolean(runtime.OPENAI_API_KEY),model:'gpt-4.1-mini'});}
export async function POST(request:Request){
 const denied=accessError(request,{write:true,business:"manar"});if(denied)return Response.json({error:denied.error},{status:denied.status});
 if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'طلب غير مسموح'},{status:403});
 if(!runtime.OPENAI_API_KEY)return Response.json({error:'المدير جاهز برمجيًا، لكنه يحتاج مفتاح اتصال محفوظًا في إعدادات الاستضافة.'},{status:503});
 let reservation:string|null=null,charged=0,known=true,started=false;
 try{const x=await request.json();if(x.business!=='manar'||typeof x.message!=='string'||!x.message.trim()||x.message.length>2000)return Response.json({error:'تحقق من الرسالة والبزنس المحدد'},{status:400});
 const r=await env.DB.prepare('SELECT kind,payload FROM records WHERE business=? ORDER BY created DESC LIMIT 100').bind('manar').all();const records=r.results.reverse().map((v:any)=>({...v,payload:JSON.parse(v.payload)}));
 reservation=await reserveBudget(env.DB);
 const result=await runManager({key:runtime.OPENAI_API_KEY,model:'gpt-4.1-mini',message:x.message,onUsage:async(u:any)=>{try{charged+=usageCost(u);}catch{known=false;}},beforeCall:async()=>{if(!(await budgetStatus(env.DB)).enabled)throw Error('AI_PAUSED');started=true;},records,createTask:async(payload:any)=>{const id=crypto.randomUUID();await env.DB.prepare('INSERT INTO records (id,business,kind,payload,created) VALUES (?,?,?,?,?)').bind(id,'manar','task',JSON.stringify(payload),Date.now()).run();return {ok:true,id};}});
 await env.DB.batch([{role:'user',title:x.message},{role:'assistant',title:result.reply,actions:result.actions}].map(payload=>env.DB.prepare('INSERT INTO records (id,business,kind,payload,created) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),'manar','message',JSON.stringify(payload),Date.now())));
 if(known)await settleBudget(env.DB,reservation,charged);
 return Response.json(result);
 }catch(e:any){const code=e.message;if(reservation&&!started)await settleBudget(env.DB,reservation,0);return Response.json({error:code==='BUDGET_BLOCKED'||code==='AI_PAUSED'?'الردود متوقفة أو الميزانية المتاحة لا تكفي للطلب':code==='CONTEXT_LIMIT'?'الرسالة أو السياق طويل. اختصر الطلب':code==='API_KEY_INVALID'?'مفتاح الاتصال غير صالح':code==='API_LIMIT'?'تعذر الرد بسبب حد الاستخدام أو الرصيد':'تعذر إكمال الرد. راجع المهام قبل إعادة إرسال طلب إنشاء مهمة.'},{status:502});}}
