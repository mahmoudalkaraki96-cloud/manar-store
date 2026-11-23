"use client";
import {useEffect,useMemo,useState} from "react";

// 1.9.8: sidebar groups — three always open, three that fold away.
export type AdminNavGroup={key:string;label:string;collapsible?:boolean;items:string[]};
export const adminNavGroups:AdminNavGroup[]=[
 {key:"today",label:"اليوم",items:["نظرة عامة","الطلبات","الزبائن"]},
 {key:"catalog",label:"الكتالوج",items:["المنتجات","الأقسام","المتغيرات والمخزون","استيراد الأصناف"]},
 {key:"marketing",label:"التسويق",items:["الخصومات وأكواد الخصم","العروض والمحتوى","الهايلايتس","مراجعات المنتجات","التحليلات"]},
 {key:"operations",label:"العمليات",collapsible:true,items:["المشتريات والموردون","الشحن والمناطق"]},
 {key:"storefront",label:"واجهة المتجر",collapsible:true,items:["نصوص الواجهة","سياسات المتجر"]},
 {key:"admin",label:"الإدارة",collapsible:true,items:["الإعدادات","المستخدمون والصلاحيات","مجموعات الصلاحيات","سجل الحركات"]}
];

const iconPaths:Record<string,string[]>={
 "نظرة عامة":["M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"],
 "الطلبات":["M6 3h12v18l-3-2-3 2-3-2-3 2z","M9 8h6M9 12h6"],
 "الزبائن":["M12.5 8a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0z","M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5","M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.8.7 3 2.5 3.5 5.2"],
 "المنتجات":["M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z","M3 7.5 12 12l9-4.5M12 12v9"],
 "الأقسام":["M4.5 3h4A1.5 1.5 0 0 1 10 4.5v4A1.5 1.5 0 0 1 8.5 10h-4A1.5 1.5 0 0 1 3 8.5v-4A1.5 1.5 0 0 1 4.5 3zM15.5 3h4A1.5 1.5 0 0 1 21 4.5v4a1.5 1.5 0 0 1-1.5 1.5h-4A1.5 1.5 0 0 1 14 8.5v-4A1.5 1.5 0 0 1 15.5 3zM4.5 14h4a1.5 1.5 0 0 1 1.5 1.5v4A1.5 1.5 0 0 1 8.5 21h-4A1.5 1.5 0 0 1 3 19.5v-4A1.5 1.5 0 0 1 4.5 14zM15.5 14h4a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-4a1.5 1.5 0 0 1-1.5-1.5v-4a1.5 1.5 0 0 1 1.5-1.5z"],
 "المتغيرات والمخزون":["M12 3 2 8l10 5 10-5z","M2 13l10 5 10-5"],
 "استيراد الأصناف":["M12 3v12M7 10l5 5 5-5","M4 17v3h16v-3"],
 "الخصومات وأكواد الخصم":["M19 5 5 19","M9.5 7a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM19.5 17a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z"],
 "العروض والمحتوى":["M3 10v4h4l6 4V6L7 10z","M17 9a4 4 0 0 1 0 6"],
 "الهايلايتس":["M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z","M10 8.5v7l6-3.5z"],
 "مراجعات المنتجات":["m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"],
 "التحليلات":["M4 20V10M10 20V4M16 20v-7M21 20H3"],
 "المشتريات والموردون":["M3 9h18l-1.5-5h-15z","M4 9v11h16V9","M9 20v-6h6v6"],
 "الشحن والمناطق":["M2 6h12v10H2zM14 10h4l3 3v3h-7","M8 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM19 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"],
 "نصوص الواجهة":["M4 6h16M4 12h10M4 18h7"],
 "سياسات المتجر":["M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z"],
 "الإعدادات":["M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12","M18 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM12 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM20 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"],
 "المستخدمون والصلاحيات":["M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0z","M4 21c1-4 4.4-6 8-6s7 2 8 6"],
 "مجموعات الصلاحيات":["M12 15a4 4 0 1 1-8 0 4 4 0 0 1 8 0z","m11 12 9-9M17 6l3 3"],
 "سجل الحركات":["M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z","M12 7v5l3 2"]
};
export function AdminNavIcon({item}:{item:string}){return <svg className="navIcon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">{(iconPaths[item]||["M5 12h14"]).map(d=><path key={d} d={d}/>)}</svg>;}

const storageKey="admin-nav-open-groups";
const normalize=(value:string)=>value.replace(/[أإآ]/g,"ا").replace(/ة/g,"ه").replace(/ى/g,"ي").toLowerCase().trim();

export default function AdminNav({tab,canModule,onNavigate,badgeFor,newOrders}:{tab:string;canModule:(item:string)=>boolean;onNavigate:(item:string)=>void;badgeFor:(item:string)=>number|undefined;newOrders?:number}){
 const [open,setOpen]=useState<Record<string,boolean>>({});
 const [query,setQuery]=useState("");
 useEffect(()=>{try{const saved=JSON.parse(localStorage.getItem(storageKey)||"{}");if(saved&&typeof saved==="object")setOpen(saved);}catch{}},[]);
 const groups=useMemo(()=>adminNavGroups.map(group=>({...group,items:group.items.filter(item=>canModule(item))})).filter(group=>group.items.length),[canModule]);
 const search=normalize(query);
 const toggle=(key:string,current:boolean)=>setOpen(previous=>{const next={...previous,[key]:!current};try{localStorage.setItem(storageKey,JSON.stringify(next));}catch{}return next;});
 const shown=search?groups.map(group=>({...group,items:group.items.filter(item=>normalize(item).includes(search))})).filter(group=>group.items.length):groups;
 return <nav className="adminNav">
  <label className="adminNavSearch"><svg className="navIcon" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0z"/><path d="m20 20-4-4"/></svg><span className="visuallyHidden">ابحث بالقائمة</span><input type="search" value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"&&shown[0]?.items[0]){onNavigate(shown[0].items[0]);setQuery("");}if(event.key==="Escape")setQuery("");}} placeholder="ابحث… مثلاً «شحن»"/></label>
  {search&&!shown.length&&<p className="adminNavEmpty">ما في صفحة بهالاسم.</p>}
  {shown.map(group=>{
   const containsActive=group.items.includes(tab);
   const isOpen=!group.collapsible||Boolean(search)||(open[group.key]??containsActive);
   const id="admin-nav-"+group.key;
   return <div className={"adminNavGroup"+(group.collapsible?" collapsible":"")} key={group.key}>
    {group.collapsible&&!search?<button type="button" className="adminNavGroupToggle" aria-expanded={isOpen} aria-controls={id} onClick={()=>toggle(group.key,isOpen)}><span>{group.label}</span>{!isOpen&&containsActive&&<i className="adminNavDot" aria-label="الصفحة المفتوحة هون"/>}<svg className={"adminNavChevron"+(isOpen?"":" closed")} viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>:<small>{group.label}</small>}
    {isOpen&&<div id={id}>{group.items.map(item=><button type="button" key={item} className={tab===item?"active":""} aria-current={tab===item?"page":undefined} onClick={()=>{onNavigate(item);setQuery("");}}><AdminNavIcon item={item}/><span>{item}</span>{item==="الطلبات"&&Number(newOrders)>0?<b className="navNewOrders" title="طلبات جديدة بحاجة لتأكيد">{newOrders} جديد</b>:["المنتجات","الأقسام","الطلبات","الهايلايتس"].includes(item)&&<b className="navBadge" aria-label={"عدد "+item}>{badgeFor(item)??"…"}</b>}</button>)}</div>}
   </div>;
  })}
 </nav>;
}
