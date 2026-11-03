import {useSyncExternalStore} from "react";

// One favorites list for every page; the product page used to keep its own copy under "manar_favorites".
const changeEvent="manar:favorites",legacyKey="manar_favorites",none:number[]=[];
const storageKey=()=>`store:${window.location.hostname}:favorites`;
const parse=(raw:string|null)=>{try{const list=JSON.parse(raw||"[]");return Array.isArray(list)?[...new Set(list.map(Number).filter(Number.isFinite))]:[]}catch{return []}};
let cache:{raw:string|null;list:number[]}={raw:null,list:none},migrated=false;

export function loadFavorites():number[]{
 if(typeof window==="undefined")return none;
 let raw:string|null=null;
 try{
  raw=localStorage.getItem(storageKey());
  if(!migrated){migrated=true;const legacy=localStorage.getItem(legacyKey);if(legacy!==null){raw=JSON.stringify([...new Set([...parse(raw),...parse(legacy)])]);localStorage.setItem(storageKey(),raw);localStorage.removeItem(legacyKey)}}
 }catch{}
 if(raw!==cache.raw)cache={raw,list:parse(raw)};
 return cache.list;
}

export function saveFavorites(list:number[]){
 try{localStorage.setItem(storageKey(),JSON.stringify(list))}catch{}
 window.dispatchEvent(new CustomEvent(changeEvent));
}

export function toggleFavorite(id:number){
 const list=loadFavorites();
 saveFavorites(list.includes(id)?list.filter(value=>value!==id):[...list,id]);
}

const subscribe=(change:()=>void)=>{window.addEventListener(changeEvent,change);window.addEventListener("storage",change);return()=>{window.removeEventListener(changeEvent,change);window.removeEventListener("storage",change)}};
export const useFavorites=()=>useSyncExternalStore(subscribe,loadFavorites,()=>none);
export const openFavorites=()=>window.dispatchEvent(new CustomEvent("manar:open-favorites"));
