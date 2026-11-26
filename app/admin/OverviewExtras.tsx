"use client";
import {useEffect,useRef,useState} from "react";
import {useAdminAccess} from "./AdminAccess";

// 1.10.0: extra overview cards from the HomeExtras sample, plus the notifications bell.
export type OverviewExtrasData={days:number;traffic:{visitors:number;sources:{key:string;label:string;visitors:number;share:number}[]};cities:{city:string;orders:number}[];reviews:{pending:number;items:{id:number;rating:number;body:string;product:string;createdAt:number}[]};failedSearches:{term:string;searches:number}[];month:{sales:number;goal:number;daysLeft:number;daysInMonth:number;perDayNeeded:number}};
const n=(v:number)=>v.toLocaleString("ar-PS-u-nu-latn",{maximumFractionDigits:0});
const sourceColors:Record<string,string>={instagram:"#b3125b",facebook:"#4a68c4",google:"#d69b35",tiktok:"#243338",whatsapp:"#1a9c5a",direct:"#5f6f78",other:"#8a99a1"};
const icon=(d:string[])=><svg viewBox="0 0 24 24" aria-hidden="true">{d.map(x=><path key={x} d={x}/>)}</svg>;

export function QuickShortcuts({onNavigate,onNewProduct,storeHref}:{onNavigate:(tab:string,filter?:string)=>void;onNewProduct?:()=>void;storeHref?:string}){
 const {can}=useAdminAccess();const [copied,setCopied]=useState(false);
 const copy=async()=>{if(!storeHref)return;try{await navigator.clipboard.writeText(storeHref);setCopied(true);setTimeout(()=>setCopied(false),2000)}catch{window.prompt("رابط المتجر",storeHref)}};
 return <section className="quickShortcuts" aria-label="اختصارات سريعة">
  {onNewProduct&&can("products.write")&&<button type="button" onClick={onNewProduct}><span>{icon(["M12 5v14M5 12h14"])}</span>منتج جديد</button>}
  <button type="button" onClick={()=>onNavigate("الخصومات وأكواد الخصم")}><span>{icon(["M19 5 5 19","M9.5 7a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM19.5 17a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z"])}</span>كود خصم جديد</button>
  <button type="button" onClick={()=>onNavigate("الطلبات","dayprep")}><span>{icon(["M6 9V3h12v6","M3 9h18v8H3z","M7 14h10v7H7z"])}</span>ورقة تجهيز اليوم</button>
  {storeHref&&<button type="button" onClick={()=>void copy()}><span>{icon(["M21 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM9 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 19a3 3 0 1 1-6 0 3 3 0 0 1 6 0z","m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"])}</span>{copied?"انسخ الرابط ✓":"نسخ رابط المتجر"}</button>}
 </section>;
}

export function NotificationsBell({newOrders,soldout,low,reviews,failedSearches,onNavigate}:{newOrders:number;soldout:number;low:number;reviews:number;failedSearches:number;onNavigate:(tab:string,filter?:string)=>void}){
 const [open,setOpen]=useState(false),ref=useRef<HTMLDivElement|null>(null);
 useEffect(()=>{if(!open)return;const close=(e:Event)=>{if(e instanceof KeyboardEvent){if(e.key==="Escape")setOpen(false);return}if(!ref.current?.contains(e.target as Node))setOpen(false)};document.addEventListener("mousedown",close);document.addEventListener("keydown",close);return()=>{document.removeEventListener("mousedown",close);document.removeEventListener("keydown",close)}},[open]);
 const items=[
  newOrders&&{key:"orders",text:`${n(newOrders)} طلب جديد بستنى تأكيد`,go:()=>onNavigate("الطلبات","new")},
  reviews&&{key:"reviews",text:`${n(reviews)} مراجعة بتستنى موافقتك`,go:()=>onNavigate("مراجعات المنتجات")},
  soldout&&{key:"soldout",text:`${n(soldout)} منتج خلص من المخزون`,go:()=>onNavigate("المنتجات","soldout")},
  low&&{key:"low",text:`${n(low)} منتج قرّب يخلص`,go:()=>onNavigate("المنتجات","low")},
  failedSearches&&{key:"search",text:`${n(failedSearches)} كلمة بحثوا عنها وما لقوها`,go:()=>{setOpen(false);document.getElementById("failed-searches")?.scrollIntoView({behavior:"smooth",block:"center"})}}
 ].filter(Boolean) as {key:string;text:string;go:()=>void}[];
 const count=newOrders+reviews;
 return <div className="notificationsBell" ref={ref}><button type="button" className="bellButton" aria-label={"الإشعارات"+(count?" · "+count+" جديد":"")} aria-expanded={open} onClick={()=>setOpen(v=>!v)}>{icon(["M6 16V11a6 6 0 0 1 12 0v5l2 2H4z","M10 20a2 2 0 0 0 4 0"])}{count>0&&<i>{count>99?"99+":count}</i>}</button>
  {open&&<div className="bellMenu" role="menu"><b>الإشعارات</b>{items.length?items.map(item=><button type="button" role="menuitem" key={item.key} onClick={()=>{setOpen(false);item.go()}}>{item.text}<span aria-hidden>←</span></button>):<p>ما في إشي جديد هلّأ.</p>}</div>}
 </div>;
}

export default function OverviewExtras({data,onNavigate,onReviewed}:{data:OverviewExtrasData|null;onNavigate:(tab:string,filter?:string)=>void;onReviewed:()=>void}){
 const {can}=useAdminAccess();const [approving,setApproving]=useState<number|null>(null),[message,setMessage]=useState("");
 if(!data)return null;
 const approve=async(id:number)=>{setApproving(id);setMessage("");try{const r=await fetch("/api/admin/reviews/"+id,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({status:"approved"})});const body=await r.json().catch(()=>({})) as {error?:string};if(!r.ok)throw new Error(body.error||"تعذرت الموافقة");setMessage("انوافق على المراجعة");onReviewed()}catch(e){setMessage(e instanceof Error?e.message:"تعذرت الموافقة")}finally{setApproving(null)}};
 const goal=data.month.goal,progress=goal?Math.min(100,Math.round(data.month.sales/goal*100)):0,maxCity=Math.max(1,...data.cities.map(c=>c.orders));
 return <div className="overviewExtras">
  {message&&<p className="adminMessage" role="status">{message}</p>}
  <div className="overviewRow">
   {goal>0&&<section className="dashboardPanel extraCard"><h2>هدف الشهر</h2><div className="goalNumbers"><b>{n(data.month.sales)} ₪</b><small>من {n(goal)} ₪</small></div><div className="extraBarRow"><div className="extraBar"><span style={{width:progress+"%"}}/></div><b>{progress}%</b></div><small className="extraHint">{data.month.sales>=goal?"وصلت الهدف! 🎉":`باقي ${data.month.daysLeft} يوم. لازمك تقريباً ${n(data.month.perDayNeeded)} ₪ باليوم لتوصل.`}</small></section>}
   <section className="dashboardPanel extraCard"><h2>من وين إجو الزوار</h2><small className="extraHint">آخر {data.days} يوم · {n(data.traffic.visitors)} زائر</small>{data.traffic.sources.length?data.traffic.sources.slice(0,5).map(s=><div className="extraBarRow" key={s.key}><span className="extraBarLabel">{s.label}</span><div className="extraBar"><span style={{width:Math.max(3,s.share)+"%",background:sourceColors[s.key]||"#5f6f78"}}/></div><b>{s.share}%</b></div>):<p className="extraHint">لسّا ما في زيارات مسجّلة.</p>}</section>
  </div>
  <div className="overviewRow">
   <section className="dashboardPanel extraCard" id="failed-searches"><h2>بحثوا عنها وما لقوها</h2><small className="extraHint">كلمات كتبها الزبائن بالبحث وما طلعلهم ولا منتج، آخر {data.days} يوم. ممكن تكون فرصة لمنتج جديد.</small>{data.failedSearches.length?<div className="searchChips">{data.failedSearches.map(s=><span key={s.term}>{s.term} <b>· {n(s.searches)}</b></span>)}</div>:<p className="extraHint">كل اللي بحثوا عنه لقوه. 👌</p>}</section>
   <section className="dashboardPanel extraCard"><h2>الطلبات حسب المدينة</h2><small className="extraHint">آخر {data.days} يوم</small>{data.cities.length?data.cities.map(c=><div className="extraBarRow" key={c.city}><span className="extraBarLabel">{c.city}</span><div className="extraBar"><span style={{width:Math.max(3,c.orders/maxCity*100)+"%"}}/></div><b>{n(c.orders)}</b></div>):<p className="extraHint">لسّا ما في طلبات بهالفترة.</p>}</section>
  </div>
  {data.reviews.pending>0&&<section className="dashboardPanel extraCard"><div className="dashPanelHead"><h2>مراجعات بتستنى موافقتك ({n(data.reviews.pending)})</h2><button className="textAction" onClick={()=>onNavigate("مراجعات المنتجات")}>كل المراجعات ←</button></div>{data.reviews.items.map(r=><div className="pendingReview" key={r.id}><div><span className="reviewStars" role="img" aria-label={r.rating+" من 5"}>{"★".repeat(r.rating)+"☆".repeat(5-r.rating)}</span><p>«{r.body}»</p><small>على {r.product}</small></div>{can("content.write")&&<button type="button" className="saveOrderChanges" disabled={approving!==null} onClick={()=>void approve(r.id)}>{approving===r.id?"جاري…":"موافقة"}</button>}</div>)}</section>}
 </div>;
}
