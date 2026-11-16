"use client";
import {useStoreLanguage} from "../store-language";
import {useEffect,useState} from "react";

const promptKey="manar_notify_prompt_at",prefsKey="manar_push_prefs",waitMs=7*24*60*60*1000;

export default function NotifyPrompt(){const {t}=useStoreLanguage();
 const [show,setShow]=useState(false);
 useEffect(()=>{try{const standalone=window.matchMedia("(display-mode: standalone)").matches||(navigator as Navigator&{standalone?:boolean}).standalone===true;if(!standalone||location.hostname.startsWith("admin.")||location.pathname.startsWith("/admin"))return;if(!("Notification" in window)||!("PushManager" in window)||Notification.permission!=="default")return;if(JSON.parse(localStorage.getItem(prefsKey)||"null")?.enabled)return;if(Date.now()-Number(localStorage.getItem(promptKey)||0)<waitMs)return;const timer=window.setTimeout(()=>setShow(true),1500);return()=>window.clearTimeout(timer)}catch{}},[]);
 if(!show)return null;
 const later=()=>{try{localStorage.setItem(promptKey,String(Date.now()))}catch{}setShow(false)};
 return <div className="notifyPrompt" role="dialog" aria-label={t("notifications.enable")}><p><span aria-hidden="true">🔔</span> {t("notify_prompt.text")}</p><div><button type="button" className="notifyPromptYes" onClick={()=>{later();window.dispatchEvent(new CustomEvent("manar:notification-enable"))}}>{t("notify_prompt.enable")}</button><button type="button" onClick={later}>{t("notify_prompt.later")}</button></div></div>;
}
