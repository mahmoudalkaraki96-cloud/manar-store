"use client";
import {useEffect,useRef,useState,type ReactNode} from "react";
import {usePathname} from "next/navigation";
import Link from "next/link";
import {loadCatalog,type Category} from "../catalog-types";

export default function StoreShell({children}:{children:ReactNode}){
 const pathname=usePathname(),[categories,setCategories]=useState<Category[]>([]),[active,setActive]=useState<number|null>(null),[position,setPosition]=useState({top:100,right:260}),railRef=useRef<HTMLElement>(null),slotRef=useRef<HTMLDivElement>(null),closeTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const admin=pathname.startsWith("/admin");
 const cancelClose=()=>{if(closeTimer.current){clearTimeout(closeTimer.current);closeTimer.current=null}};
 const close=()=>{cancelClose();setActive(null)};
 useEffect(()=>{if(admin)return;let alive=true;loadCatalog().then(data=>{if(alive)setCategories(data.categories.filter(c=>c.active))}).catch(()=>{});return()=>{alive=false}},[admin]);
 useEffect(()=>{close();return cancelClose},[pathname]);
 useEffect(()=>{
  if(admin)return;
  const root=document.documentElement,header=document.querySelector<HTMLElement>(".shopHeaderWrap"),main=document.querySelector<HTMLElement>(".shopHeaderMain");
  if(!header||!main)return;
  const measure=()=>{root.style.setProperty("--store-header-height",`${Math.ceil(header.getBoundingClientRect().height)}px`);root.style.setProperty("--store-topbar-height",`${Math.ceil(main.getBoundingClientRect().bottom)+5}px`);setActive(null)};
  const observer=new ResizeObserver(measure);observer.observe(header);observer.observe(main);measure();window.addEventListener("resize",measure);
  return()=>{observer.disconnect();window.removeEventListener("resize",measure)};
 },[pathname,admin]);
 if(admin)return <>{children}</>;
 const roots=categories.filter(c=>c.parentId==null),selected=categories.find(c=>c.id===active),branches=categories.filter(c=>c.parentId===active);
 let currentPath=pathname;try{currentPath=decodeURIComponent(pathname)}catch{}
 const href=(category:Category)=>`/category/${category.slug}`;
 const open=(category:Category,element:HTMLElement)=>{cancelClose();if(!categories.some(c=>c.parentId===category.id)){setActive(null);return}const rail=railRef.current?.getBoundingClientRect(),rect=element.getBoundingClientRect();const minimumTop=Math.ceil(document.querySelector<HTMLElement>(".shopHeaderWrap")?.getBoundingClientRect().bottom??81)+10;if(rail)setPosition({right:document.documentElement.clientWidth-rail.left+6,top:Math.max(minimumTop,Math.min(rect.top,window.innerHeight-280))});setActive(category.id)};
 const scheduleClose=()=>{cancelClose();closeTimer.current=setTimeout(()=>setActive(null),180)};
 const descendants=(rootId:number,depth=0,seen=new Set<number>()):ReactNode=>{if(depth>5||seen.has(rootId))return null;const next=new Set(seen).add(rootId);return categories.filter(c=>c.parentId===rootId).map(child=><div key={child.id} className="categoryFlyoutBranch"><Link href={href(child)} style={{paddingInlineStart:12+depth*14}} aria-current={currentPath===href(child)?"page":undefined} onClick={close}>{child.iconUrl&&<img src={child.iconUrl} alt=""/>}<span>{child.name}</span></Link>{descendants(child.id,depth+1,next)}</div>)};
 return <div className="storeShell"><div onKeyDown={event=>{if(event.key==="Escape")close()}} className="desktopCategorySlot" ref={slotRef} onMouseEnter={cancelClose} onMouseLeave={scheduleClose} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))close()}}><aside className="desktopCategoryRail" ref={railRef} aria-label="الأقسام الرئيسية"><div className="categoryRailHeading"><b>أقسام المتجر</b><span aria-hidden="true">▦</span></div><nav className="categoryRailScroll" onScroll={close}><Link className="categoryRailAll" href="/" onFocus={close} onClick={close}>الرئيسية <span aria-hidden="true">←</span></Link>{roots.map(category=>{const hasChildren=categories.some(c=>c.parentId===category.id);return <div className={`categoryRailItem ${active===category.id?"isOpen":""}`} key={category.id} onMouseEnter={event=>open(category,event.currentTarget)}><Link href={href(category)} aria-current={currentPath===href(category)?"page":undefined} onFocus={event=>open(category,event.currentTarget)} onClick={close}><span className="categoryRailIcon" aria-hidden="true">{category.iconUrl?<img src={category.iconUrl} alt="" loading="lazy" decoding="async"/>:"▦"}</span><span>{category.name}</span></Link>{hasChildren&&<button type="button" aria-label={`الأقسام الفرعية: ${category.name}`} aria-expanded={active===category.id} aria-controls="desktopCategoryFlyout" onClick={event=>open(category,event.currentTarget)}>‹</button>}</div>})}</nav></aside>{selected&&branches.length>0&&<nav id="desktopCategoryFlyout" className="desktopCategoryFlyout" aria-label={`فروع ${selected.name}`} style={{top:position.top,right:position.right,maxHeight:"calc(100dvh - "+(position.top+16)+"px)"}} onMouseEnter={cancelClose}><div className="categoryFlyoutHeading"><Link href={href(selected)} onClick={close}>{selected.name}</Link><button type="button" aria-label="إغلاق الأقسام الفرعية" onClick={close}>×</button></div>{descendants(selected.id)}</nav>}</div><div className="storeShellContent">{children}</div></div>;
}

