"use client";
import Notifications from "./Notifications";
import {useEffect,useState} from "react";

type InstallPromptEvent=Event&{
 prompt:()=>Promise<void>;
 userChoice:Promise<{outcome:"accepted"|"dismissed";platform:string}>;
};

function isStandalone(){
 if(typeof window==="undefined")return false;
 return window.matchMedia("(display-mode: standalone)").matches||
  (window.navigator as Navigator&{standalone?:boolean}).standalone===true;
}

function isAdminSurface(){
 if(typeof window==="undefined")return false;
 return window.location.hostname.startsWith("admin.")||window.location.pathname.startsWith("/admin");
}

export default function PwaRegister(){
 const [prompt,setPrompt]=useState<InstallPromptEvent|null>(null);
 const [showIosHelp,setShowIosHelp]=useState(false);
 const [installed,setInstalled]=useState(false);
 const [admin,setAdmin]=useState(false);

 useEffect(()=>{
  const adminSurface=isAdminSurface();
  setAdmin(adminSurface);
  const manifest=adminSurface?"/admin-manifest.webmanifest":"/manifest.webmanifest";
  let manifestLink=document.head.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if(!manifestLink){
   manifestLink=document.createElement("link");
   manifestLink.rel="manifest";
   document.head.appendChild(manifestLink);
  }
  manifestLink.href=manifest;

  if(!("serviceWorker" in navigator))return;
  const worker=adminSurface?"/admin-sw.js":"/sw.js";
  const register=()=>navigator.serviceWorker.register(worker,{scope:"/"}).then(registration=>registration.update()).catch(()=>{});
  if(document.readyState==="complete")void register();
  else window.addEventListener("load",register,{once:true});

  const onPrompt=(event:Event)=>{
   event.preventDefault();
   setPrompt(event as InstallPromptEvent);
  };
  const onInstalled=()=>{setInstalled(true);setPrompt(null);setShowIosHelp(false)};
  window.addEventListener("beforeinstallprompt",onPrompt);
  window.addEventListener("appinstalled",onInstalled);
  setInstalled(isStandalone());
  return()=>{
   window.removeEventListener("beforeinstallprompt",onPrompt);
   window.removeEventListener("appinstalled",onInstalled);
  };
 },[]);

 if(installed)return <Notifications/>;
 const ios=typeof navigator!=="undefined"&&/iphone|ipad|ipod/i.test(navigator.userAgent);
 if(!prompt&&!ios)return <Notifications/>;
 const appName=admin?"Manar Store Admin":"Manar Store";

 async function install(){
  if(prompt){
   await prompt.prompt();
   const choice=await prompt.userChoice;
   if(choice.outcome==="accepted")setInstalled(true);
   setPrompt(null);
  }else setShowIosHelp(true);
 }

 return <>
  <Notifications/>
  <button className="pwaInstallButton" type="button" onClick={install} aria-label={`تثبيت تطبيق ${appName}`}>
   <span aria-hidden="true">↧</span> {admin?"تثبيت لوحة التحكم":"تثبيت التطبيق"}
  </button>
  {showIosHelp&&<div className="pwaInstallHelp" role="dialog" aria-modal="true" aria-label="طريقة تثبيت التطبيق">
   <button className="pwaInstallClose" type="button" onClick={()=>setShowIosHelp(false)} aria-label="إغلاق">×</button>
   <b>تثبيت {appName} على الآيفون</b>
   <p>اضغط زر المشاركة في Safari، ثم اختر «إضافة إلى الشاشة الرئيسية» وبعدها «إضافة».</p>
  </div>}
 </>;
}

