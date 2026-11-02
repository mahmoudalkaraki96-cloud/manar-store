"use client";
import {useEffect,useState} from "react";
import {createPortal} from "react-dom";
import Link from "next/link";
import {usePathname} from "next/navigation";
import type {Category} from "../catalog-types";
import type {StoreSettings} from "../storefront-types";

type Props={categories:Category[];settings:StoreSettings;signedIn:boolean;onFavorites?:()=>void};

export default function MobileMenu({categories,settings:s,signedIn,onFavorites}:Props){
 const pathname=usePathname(),[mounted,setMounted]=useState(false),[open,setOpen]=useState(false),[expanded,setExpanded]=useState<number|null>(null);
 useEffect(()=>setMounted(true),[]);
 useEffect(()=>setOpen(false),[pathname]);
 useEffect(()=>{if(!open)return;const root=document.documentElement,previous=root.style.overflow;root.style.overflow="hidden";const key=(event:KeyboardEvent)=>{if(event.key==="Escape")setOpen(false)};window.addEventListener("keydown",key);return()=>{root.style.overflow=previous;window.removeEventListener("keydown",key)}},[open]);
 const active=categories.filter(c=>c.active!==false),roots=active.filter(c=>c.parentId==null),branches=(id:number)=>active.filter(c=>c.parentId===id);
 const close=()=>setOpen(false),send=(name:string)=>{close();window.dispatchEvent(new CustomEvent(name))};
 const whatsapp=s.whatsappEnabled&&s.whatsapp?`https://wa.me/${s.whatsapp.replace(/\D/g,"")}`:"",instagram=s.instagramEnabled?s.instagramUrl:"",facebook=s.facebookEnabled?s.facebookUrl:"";
 const panel=<div className={`mobileMenuLayer ${open?"open":""}`} onClick={close}>
  <nav id="mobileMenuPanel" className="mobileMenuPanel" aria-label="القائمة" aria-hidden={!open} onClick={event=>event.stopPropagation()}>
   <div className="mobileMenuHead">{s.logoUrl?<img src={s.logoUrl} alt={s.storeName}/>:<b>{s.storeName}</b>}<button type="button" aria-label="إغلاق القائمة" onClick={close}>×</button></div>
   <section><h3>حسابي</h3><Link href="/account" onClick={close}>{signedIn?"حسابي":"تسجيل الدخول"}</Link><Link href="/track-order" onClick={close}>تتبع الطلب</Link>{onFavorites&&<button type="button" onClick={()=>{close();onFavorites()}}>المفضلة</button>}</section>
   <section><h3>الأقسام</h3><Link href="/" onClick={close}>الرئيسية</Link>{roots.map(c=>{const children=branches(c.id),isOpen=expanded===c.id;return <div className="mobileMenuCategory" key={c.id}><div className="mobileMenuRow"><Link href={`/category/${c.slug}`} onClick={close}>{c.iconUrl?<img src={c.iconUrl} alt="" loading="lazy"/>:<i aria-hidden="true">▦</i>}<span>{c.name}</span></Link>{children.length>0&&<button type="button" aria-label={`الأقسام الفرعية: ${c.name}`} aria-expanded={isOpen} onClick={()=>setExpanded(isOpen?null:c.id)}>⌄</button>}</div>{isOpen&&<div className="mobileMenuBranch">{children.map(x=><Link key={x.id} href={`/category/${x.slug}`} onClick={close}>{x.iconUrl&&<img src={x.iconUrl} alt="" loading="lazy"/>}<span>{x.name}</span></Link>)}</div>}</div>})}</section>
   <section><h3>المتجر</h3><Link href="/policies/terms" onClick={close}>سياسات المتجر</Link><button type="button" onClick={()=>send("manar:notification-settings")}>الإشعارات</button><button type="button" className="mobileMenuInstall" onClick={()=>send("manar:install-app")}>تثبيت التطبيق</button></section>
   {(whatsapp||instagram||facebook)&&<section><h3>تواصل معنا</h3>{whatsapp&&<a href={whatsapp} target="_blank" rel="noopener noreferrer">واتساب</a>}{instagram&&<a href={instagram} target="_blank" rel="noopener noreferrer">إنستغرام</a>}{facebook&&<a href={facebook} target="_blank" rel="noopener noreferrer">فيسبوك</a>}</section>}
  </nav>
 </div>;
 return <><button className="mobileMenuButton" type="button" aria-label="القائمة" aria-expanded={open} aria-controls="mobileMenuPanel" onClick={()=>setOpen(true)}><span aria-hidden="true"/><span aria-hidden="true"/><span aria-hidden="true"/></button>{mounted&&createPortal(panel,document.body)}</>;
}
