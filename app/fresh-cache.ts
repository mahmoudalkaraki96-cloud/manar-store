"use client";
import {useEffect,useState} from "react";
import {STORE_DATA_EVENT} from "./catalog-types";
export {STORE_DATA_EVENT,STORE_DATA_MAX_AGE_MS,freshCache} from "./catalog-types";

/** Changes whenever store data was updated in the background; add it to an effect's dependencies to reload. */
export function useStoreDataVersion(){
 const [version,setVersion]=useState(0);
 useEffect(()=>{const bump=()=>setVersion(value=>value+1);window.addEventListener(STORE_DATA_EVENT,bump);return()=>window.removeEventListener(STORE_DATA_EVENT,bump)},[]);
 return version;
}
