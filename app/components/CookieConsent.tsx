"use client";
import {useEffect,useState} from "react";
import Link from "next/link";

const CONSENT_KEY="manar_cookie_consent";
const MEASUREMENT_ID="G-PB5GHRZS5S";

function startAnalytics(){
  if(typeof window==="undefined"||window.location.hostname.startsWith("admin."))return;
  window.dataLayer=window.dataLayer||[];
  window.gtag=window.gtag||function(...args:unknown[]){window.dataLayer?.push(args)};
  window.gtag("js",new Date());
  window.gtag("config",MEASUREMENT_ID);
  if(!document.querySelector(`script[data-manar-ga="${MEASUREMENT_ID}"]`)){
    const script=document.createElement("script");
    script.async=true;
    script.src=`https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
    script.dataset.manarGa=MEASUREMENT_ID;
    document.head.appendChild(script);
  }
}

declare global {
  interface Window {
    dataLayer?:unknown[];
  }
}

export default function CookieConsent(){
  const [visible,setVisible]=useState(false);
  useEffect(()=>{
    if(window.location.hostname.startsWith("admin.")||window.location.pathname.startsWith("/admin"))return;
    const choice=localStorage.getItem(CONSENT_KEY);
    if(choice==="accepted")startAnalytics();
    else if(choice!=="rejected")setVisible(true);
  },[]);
  if(!visible)return null;
  const choose=(accepted:boolean)=>{localStorage.setItem(CONSENT_KEY,accepted?"accepted":"rejected");setVisible(false);if(accepted)startAnalytics()};
  return <aside className="cookieConsent" role="dialog" aria-label="إعدادات الخصوصية"><div><b>الخصوصية وبيانات الاستخدام</b><p>نستخدم ملفات تعريف الارتباط وGoogle Analytics لقياس الزيارات وتحسين المتجر. يمكنك الرفض وسيبقى التسوق والطلب يعملان بشكل طبيعي. <Link href="/privacy">سياسة الخصوصية</Link></p></div><div className="cookieActions"><button type="button" className="cookieReject" onClick={()=>choose(false)}>رفض التحليلات</button><button type="button" className="cookieAccept" onClick={()=>choose(true)}>موافقة</button></div></aside>;
}
