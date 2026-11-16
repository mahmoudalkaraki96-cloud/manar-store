"use client";
import {useStoreLanguage} from "../store-language";
import Link from "next/link";
import type {StoreSettings} from "../storefront-types";

export default function StoreFooter({settings:s}:{settings:StoreSettings}){
 const {t}=useStoreLanguage();
 const socials=[s.instagramEnabled&&s.instagramUrl&&{label:t("social.instagram"),href:s.instagramUrl},s.facebookEnabled&&s.facebookUrl&&{label:t("social.facebook"),href:s.facebookUrl},s.tiktokEnabled&&s.tiktokUrl&&{label:t("social.tiktok"),href:s.tiktokUrl}].filter((item):item is {label:string;href:string}=>Boolean(item));
 const whatsapp=s.whatsappEnabled?s.whatsapp.replace(/\D/g,""):"";
 const contact=Boolean(whatsapp||socials.length);
 return <footer className={`storeFooter ${contact?"withContact":""}`} aria-label={t("footer.store_info")}>
  <section className="storeFooterIdentity"><Link href="/" aria-label={t("nav.home_page")}>{s.logoUrl&&<img src={s.logoUrl} alt={s.storeName} loading="lazy" decoding="async"/>}<strong>{s.siteNameAr||s.storeName}</strong>{s.siteNameEn&&<span lang="en" dir="ltr">{s.siteNameEn}</span>}</Link></section>
  <section className="storeFooterService" aria-labelledby="storeFooterServiceTitle"><h2 id="storeFooterServiceTitle">{t("customer_service")}</h2><nav aria-label={t("footer.service_links")}><Link href="/track-order">{t("track_order_2")}</Link><Link href="/policies/terms">{t("store_policies")}</Link><Link href="/policies/terms#shipping">{t("delivery_2")}</Link><Link href="/policies/terms#exchange">{t("exchanges_and_inspection_2")}</Link><Link href="/privacy">{t("privacy_and_cookies")}</Link></nav></section>
  {contact&&<section className="storeFooterContact" aria-labelledby="storeFooterContactTitle"><h2 id="storeFooterContactTitle">{t("contact_us")}</h2>{whatsapp&&<a className="storeFooterWhatsapp" href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer">{t("footer.whatsapp")} <span aria-hidden="true">↗</span></a>}{socials.length>0&&<div className="storeFooterSocials">{socials.map(item=><a key={item.label} href={item.href} target="_blank" rel="noopener noreferrer">{item.label}<span aria-hidden="true">↗</span></a>)}</div>}</section>}
  <div className="storeFooterBottom"><span>{s.siteNameAr||s.storeName}</span><Link href="/privacy">{t("privacy")}</Link></div>
 </footer>;
}
