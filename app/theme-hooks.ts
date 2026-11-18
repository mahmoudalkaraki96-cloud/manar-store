"use client";
import {useEffect,useState} from "react";

/**
 * The active theme id. The server writes it on <html data-theme> before first paint and StoreTheme keeps it
 * current (settings change or a ?theme_preview link), so components follow the attribute instead of guessing.
 * The first render returns "standard" so server and client markup match.
 */
export function useThemeId(){
 const [id,setId]=useState("standard");
 useEffect(()=>{
  const root=document.documentElement,read=()=>setId(root.dataset.theme||"standard");
  read();
  const observer=new MutationObserver(read);
  observer.observe(root,{attributes:true,attributeFilter:["data-theme"]});
  return()=>observer.disconnect();
 },[]);
 return id;
}
