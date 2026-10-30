"use client";
import {useEffect,useState} from 'react';
import {defaultSettings,loadStorefront,type StoreSettings} from './storefront-types';
export function useStoreSettings(){
 const [settings,setSettings]=useState<StoreSettings>(defaultSettings);
 useEffect(()=>{let active=true;const update=(event:Event)=>setSettings((event as CustomEvent<StoreSettings>).detail);window.addEventListener('store-settings-updated',update);loadStorefront().then(data=>{if(active)setSettings(data.settings)}).catch(()=>{});return()=>{active=false;window.removeEventListener('store-settings-updated',update)}},[]);
 return settings;
}
