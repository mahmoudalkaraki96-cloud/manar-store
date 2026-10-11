"use client";
import {useEffect,useState} from 'react';
export type AdminTheme='light'|'dark'|'auto';
export function useAdminTheme(){const [choice,setChoice]=useState<AdminTheme>('auto'),[dark,setDark]=useState(false),[ready,setReady]=useState(false);useEffect(()=>{try{const saved=localStorage.getItem('manar-admin-theme');if(saved==='light'||saved==='dark'||saved==='auto')setChoice(saved);}catch{}setReady(true);},[]);useEffect(()=>{const media=window.matchMedia('(prefers-color-scheme: dark)'),sync=()=>setDark(choice==='dark'||choice==='auto'&&media.matches);sync();media.addEventListener('change',sync);if(ready)try{localStorage.setItem('manar-admin-theme',choice);}catch{}return()=>media.removeEventListener('change',sync);},[choice,ready]);return {choice,setChoice,dark};}
