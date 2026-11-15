"use client";
import {useStoreLanguage} from "../store-language";
import {useEffect,useState} from "react";
import {usePathname} from "next/navigation";
import {loadCart,type CartLine} from "../cart-storage";

const number=new Intl.NumberFormat("en-US",{maximumFractionDigits:2});
export default function StickyCartBar(){
 const {t}=useStoreLanguage();
 const pathname=usePathname(),[cart,setCart]=useState<Record<string,CartLine>>({});
 useEffect(()=>{const refresh=()=>setCart(loadCart());refresh();window.addEventListener("manar:cart",refresh);window.addEventListener("storage",refresh);window.addEventListener("focus",refresh);return()=>{window.removeEventListener("manar:cart",refresh);window.removeEventListener("storage",refresh);window.removeEventListener("focus",refresh)}},[]);
 const lines=Object.values(cart).filter(line=>Number.isFinite(line.qty)&&line.qty>0&&Number.isFinite(line.price)&&line.price>=0),count=lines.reduce((sum,line)=>sum+line.qty,0),subtotal=lines.reduce((sum,line)=>sum+line.qty*line.price,0);
 if(!count||pathname.startsWith("/admin"))return null;
 const open=(target:"cart"|"checkout")=>{window.dispatchEvent(new CustomEvent(`manar:open-${target}`))};
 return <><div className="stickyCartSpace" aria-hidden="true"/><aside className="stickyCartBar" aria-label="ملخص سلة المشتريات"><div className="stickyCartInner"><button type="button" className="stickyCartSummary" onClick={()=>open("cart")} aria-label="فتح سلة المشتريات"><span>{t("السلة","Cart","עגלה")} · <b>{number.format(count)} {t("قطعة","items","פריטים")}</b></span><strong aria-live="polite" aria-atomic="true">{number.format(subtotal)} ₪</strong><small>{t("قيمة المنتجات بدون التوصيل","Subtotal before delivery","סכום ביניים לפני משלוח")}</small></button><button type="button" className="stickyCheckoutButton" onClick={()=>open("checkout")}>{t("إتمام الطلب","Checkout","לתשלום")} <span aria-hidden="true">←</span></button></div></aside></>;
}

