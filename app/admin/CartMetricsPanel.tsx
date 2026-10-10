"use client";
import {useEffect,useState} from "react";
type Metrics={cartQuantity:number;nonemptyCarts:number;windowDays:number;asOf:number};
export default function CartMetricsPanel(){
 const [metrics,setMetrics]=useState<Metrics|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 useEffect(()=>{
  let active=true;
  const refresh=async()=>{setBusy(true);try{
   const response=await fetch("/api/admin/cart-metrics",{cache:"no-store"});
   if(!response.ok)throw new Error("تعذر تحميل إحصائية السلال");
   const next=await response.json() as Metrics;
   if(active){setMetrics(next);setError("")}
  }catch(e){if(active)setError(e instanceof Error?e.message:"تعذر التحميل")}finally{if(active)setBusy(false)}};
  void refresh();const timer=window.setInterval(()=>void refresh(),60000);
  const focus=()=>void refresh();window.addEventListener("focus",focus);
  return()=>{active=false;window.clearInterval(timer);window.removeEventListener("focus",focus)};
 },[]);
 return <section className="dataPanel" aria-label="إحصائية سلال الزبائن">
  <h3>المنتجات في سلال الزبائن</h3>
  {error&&<p className="adminMessage" role="alert">{error}</p>}
  <div className="dashboardStats">
   <article><small>عدد القطع في السلال</small><b>{metrics?metrics.cartQuantity.toLocaleString("ar-PS"):"—"}</b><span>يشمل الكميات المتكررة من المنتج نفسه</span></article>
   <article><small>السلال غير الفارغة</small><b>{metrics?metrics.nonemptyCarts.toLocaleString("ar-PS"):"—"}</b><span>سلال أجهزة الزبائن التي تواصلت مع المتجر خلال 30 يومًا</span></article>
  </div>
  <p>يبدأ العد من تفعيل الميزة. تظهر السلال القديمة عند زيارة أصحابها للمتجر، وتُزال السلة من العدد عند إفراغها أو إتمام الطلب. كل جهاز أو متصفح يُحسب كسلة مستقلة.</p>
  <small>{metrics?"آخر تحديث: "+new Date(metrics.asOf).toLocaleString("ar-PS",{timeZone:"Asia/Hebron"}):"جاري تحميل الإحصائية…"}{busy&&metrics?" — جاري التحديث…":""}</small>
 </section>;
}
