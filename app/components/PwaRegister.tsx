"use client";
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

export default function PwaRegister(){
 const [prompt,setPrompt]=useState<InstallPromptEvent|null>(null);
 const [showIosHelp,setShowIosHelp]=useState(false);
 const [installed,setInstalled]=useState(false);

 useEffect(()=>{
  if(!("serviceWorker" in navigator))return;
  const register=()=>navigator.serviceWorker.register("/sw.js",{scope:"/"}).then(registration=>registration.update()).catch(()=>{});
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

 if(installed)return null;
 const ios=typeof navigator!=="undefined"&&/iphone|ipad|ipod/i.test(navigator.userAgent);
 if(!prompt&&!ios)return null;

 async function install(){
  if(prompt){
   await prompt.prompt();
   const choice=await prompt.userChoice;
   if(choice.outcome==="accepted")setInstalled(true);
   setPrompt(null);
  }else setShowIosHelp(true);
 }

 return <>
  <button className="pwaInstallButton" type="button" onClick={install} aria-label="تثبيت تطبيق Manar Store">
   <span aria-hidden="true">↧</span> تثبيت التطبيق
  </button>
  {showIosHelp&&<div className="pwaInstallHelp" role="dialog" aria-modal="true" aria-label="طريقة تثبيت التطبيق">
   <button className="pwaInstallClose" type="button" onClick={()=>setShowIosHelp(false)} aria-label="إغلاق">×</button>
   <b>تثبيت Manar Store على الآيفون</b>
   <p>اضغط زر المشاركة في Safari، ثم اختر «إضافة إلى الشاشة الرئيسية» وبعدها «إضافة».</p>
  </div>}
 </>;
}
