"use client";
import {useEffect,useState} from "react";
import type {DiscountRule} from "../../shared/discounts";

type Rule=DiscountRule & {label:string;saved:number;sales:number};
const empty:Rule={id:0,label:"",code:null,kind:"percent",amount:1000,productIds:[],categoryIds:[],minimumAgorot:0,startsAt:null,endsAt:null,enabled:true,stack:false,limit:null,used:0,saved:0,sales:0};
const localDate=(value:number|null)=>value===null?"":new Date(value-new Date(value).getTimezoneOffset()*60000).toISOString().slice(0,16);
const money=(amount:number)=>new Intl.NumberFormat("en",{maximumFractionDigits:2}).format(amount/100)+" ₪";

export default function DiscountsPanel({catalog}:{catalog:{products:{id:number;name:string}[];categories:{id:number;name:string}[]}}){
  const [rules,setRules]=useState<Rule[]>([]),[draft,setDraft]=useState<Rule|null>(null),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
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
  return <section className="dataPanel" dir="rtl">
    <h2>الخصومات وأكواد الخصم</h2>
    <button type="button" disabled={busy} onClick={()=>setDraft({...empty})}>إضافة خصم تلقائي</button>{" "}
    <button type="button" disabled={busy} onClick={()=>setDraft({...empty,code:""})}>إضافة كود خصم</button>
    {message&&<p role="status">{message}</p>}
    {draft&&<form className="checkoutFields" onSubmit={event=>{event.preventDefault();void save(draft)}}>
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
    {rules.map(rule=><article key={rule.id}><h3>{rule.label} {rule.code&&<bdi>{rule.code}</bdi>}</h3>
      {rule.code&&<p>{rule.used} طلب · قيمة الطلبات {money(rule.sales)} · مجموع الخصم {money(rule.saved)}</p>}
      <button type="button" disabled={busy} onClick={()=>setDraft(rule)}>تعديل</button>{" "}
      <button type="button" disabled={busy} onClick={()=>void save({...rule,enabled:!rule.enabled})}>{rule.enabled?"إيقاف":"تفعيل"}</button>
    </article>)}
  </section>;
}
