"use client";
import {useEffect,useRef,useState} from "react";
import {usePathname} from "next/navigation";
import {catalogIsStale,refreshCatalog} from "../catalog-types";
import {loadStorefront,storefrontIsStale} from "../storefront-types";
import {useStoreLanguage} from "../store-language";

const PULL_TRIGGER=72,PULL_MAX=110;

/** Fetches fresh products and settings now; pages showing them update through the store data event. */
export function refreshStoreData(){
 return Promise.allSettled([refreshCatalog(),loadStorefront(true)]);
}

function installedApp(){
 return window.matchMedia?.("(display-mode: standalone)").matches||(navigator as Navigator&{standalone?:boolean}).standalone===true;
}

/**
 * Keeps store data current: refreshes in the background when the visitor comes back to the tab/app after a minute,
 * and adds pull-to-refresh in the installed app (browsers already have their own, which reloads the page).
 */
export default function StoreRefresh(){
 const {t}=useStoreLanguage();
 const pathname=usePathname()||"/";
 const admin=pathname.startsWith("/admin");
 const [pull,setPull]=useState(0),[busy,setBusy]=useState(false);
 const start=useRef<number|null>(null),busyRef=useRef(false),pullRef=useRef(0);
 const show=(value:number)=>{pullRef.current=value;setPull(value)};

 useEffect(()=>{
  if(admin)return;
  const onVisible=()=>{if(document.visibilityState==="visible"&&(catalogIsStale()||storefrontIsStale()))void refreshStoreData()};
  document.addEventListener("visibilitychange",onVisible);
  window.addEventListener("pageshow",onVisible);
  return()=>{document.removeEventListener("visibilitychange",onVisible);window.removeEventListener("pageshow",onVisible)};
 },[admin]);

 useEffect(()=>{
  if(admin||!installedApp())return;
  // A pull only starts at the very top of the page, and not while a menu, cart or dialog has locked scrolling.
  const atTop=()=>(document.scrollingElement?.scrollTop||window.scrollY)<=0&&document.body.style.position!=="fixed";
  const onStart=(event:TouchEvent)=>{start.current=!busyRef.current&&event.touches.length===1&&atTop()?event.touches[0].clientY:null};
  const onMove=(event:TouchEvent)=>{
   if(start.current===null)return;
   const distance=event.touches[0].clientY-start.current;
   if(distance<=0||!atTop()){start.current=null;show(0);return}
   if(event.cancelable)event.preventDefault();
   show(Math.min(PULL_MAX,distance*0.55));
  };
  const onEnd=()=>{
   if(start.current===null)return;
   start.current=null;
   if(pullRef.current<PULL_TRIGGER){show(0);return}
   show(PULL_TRIGGER);busyRef.current=true;setBusy(true);
   void refreshStoreData().finally(()=>{busyRef.current=false;setBusy(false);show(0)});
  };
  window.addEventListener("touchstart",onStart,{passive:true});
  window.addEventListener("touchmove",onMove,{passive:false});
  window.addEventListener("touchend",onEnd);
  window.addEventListener("touchcancel",onEnd);
  return()=>{window.removeEventListener("touchstart",onStart);window.removeEventListener("touchmove",onMove);window.removeEventListener("touchend",onEnd);window.removeEventListener("touchcancel",onEnd)};
 },[admin]);

 if(admin||(!pull&&!busy))return null;
 const ready=pull>=PULL_TRIGGER;
 return <div className={"pullRefresh"+(busy?" isBusy":"")} style={{transform:`translate(-50%,${Math.round(pull)}px)`}} role="status" aria-live="polite">
  <span className="pullRefreshIcon" aria-hidden="true" style={{transform:busy?undefined:`rotate(${Math.round(pull*3)}deg)`}}>↻</span>
  <span>{busy?t("refresh.busy"):ready?t("refresh.release"):t("refresh.pull")}</span>
 </div>;
}
