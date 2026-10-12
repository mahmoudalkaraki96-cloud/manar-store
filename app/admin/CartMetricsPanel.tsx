"use client";
import {useEffect,useState} from "react";
type Item={productId:number;variantId:number|null;itemNumber:number|null;productName:string;variantName:string;quantity:number;carts:number;lastSeen:number};
type Metrics={cartQuantity:number;nonemptyCarts:number;windowDays:number;asOf:number;missingDetailsCarts:number;items:Item[]};
const number=(value:number)=>value.toLocaleString("ar-PS-u-nu-latn");
const date=(value:number)=>new Date(value).toLocaleString("ar-PS-u-nu-latn",{timeZone:"Asia/Hebron"});
export default function CartMetricsPanel(){
 const [metrics,setMetrics]=useState<Metrics|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
 useEffect(()=>{
  let active=true,inFlight=false;
  const refresh=async()=>{if(inFlight)return;inFlight=true;setBusy(true);try{
   const response=await fetch("/api/admin/cart-metrics",{cache:"no-store"});
   if(!response.ok)throw new Error("تعذر تحميل تفاصيل السلال");
   const next=await response.json() as Metrics;
   if(!Array.isArray(next.items))throw new Error("تفاصيل السلال غير جاهزة؛ أعد التحديث بعد قليل");
   if(active){setMetrics(next);setError("")}
  }catch(e){if(active)setError(e instanceof Error?e.message:"تعذر التحميل")}finally{inFlight=false;if(active)setBusy(false)}};
  void refresh();const timer=window.setInterval(()=>void refresh(),60000);
  const focus=()=>void refresh();window.addEventListener("focus",focus);
  return()=>{active=false;window.clearInterval(timer);window.removeEventListener("focus",focus)};
 },[revision]);
 return <section aria-label="المنتجات في سلال الزبائن" style={{marginBottom:32}}>
  <div className="panelHead"><h3>المنتجات في سلال الزبائن</h3><button type="button" disabled={busy} onClick={()=>setRevision(value=>value+1)}>{busy?"جاري التحديث…":"تحديث السلال"}</button></div>
  {error&&<p className="adminMessage" role="alert">{error}</p>}
  <div className="dashboardStats">
   <article><small>عدد القطع في السلال</small><b>{metrics?number(metrics.cartQuantity):"—"}</b></article>
   <article><small>السلال غير الفارغة</small><b>{metrics?number(metrics.nonemptyCarts):"—"}</b></article>
  </div>
  <p>سلال الأجهزة والمتصفحات التي زارت المتجر خلال آخر 30 يومًا. تُزال المنتجات عند إفراغ السلة أو إتمام الطلب؛ وجودها في السلة لا يعني تسجيل طلب.</p>
  {metrics&&metrics.missingDetailsCarts>0&&<p className="adminMessage">هناك {number(metrics.missingDetailsCarts)} سلة قديمة ضمن المجموع لم تُحفظ أسماء منتجاتها. تظهر تفاصيلها عند عودة أصحابها إلى المتجر.</p>}
  {metrics&&metrics.items.length>0?<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",textAlign:"right"}}><thead><tr>{["رقم الصنف","المنتج","المتغير","عدد القطع","عدد السلال","آخر نشاط"].map(title=><th key={title} style={{padding:12,borderBottom:"1px solid #8884",whiteSpace:"nowrap"}}>{title}</th>)}</tr></thead><tbody>{metrics.items.map(item=><tr key={item.productId+":"+item.variantId}><td style={{padding:12}}>{item.itemNumber==null?"—":number(item.itemNumber)}</td><td style={{padding:12}}>{item.productName}</td><td style={{padding:12}}>{item.variantName}</td><td style={{padding:12}}>{number(item.quantity)}</td><td style={{padding:12}}>{number(item.carts)}</td><td style={{padding:12,whiteSpace:"nowrap"}}>{date(item.lastSeen)}</td></tr>)}</tbody></table></div>:metrics&&<p>{metrics.nonemptyCarts>0?"بانتظار وصول تفاصيل المنتجات من سلال الزبائن.":"لا توجد سلال غير فارغة خلال هذه الفترة."}</p>}
  <small>{metrics?"آخر تحديث: "+date(metrics.asOf):error?"لم يتم تحميل البيانات.":"جاري تحميل السلال…"}</small>
 </section>;
}

