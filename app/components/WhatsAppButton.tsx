"use client";
import {useEffect,useState} from "react";
import {usePathname} from "next/navigation";
import {cachedStoreSettings,loadStorefront,type StoreSettings} from "../storefront-types";

export default function WhatsAppButton(){
 const pathname=usePathname(),[s,setS]=useState<StoreSettings|null>(null),[admin,setAdmin]=useState(true);
 useEffect(()=>{setAdmin(location.hostname.startsWith("admin.")||location.pathname.startsWith("/admin"));setS(cachedStoreSettings());loadStorefront().then(data=>setS(data.settings)).catch(()=>{})},[]);
 if(admin||pathname.startsWith("/admin")||!s?.whatsappEnabled||!s.whatsapp)return null;
 const number=s.whatsapp.replace(/\D/g,"");
 const open=()=>{const name=pathname.startsWith("/product/")?document.querySelector("h1.desktopProductTitle,h1.mobileProductTitle,h1")?.textContent?.trim():"";const text=name?`مرحبا، بسأل عن: ${name}`:"مرحبا";window.open(`https://wa.me/${number}?text=${encodeURIComponent(text)}`,"_blank","noopener,noreferrer")};
 return <button className="whatsappFloat" type="button" aria-label="تواصل معنا عبر واتساب" title="تواصل معنا عبر واتساب" onClick={open}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 3.5A11.7 11.7 0 0 0 12.1 0C5.6 0 .4 5.2.4 11.7c0 2.1.5 4.1 1.6 5.9L0 24l6.6-1.7a11.7 11.7 0 0 0 5.5 1.4c6.5 0 11.8-5.2 11.8-11.7 0-3.1-1.2-6.1-3.4-8.5Zm-8.4 18.2c-1.7 0-3.5-.5-5-1.4l-.4-.2-3.9 1 1-3.8-.2-.4a9.7 9.7 0 1 1 8.5 4.8Zm5.3-7.2c-.3-.1-1.7-.8-2-1-.3-.1-.5-.1-.7.2l-.9 1.1c-.2.2-.4.2-.7.1-1.8-.9-3-1.7-4.2-3.8-.3-.5.3-.5.9-1.7.1-.2 0-.4 0-.6l-.9-2.2c-.2-.5-.5-.4-.7-.4h-.6c-.2 0-.6.1-.9.4-.3.3-1.2 1.2-1.2 2.9 0 1.7 1.2 3.3 1.4 3.5.1.2 2.4 3.7 5.9 5.2 2.2 1 3 .9 4.1.8.7-.1 1.7-.7 1.9-1.4.2-.7.2-1.3.2-1.4-.1-.2-.3-.3-.6-.4Z"/></svg></button>;
}
