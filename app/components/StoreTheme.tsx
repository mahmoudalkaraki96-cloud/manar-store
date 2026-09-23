"use client";
import {useEffect} from "react";
import {usePathname} from "next/navigation";
import {loadStorefront,type StoreSettings} from "../storefront-types";

function applyStoreIdentity(settings:StoreSettings){
 const root=document.documentElement;
 root.style.setProperty("--green",settings.primaryColor);
 root.style.setProperty("--gold",settings.secondaryColor);
 root.style.setProperty("--pageBg",settings.backgroundColor);
 const name=settings.storeName&&settings.storeName!=="Store"&&settings.storeName!=="Online Store"?settings.storeName:"Manar Store";
 document.title=location.pathname.startsWith("/admin")?`${name} – لوحة التحكم`:name;
 const adminBrand=document.querySelector<HTMLElement>(".adminSide .brand b");
 if(adminBrand)adminBrand.textContent=name;
}

export default function StoreTheme(){
 const pathname=usePathname();
 useEffect(()=>{if(pathname.startsWith("/admin"))return;try{const key="manar_visitor_id",visitorId=localStorage.getItem(key)||crypto.randomUUID();localStorage.setItem(key,visitorId);void fetch("/api/analytics/visit",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({visitorId}),keepalive:true})}catch{}},[pathname]);
 useEffect(()=>{
  let active=true;
  const onSettings=(event:Event)=>{const detail=(event as CustomEvent<StoreSettings>).detail;if(detail)applyStoreIdentity(detail)};
  window.addEventListener("store-settings-updated",onSettings);
  loadStorefront().then(({settings})=>{if(active)applyStoreIdentity(settings)}).catch(()=>{});
  return()=>{active=false;window.removeEventListener("store-settings-updated",onSettings)};
 },[]);
 return null;
}
