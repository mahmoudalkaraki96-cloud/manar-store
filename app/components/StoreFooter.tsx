"use client";
import {useStoreLanguage} from "../store-language";
import Link from "next/link";
import type {StoreSettings} from "../storefront-types";

export default function StoreFooter({settings:s}:{settings:StoreSettings}){
 const {t}=useStoreLanguage();
 const socials=[s.instagramEnabled&&s.instagramUrl&&{label:"إنستغرام",href:s.instagramUrl},s.facebookEnabled&&s.facebookUrl&&{label:"فيسبوك",href:s.facebookUrl},s.tiktokEnabled&&s.tiktokUrl&&{label:"تيك توك",href:s.tiktokUrl}].filter((item):item is {label:string;href:string}=>Boolean(item));
 const whatsapp=s.whatsappEnabled?s.whatsapp.replace(/\D/g,""):"";
 const contact=Boolean(whatsapp||socials.length);
 return <footer className={`storeFooter ${contact?"withContact":""}`} aria-label="معلومات المتجر وخدمة العملاء">
  <section className="storeFooterIdentity"><Link href="/" aria-label="الصفحة الرئيسية">{s.logoUrl&&<img src={s.logoUrl} alt={s.storeName} loading="lazy" decoding="async"/>}<strong>{s.siteNameAr||s.storeName}</strong>{s.siteNameEn&&<span lang="en" dir="ltr">{s.siteNameEn}</span>}</Link></section>
  <section className="storeFooterService" aria-labelledby="storeFooterServiceTitle"><h2 id="storeFooterServiceTitle">{t("خدمة العملاء","Customer service","שירות לקוחות")}</h2><nav aria-label="روابط خدمة العملاء"><Link href="/track-order">{t("متابعة الطلب","Track order","מעקב הזמנה")}</Link><Link href="/policies/terms">{t("سياسات المتجر","Store policies","מדיניות החנות")}</Link><Link href="/policies/terms#shipping">{t("التوصيل","Delivery","משלוחים")}</Link><Link href="/policies/terms#exchange">{t("الاستبدال وفحص المنتج","Exchanges and inspection","החלפות ובדיקת מוצר")}</Link><Link href="/privacy">{t("الخصوصية وملفات الارتباط","Privacy and cookies","פרטיות ועוגיות")}</Link></nav></section>
  {contact&&<section className="storeFooterContact" aria-labelledby="storeFooterContactTitle"><h2 id="storeFooterContactTitle">{t("تواصل معنا","Contact us","צור קשר")}</h2>{whatsapp&&<a className="storeFooterWhatsapp" href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer">تواصل عبر واتساب <span aria-hidden="true">↗</span></a>}{socials.length>0&&<div className="storeFooterSocials">{socials.map(item=><a key={item.label} href={item.href} target="_blank" rel="noopener noreferrer">{item.label}<span aria-hidden="true">↗</span></a>)}</div>}</section>}
  <div className="storeFooterBottom"><span>{s.siteNameAr||s.storeName}</span><Link href="/privacy">{t("الخصوصية","Privacy","פרטיות")}</Link></div>
 </footer>;
}
