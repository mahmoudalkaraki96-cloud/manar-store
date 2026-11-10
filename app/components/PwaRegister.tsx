"use client";
import Notifications from "./Notifications";
import FloatingAction from "./FloatingAction";
import NotifyPrompt from "./NotifyPrompt";
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
  const reportInstall=async(source:"appinstalled"|"standalone")=>{
   try{
    const idKey="manar_pwa_install_id",surface=adminSurface?"admin":"storefront",reportedKey="manar_pwa_install_reported:"+surface;
    let installationId=localStorage.getItem(idKey);
    if(!installationId){installationId=crypto.randomUUID();localStorage.setItem(idKey,installationId)}
    if(localStorage.getItem(reportedKey)===installationId)return;
    const response=await fetch("/api/pwa/install",{method:"POST",credentials:"same-origin",cache:"no-store",keepalive:true,headers:{"content-type":"application/json"},body:JSON.stringify({installationId,source})});
    if(response.ok)localStorage.setItem(reportedKey,installationId);
   }catch{}
  };
  const onInstalled=()=>{setInstalled(true);setPrompt(null);setShowIosHelp(false);void reportInstall("appinstalled")};
  window.addEventListener("beforeinstallprompt",onPrompt);
  window.addEventListener("appinstalled",onInstalled);
  if(isStandalone()){setInstalled(true);void reportInstall("standalone")}
  return()=>{
   window.removeEventListener("beforeinstallprompt",onPrompt);
   window.removeEventListener("appinstalled",onInstalled);
  };
 },[]);
 useEffect(()=>{const root=document.documentElement;if(!admin&&!installed&&(prompt||/iphone|ipad|ipod/i.test(navigator.userAgent)))root.dataset.pwaInstallable="1";else delete root.dataset.pwaInstallable;const open=()=>{if(prompt)void prompt.prompt().then(()=>prompt.userChoice).then(choice=>{if(choice.outcome==="accepted")setInstalled(true);setPrompt(null)}).catch(()=>{});else if(!installed)setShowIosHelp(true)};window.addEventListener("manar:install-app",open);return()=>window.removeEventListener("manar:install-app",open)},[prompt,installed,admin]);

 if(installed)return <><Notifications/><NotifyPrompt/></>;
 const ios=typeof navigator!=="undefined"&&/iphone|ipad|ipod/i.test(navigator.userAgent);
 if(!prompt&&!ios)return <Notifications/>;
 const appName=admin?"إدارة المتجر":"المتجر";

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
  <FloatingAction id={admin?"admin-install":"install"} label={admin?"تثبيت لوحة التحكم":"تثبيت التطبيق"} bottom={admin?14:24} hideHint={admin?"إخفاء الزر؛ يمكنك إظهاره من إعدادات لوحة التحكم":"إخفاء الزر؛ يمكنك إظهاره من التطبيق والإشعارات أعلى المتجر"}><button className="pwaInstallButton" type="button" onClick={install} aria-label={`تثبيت تطبيق ${appName}`}>
   <span aria-hidden="true">↧</span> {admin?"تثبيت لوحة التحكم":"تثبيت التطبيق"}
  </button></FloatingAction>
  {showIosHelp&&<div className="pwaInstallHelp" role="dialog" aria-modal="true" aria-label="طريقة تثبيت التطبيق">
   <button className="pwaInstallClose" type="button" onClick={()=>setShowIosHelp(false)} aria-label="إغلاق">×</button>
   <b>تثبيت {appName} على الآيفون</b>
   <p>اضغط زر المشاركة في Safari، ثم اختر «إضافة إلى الشاشة الرئيسية» وبعدها «إضافة».</p>
  </div>}
 </>;
}

