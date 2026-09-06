"use client";
import {useEffect} from "react";
import {loadStorefront} from "../storefront-types";

export default function StoreTheme(){
 useEffect(()=>{
  let active=true;
  loadStorefront().then(({settings})=>{
   if(!active)return;
   const root=document.documentElement;
   root.style.setProperty("--green",settings.primaryColor);
   root.style.setProperty("--gold",settings.secondaryColor);
   root.style.setProperty("--pageBg",settings.backgroundColor);
  }).catch(()=>{});
  return()=>{active=false};
 },[]);
 return null;
}
