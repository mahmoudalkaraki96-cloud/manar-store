"use client";
import {useEffect,useState} from "react";
import {usePathname,useRouter} from "next/navigation";
import {loadCart,type CartLine} from "../cart-storage";

const number=new Intl.NumberFormat("en-US",{maximumFractionDigits:2});
export default function StickyCartBar(){
 const pathname=usePathname(),router=useRouter(),[cart,setCart]=useState<Record<string,CartLine>>({});
 useEffect(()=>{const refresh=()=>setCart(loadCart());refresh();window.addEventListener("manar:cart",refresh);window.addEventListener("storage",refresh);window.addEventListener("focus",refresh);return()=>{window.removeEventListener("manar:cart",refresh);window.removeEventListener("storage",refresh);window.removeEventListener("focus",refresh)}},[]);
 const lines=Object.values(cart).filter(line=>Number.isFinite(line.qty)&&line.qty>0&&Number.isFinite(line.price)&&line.price>=0),count=lines.reduce((sum,line)=>sum+line.qty,0),subtotal=lines.reduce((sum,line)=>sum+line.qty*line.price,0);
 if(!count||pathname.startsWith("/admin"))return null;
 const open=(target:"cart"|"checkout")=>{if(pathname==="/")window.dispatchEvent(new CustomEvent(`manar:open-${target}`));else router.push(`/?${target}=open`)};
 return <><div className="stickyCartSpace" aria-hidden="true"/><aside className="stickyCartBar" aria-label="ملخص سلة المشتريات"><div className="stickyCartInner"><button type="button" className="stickyCartSummary" onClick={()=>open("cart")} aria-label="فتح سلة المشتريات"><span>السلة · <b>{number.format(count)} قطعة</b></span><strong aria-live="polite" aria-atomic="true">{number.format(subtotal)} ₪</strong><small>قيمة المنتجات بدون التوصيل</small></button><button type="button" className="stickyCheckoutButton" onClick={()=>open("checkout")}>إتمام الطلب <span aria-hidden="true">←</span></button></div></aside></>;
}

