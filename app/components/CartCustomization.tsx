"use client";
import {useStoreLanguage} from "../store-language";
import {useEffect,useRef,useState,type FormEvent} from "react";
import {usePathname} from "next/navigation";
import {addCartItem,type CartCustomizationRequest} from "../cart-storage";

export default function CartCustomization(){const {t}=useStoreLanguage();
 const pathname=usePathname(),dialogRef=useRef<HTMLDialogElement>(null),[request,setRequest]=useState<CartCustomizationRequest|null>(null),[values,setValues]=useState<Record<string,string>>({});
 const close=()=>{dialogRef.current?.close();setRequest(null)};
 useEffect(()=>{const open=(event:Event)=>{const detail=(event as CustomEvent<CartCustomizationRequest>).detail;if(!detail?.product)return;setValues(detail.customizations||{});setRequest(detail)};window.addEventListener("manar:customize-cart",open);return()=>window.removeEventListener("manar:customize-cart",open)},[]);
 useEffect(()=>{if(!request)return;const dialog=dialogRef.current;if(!dialog)return;const previous=document.body.style.overflow;document.body.style.overflow="hidden";dialog.showModal();return()=>{dialog.close();document.body.style.overflow=previous}},[request]);
 useEffect(()=>{setRequest(null)},[pathname]);
 const submit=(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();if(!request)return;const fields=request.product.customFields||[];if(fields.some(field=>field.required&&!values[field.label]?.trim()))return;const custom=Object.fromEntries(fields.map(field=>[field.label,(values[field.label]||"").trim()]).filter(([,value])=>value));addCartItem(request.product,request.variant,request.qty,custom,request.unique||Object.keys(custom).length>0,true);close()};
 return <dialog ref={dialogRef} className="cartCustomizationDialog" aria-labelledby="cartCustomizationTitle" onCancel={()=>setRequest(null)} onClose={()=>setRequest(null)} onClick={event=>{if(event.target===event.currentTarget){const rect=event.currentTarget.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)close()}}}>{request&&<form onSubmit={submit}><div className="cartCustomizationHead"><div><h2 id="cartCustomizationTitle">{t("customize.title")}</h2><p>{request.product.name}{request.variant?` — ${request.variant.name}`:""}</p></div><button type="button" aria-label={t("customize.close")} onClick={close}>×</button></div><p className="cartCustomizationHint">{t("customize.intro")}</p>{request.product.customFields?.map((field,index)=><label className="cartCustomizationField" key={field.id??index}><span>{field.label}{field.required?" *":t("common.optional")}</span><input autoFocus={index===0} required={field.required} pattern={field.required?".*\\S.*":undefined} maxLength={field.maxLength||100} placeholder={field.placeholder} value={values[field.label]||""} onChange={event=>setValues(current=>({...current,[field.label]:event.target.value}))} onInvalid={event=>event.currentTarget.setCustomValidity(t("form.required_field"))} onInput={event=>event.currentTarget.setCustomValidity("")}/></label>)}<button type="submit" className="cartCustomizationSubmit">{t("customize.add_to_cart")}</button></form>}</dialog>;
}

