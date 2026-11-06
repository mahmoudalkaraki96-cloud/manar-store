"use client";
import {useStoreCopy} from "../use-store-copy";
import Link from "next/link";
import type {StoreSettings} from "../storefront-types";

export default function StoreFooter({settings:s}:{settings:StoreSettings}){
 const copy=useStoreCopy();
 const socials=[s.instagramEnabled&&s.instagramUrl&&{label:"إنستغرام",href:s.instagramUrl},s.facebookEnabled&&s.facebookUrl&&{label:"فيسبوك",href:s.facebookUrl},s.tiktokEnabled&&s.tiktokUrl&&{label:"تيك توك",href:s.tiktokUrl}].filter((item):item is {label:string;href:string}=>Boolean(item));
 const whatsapp=s.whatsappEnabled?s.whatsapp.replace(/\D/g,""):"";
 const contact=Boolean(whatsapp||socials.length);
 return <footer className={`storeFooter ${contact?"withContact":""}`} aria-label="معلومات المتجر وخدمة العملاء">
  <section className="storeFooterIdentity"><Link href="/" aria-label={copy("الصفحة الرئيسية")}>{s.logoUrl&&<img src={s.logoUrl} alt={s.storeName} loading="lazy" decoding="async"/>}<strong>{s.siteNameAr||s.storeName}</strong>{s.siteNameEn&&<span lang="en" dir="ltr">{s.siteNameEn}</span>}</Link></section>
  <section className="storeFooterService" aria-labelledby="storeFooterServiceTitle"><h2 id="storeFooterServiceTitle">{copy("خدمة العملاء")}</h2><nav aria-label={copy("روابط خدمة العملاء")}><Link href="/track-order">{copy("متابعة الطلب")}</Link><Link href="/policies/terms">{copy("سياسات المتجر")}</Link><Link href="/policies/terms#shipping">{copy("التوصيل")}</Link><Link href="/policies/terms#exchange">{copy("الاستبدال وفحص المنتج")}</Link><Link href="/privacy">{copy("الخصوصية وملفات الارتباط")}</Link></nav></section>
  {contact&&<section className="storeFooterContact" aria-labelledby="storeFooterContactTitle"><h2 id="storeFooterContactTitle">{copy("تواصل معنا")}</h2>{whatsapp&&<a className="storeFooterWhatsapp" href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer">تواصل عبر واتساب <span aria-hidden="true">↗</span></a>}{socials.length>0&&<div className="storeFooterSocials">{socials.map(item=><a key={item.label} href={item.href} target="_blank" rel="noopener noreferrer">{item.label}<span aria-hidden="true">↗</span></a>)}</div>}</section>}
  <div className="storeFooterBottom"><span>{s.siteNameAr||s.storeName}</span><Link href="/privacy">{copy("الخصوصية")}</Link></div>
 </footer>;
}
