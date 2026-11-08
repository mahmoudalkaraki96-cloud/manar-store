"use client";
import {useEffect,useState} from "react";

const promptKey="manar_notify_prompt_at",prefsKey="manar_push_prefs",waitMs=7*24*60*60*1000;

export default function NotifyPrompt(){
 const [show,setShow]=useState(false);
 useEffect(()=>{try{const standalone=window.matchMedia("(display-mode: standalone)").matches||(navigator as Navigator&{standalone?:boolean}).standalone===true;if(!standalone||location.hostname.startsWith("admin.")||location.pathname.startsWith("/admin"))return;if(!("Notification" in window)||!("PushManager" in window)||Notification.permission!=="default")return;if(JSON.parse(localStorage.getItem(prefsKey)||"null")?.enabled)return;if(Date.now()-Number(localStorage.getItem(promptKey)||0)<waitMs)return;const timer=window.setTimeout(()=>setShow(true),1500);return()=>window.clearTimeout(timer)}catch{}},[]);
 if(!show)return null;
 const later=()=>{try{localStorage.setItem(promptKey,String(Date.now()))}catch{}setShow(false)};
 return <div className="notifyPrompt" role="dialog" aria-label="تفعيل الإشعارات"><p><span aria-hidden="true">🔔</span> بدك نوصلك إشعار لما يتحدّث طلبك؟ وبتقدر تختار العروض كمان.</p><div><button type="button" className="notifyPromptYes" onClick={()=>{later();window.dispatchEvent(new CustomEvent("manar:notification-enable"))}}>فعّل</button><button type="button" onClick={later}>لاحقاً</button></div></div>;
}
