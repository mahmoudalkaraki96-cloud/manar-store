"use client";
import {useEffect} from "react";
import {loadStorefront,type StoreSettings} from "../storefront-types";

function applyStoreIdentity(settings:StoreSettings){
 const root=document.documentElement;
 root.style.setProperty("--green",settings.primaryColor);
 root.style.setProperty("--gold",settings.secondaryColor);
 root.style.setProperty("--pageBg",settings.backgroundColor);
 document.title=settings.storeName||"Store";
 const adminBrand=document.querySelector<HTMLElement>(".adminSide .brand b");
 if(adminBrand)adminBrand.textContent=settings.storeName||"Store";
}

export default function StoreTheme(){
 useEffect(()=>{
  let active=true;
  const onSettings=(event:Event)=>{const detail=(event as CustomEvent<StoreSettings>).detail;if(detail)applyStoreIdentity(detail)};
  window.addEventListener("store-settings-updated",onSettings);
  loadStorefront().then(({settings})=>{if(active)applyStoreIdentity(settings)}).catch(()=>{});
  return()=>{active=false;window.removeEventListener("store-settings-updated",onSettings)};
 },[]);
 return null;
}
