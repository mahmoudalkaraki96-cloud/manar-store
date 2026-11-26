"use client";
import {useEffect,useState} from "react";
import type {DiscountRule} from "../../shared/discounts";

type Rule=DiscountRule & {label:string;saved:number;sales:number};
const empty:Rule={id:0,label:"",code:null,kind:"percent",amount:1000,productIds:[],categoryIds:[],minimumAgorot:0,startsAt:null,endsAt:null,enabled:true,stack:false,limit:null,used:0,saved:0,sales:0};
const localDate=(value:number|null)=>value===null?"":new Date(value-new Date(value).getTimezoneOffset()*60000).toISOString().slice(0,16);
const money=(amount:number)=>new Intl.NumberFormat("en",{maximumFractionDigits:2}).format(amount/100)+" ₪";
// 1.10.0: each code is its own card — status, usage, sales, and when it ends.
type Status="active"|"scheduled"|"ended"|"paused";
const statusLabels:Record<Status,string>={active:"فعّال",scheduled:"مجدول",ended:"منتهي",paused:"متوقف"};
export function discountStatus(rule:{enabled:boolean;startsAt:number|null;endsAt:number|null;limit:number|null;used:number},now=Date.now()):Status{if(!rule.enabled)return "paused";if(rule.endsAt!==null&&rule.endsAt<=now||rule.limit!==null&&rule.used>=rule.limit)return "ended";if(rule.startsAt!==null&&rule.startsAt>now)return "scheduled";return "active"}
const DAY=864e5;
const whenText=(rule:Rule,status:Status,now:number)=>{if(status==="scheduled"&&rule.startsAt)return "بيبلّش "+new Date(rule.startsAt).toLocaleString("ar-PS-u-nu-latn",{timeZone:"Asia/Hebron",weekday:"long",hour:"2-digit",minute:"2-digit"});if(status==="ended"&&rule.endsAt&&rule.endsAt<=now){const days=Math.floor((now-rule.endsAt)/DAY);return days<1?"خلص اليوم":days<30?"خلص من "+days+" يوم":"خلص من "+Math.floor(days/30)+" شهر"}if(rule.endsAt){const days=Math.ceil((rule.endsAt-now)/DAY);return days<=1?"بيخلص اليوم":"بيخلص بعد "+days+" أيام"}return "بدون تاريخ انتهاء"};

export default function DiscountsPanel({catalog}:{catalog:{products:{id:number;name:string}[];categories:{id:number;name:string}[]}}){
  const [now]=useState(()=>Date.now()),[statusFilter,setStatusFilter]=useState<"all"|Status>("all"),[rules,setRules]=useState<Rule[]>([]),[draft,setDraft]=useState<Rule|null>(null),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
  const load=async()=>{
    const response=await fetch("/api/admin/discounts",{cache:"no-store"});
    if(!response.ok)throw new Error("تعذر تحميل الخصومات");
    setRules((await response.json()).rules);
  };
  useEffect(()=>{void load().catch(error=>setMessage(error.message))},[]);
  const save=async(rule:Rule)=>{
    setBusy(true);setMessage("");
    try{
      const response=await fetch("/api/admin/discounts",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(rule)});
      if(!response.ok)throw new Error((await response.json()).error);
      await load();setDraft(null);setMessage("تم حفظ الخصم");
    }catch(error){setMessage(error instanceof Error?error.message:"تعذر الحفظ")}
    finally{setBusy(false)}
  };
  const [filter,setFilter]=[statusFilter,setStatusFilter];
  const withStatus=rules.map(rule=>({rule,status:discountStatus(rule,now)})),counts=withStatus.reduce<Record<string,number>>((c,x)=>{c[x.status]=(c[x.status]||0)+1;return c},{all:rules.length});
  const copyCode=async(code:string)=>{try{await navigator.clipboard.writeText(code);setMessage("انسخ الكود "+code)}catch{setMessage("الكود: "+code)}};
  return <section className="dataPanel discountsPage" dir="rtl">
    <div className="panelHead discountsHead"><div><h2>الخصومات وأكواد الخصم</h2><p>كل كود بطاقة لحاله: قديش انستعمل، وقديش جاب مبيعات.</p></div><div className="discountsHeadActions"><button type="button" className="secondaryAction" disabled={busy} onClick={()=>setDraft({...empty})}>خصم تلقائي جديد</button><button type="button" className="saveOrderChanges" disabled={busy} onClick={()=>setDraft({...empty,code:""})}>＋ كود خصم جديد</button></div></div>
    <div className="discountFilters" role="group" aria-label="حالة الخصومات">{(["all","active","scheduled","ended","paused"] as const).map(key=><button key={key} type="button" aria-pressed={filter===key} onClick={()=>setFilter(key)}>{key==="all"?"الكل":statusLabels[key]} {counts[key]||0}</button>)}</div>
    {message&&<p role="status">{message}</p>}
    {draft&&<form className="checkoutFields discountForm" onSubmit={event=>{event.preventDefault();void save(draft)}}>
      <label>اسم العرض<input required value={draft.label} onChange={e=>setDraft({...draft,label:e.target.value})}/></label>
      {draft.code!==null&&<label>الكود<input dir="ltr" required disabled={Boolean(draft.id)} pattern="[A-Za-z0-9_\\-]{2,32}" value={draft.code} onChange={e=>setDraft({...draft,code:e.target.value.toUpperCase()})}/></label>}
      <label>طريقة الخصم<select value={draft.kind} onChange={e=>setDraft({...draft,kind:e.target.value==="fixed"?"fixed":"percent"})}><option value="percent">نسبة مئوية</option><option value="fixed">{draft.code===null?"مبلغ ثابت لكل قطعة":"مبلغ ثابت للسلة"}</option></select></label>
      <label>قيمة الخصم<input type="number" min=".01" step=".01" max={draft.kind==="percent"?100:1000000} required value={draft.amount/100} onChange={e=>setDraft({...draft,amount:Math.round(Number(e.target.value)*100)})}/></label>
      <label>الحد الأدنى للسلة (₪)<input type="number" min="0" step=".01" value={draft.minimumAgorot/100} onChange={e=>setDraft({...draft,minimumAgorot:Math.round(Number(e.target.value)*100)})}/></label>
      <label>الأقسام (اختياري)<select multiple value={draft.categoryIds.map(String)} onChange={e=>setDraft({...draft,categoryIds:Array.from(e.target.selectedOptions,option=>Number(option.value))})}>{catalog.categories.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>الأصناف (اختياري)<select multiple value={draft.productIds.map(String)} onChange={e=>setDraft({...draft,productIds:Array.from(e.target.selectedOptions,option=>Number(option.value))})}>{catalog.products.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>بداية العرض<input type="datetime-local" value={localDate(draft.startsAt)} onChange={e=>setDraft({...draft,startsAt:e.target.value?new Date(e.target.value).getTime():null})}/></label>
      <label>نهاية العرض<input type="datetime-local" value={localDate(draft.endsAt)} onChange={e=>setDraft({...draft,endsAt:e.target.value?new Date(e.target.value).getTime():null})}/></label>
      {draft.code!==null&&<><label>حد الاستخدام الإجمالي<input type="number" min="1" placeholder="بلا حد" value={draft.limit??""} onChange={e=>setDraft({...draft,limit:e.target.value?Number(e.target.value):null})}/></label><label><input type="checkbox" checked={draft.stack} onChange={e=>setDraft({...draft,stack:e.target.checked})}/> السماح بالجمع مع خصم تلقائي</label></>}
      <button disabled={busy}>حفظ الخصم</button><button type="button" disabled={busy} onClick={()=>setDraft(null)}>إلغاء</button>
    </form>}
    {!withStatus.filter(x=>filter==="all"||x.status===filter).length&&<div className="emptyCategory"><b>ما في خصومات هون</b><span>أضف كود خصم جديد أو خصم تلقائي.</span></div>}
    <div className="discountGrid">{withStatus.filter(x=>filter==="all"||x.status===filter).map(({rule,status})=><article key={rule.id} className={"discountCard "+status}>
      <div className="discountCardHead">{rule.code?<span className="discountCode" dir="ltr">{rule.code}</span>:<span className="discountAuto">خصم تلقائي</span>}<span className={"discountStatus "+status}>{statusLabels[status]}</span></div>
      <b className="discountValue">{rule.kind==="percent"?"خصم "+(rule.amount/100)+"%":money(rule.amount)} <small>{rule.categoryIds.length||rule.productIds.length?[rule.categoryIds.length?rule.categoryIds.length+" قسم":"",rule.productIds.length?rule.productIds.length+" صنف":""].filter(Boolean).join(" · "):"على كل المتجر"}</small></b>
      <small className="discountLabel">{rule.label}</small>
      <div className="discountUsage"><div><span>{rule.limit!==null?"انستعمل "+rule.used+" من "+rule.limit:"انستعمل "+rule.used+" مرة"}</span><b>{rule.used?"جاب "+money(rule.sales):"—"}</b></div>{rule.limit!==null&&<div className="discountBar" aria-hidden><span style={{width:Math.min(100,rule.used/Math.max(1,rule.limit)*100)+"%"}}/></div>}</div>
      <small className="discountWhen">{whenText(rule,status,now)}{rule.minimumAgorot?" · الحد الأدنى للطلب "+money(rule.minimumAgorot):""}{rule.saved?" · مجموع الخصم "+money(rule.saved):""}</small>
      <div className="discountActions">{rule.code&&<button type="button" className="secondaryAction" onClick={()=>void copyCode(rule.code!)}>نسخ الكود</button>}<button type="button" className="secondaryAction" disabled={busy} onClick={()=>setDraft(rule)}>تعديل</button>{status==="ended"?<button type="button" className="secondaryAction" disabled={busy} onClick={()=>setDraft({...rule,enabled:true,startsAt:null,endsAt:null})}>تفعيل مرة تانية</button>:<button type="button" className="secondaryAction" disabled={busy} onClick={()=>void save({...rule,enabled:!rule.enabled})}>{rule.enabled?"إيقاف":"تفعيل"}</button>}</div>
    </article>)}</div>
  </section>;
}
