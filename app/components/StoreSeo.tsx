"use client";
import {useEffect} from "react";
import {usePathname} from "next/navigation";

// React's hydration replaces worker-injected metadata with the root layout's
// defaults. Restore the same server metadata after hydration and navigation.
export default function StoreSeo(){
 const pathname=usePathname();
 useEffect(()=>{
  if(location.hostname.startsWith("admin.")||pathname.startsWith("/admin"))return;
  let stopped=false,observer:MutationObserver|undefined;
  const controller=new AbortController();
  const apply=(head:string)=>{
   if(stopped)return;
   const parsed=new DOMParser().parseFromString("<html><head>"+head+"</head><body></body></html>","text/html");
   const nodes=Array.from(parsed.head.querySelectorAll('title,meta[name="description"],meta[name="robots"],meta[property^="og:"],meta[name^="twitter:"],link[rel="canonical"]'));
   const sync=()=>{
    observer?.disconnect();
    for(const node of nodes){
     if(node.tagName==="TITLE"){if(document.title!==node.textContent)document.title=node.textContent||"";continue}
     const key=node.hasAttribute("name")?"name":node.hasAttribute("property")?"property":"rel";
     const value=node.getAttribute(key)||"";
     const matches=Array.from(document.head.querySelectorAll(node.tagName.toLowerCase()+"["+key+'="'+value+'"]'));
     const current=matches[0];
     if(!current)document.head.appendChild(node.cloneNode(true));
     else for(const attribute of Array.from(node.attributes))if(current.getAttribute(attribute.name)!==attribute.value)current.setAttribute(attribute.name,attribute.value);
     matches.slice(1).forEach(extra=>extra.remove());
    }
    observer?.observe(document.head,{childList:true,subtree:true,attributes:true,characterData:true});
   };
   observer=new MutationObserver(sync);sync();
  };
  const payload=document.getElementById("storefront-seo");
  try{
   const data=JSON.parse(payload?.textContent||"null");
   if(data?.path===pathname&&typeof data.head==="string"){apply(data.head);return()=>{stopped=true;observer?.disconnect();controller.abort()}}
  }catch{}
  fetch("/api/seo?path="+encodeURIComponent(pathname),{signal:controller.signal}).then(response=>response.ok?response.json():null).then(data=>{if(data?.head)apply(data.head)}).catch(()=>{});
  return()=>{stopped=true;observer?.disconnect();controller.abort()};
 },[pathname]);
 return null;
}
