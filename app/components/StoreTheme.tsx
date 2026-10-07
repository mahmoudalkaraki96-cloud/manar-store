"use client";
import {useEffect} from "react";
import {usePathname} from "next/navigation";
import {loadCatalog} from "../catalog-types";
import {loadStorefront,type StoreSettings} from "../storefront-types";

function upsertMeta(selector:string,attributes:Record<string,string>){
 let element=document.head.querySelector<HTMLMetaElement>(selector);
 if(!element){element=document.createElement("meta");document.head.appendChild(element)}
 for(const [name,value] of Object.entries(attributes))element.setAttribute(name,value);
}
function upsertLink(rel:string,href:string){
 let element=document.head.querySelector<HTMLLinkElement>('link[rel="'+rel+'"]');
 if(!element){element=document.createElement("link");element.rel=rel;document.head.appendChild(element)}
 element.href=href;
}
function upsertCanonical(href:string){
 let element=document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
 if(!element){element=document.createElement("link");element.rel="canonical";document.head.appendChild(element)}
 element.href=href;
}
function setPageSeo(title:string,description:string,url:string,image:string,type="website"){
 document.title=title;
 upsertCanonical(url);
 upsertMeta('meta[name="description"]',{name:"description",content:description});
 upsertMeta('meta[property="og:title"]',{property:"og:title",content:title});
 upsertMeta('meta[property="og:description"]',{property:"og:description",content:description});
 upsertMeta('meta[property="og:type"]',{property:"og:type",content:type});
 upsertMeta('meta[property="og:url"]',{property:"og:url",content:url});
 upsertMeta('meta[property="og:image"]',{property:"og:image",content:image});
 upsertMeta('meta[name="twitter:card"]',{name:"twitter:card",content:"summary_large_image"});
 upsertMeta('meta[name="twitter:title"]',{name:"twitter:title",content:title});
 upsertMeta('meta[name="twitter:description"]',{name:"twitter:description",content:description});
 upsertMeta('meta[name="twitter:image"]',{name:"twitter:image",content:image});
}
function absoluteUrl(value:string){try{return new URL(value||"/og.png",location.origin).toString()}catch{return location.origin+"/og.png"}}
async function applyPageSeo(settings:StoreSettings,pathname:string){
 const name=settings.siteNameAr||settings.storeName||"منار بارتي ستور",alternate=settings.siteNameEn||"";
 let title=alternate?`${name} | ${alternate}`:name,description=settings.seoDescription||"قطع وإكسسوارات التوزيعات بالجملة والتجزئة",image=absoluteUrl(settings.logoUrl),type="website";
 const catalog=await loadCatalog();
 const productMatch=pathname.match(/^\/product\/(\d+)\/?$/);
 if(productMatch){
  const value=Number(productMatch[1]),product=catalog.products.find(item=>item.id===value||item.itemNumber===value);
  if(product){
   title=`${product.name} | ${name}`;
   description=(product.description||"").trim().slice(0,155)||`${product.name} متوفر لدى ${name} بسعر ${product.price.toFixed(2)} شيكل.`;
   image=absoluteUrl(product.image);type="product";
  }
 }else{
  const categoryMatch=pathname.match(/^\/category\/([^/]+)\/?$/);
  if(categoryMatch){
   const slug=decodeURIComponent(categoryMatch[1]),category=catalog.categories.find(item=>item.slug===slug);
   if(category){title=`${category.name} | ${name}`;description=`تصفّح منتجات قسم ${category.name} في ${name}.`;image=absoluteUrl(category.bannerUrl||settings.logoUrl)}
  }
 }
 setPageSeo(title,description,location.href,image,type);
}
function applyStoreIdentity(settings:StoreSettings){
 const root=document.documentElement;
 root.style.setProperty("--green",settings.primaryColor);
 root.style.setProperty("--gold",settings.secondaryColor);
 root.style.setProperty("--pageBg",settings.backgroundColor);
 const name=settings.storeName||[settings.siteNameAr,settings.siteNameEn].filter(Boolean).join(" | ")||"منار بارتي ستور";
 const favicon=absoluteUrl((location.hostname==="manarstore.ps"||location.hostname==="www.manarstore.ps")?"/favicon.png":settings.faviconUrl||settings.logoUrl);upsertLink("icon",favicon);upsertLink("apple-touch-icon",favicon);
 upsertMeta('meta[property="og:site_name"]',{property:"og:site_name",content:settings.siteNameAr||name});
 if(location.pathname.startsWith("/admin"))document.title=`${name} – لوحة التحكم`;
 const adminBrand=document.querySelector<HTMLElement>(".adminSide .brand b");
 if(adminBrand)adminBrand.textContent=name;
}

export default function StoreTheme(){
 const pathname=usePathname();
 useEffect(()=>{if(pathname.startsWith("/admin"))return;try{const key="manar_visitor_id",visitorId=localStorage.getItem(key)||crypto.randomUUID();localStorage.setItem(key,visitorId);void fetch("/api/analytics/visit",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({visitorId}),keepalive:true})}catch{}},[pathname]);
 useEffect(()=>{
  let active=true;
  const apply=(settings:StoreSettings)=>{applyStoreIdentity(settings);if(!pathname.startsWith("/admin"))void applyPageSeo(settings,pathname)};
  const onSettings=(event:Event)=>{const detail=(event as CustomEvent<StoreSettings>).detail;if(detail)apply(detail)};
  window.addEventListener("store-settings-updated",onSettings);
  loadStorefront().then(({settings})=>{if(active)apply(settings)}).catch(()=>{});
  return()=>{active=false;window.removeEventListener("store-settings-updated",onSettings)};
 },[pathname]);
 return null;
}
