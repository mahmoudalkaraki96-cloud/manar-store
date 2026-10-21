"use client";
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {norm,type Category} from '../catalog-types';
import {categoryLabel} from './product-filters';
export default function SearchableCategory({categories,value,onChange,label,disabled=false}:{categories:Category[];value:number|null;onChange:(id:number|null)=>void;label:string;disabled?:boolean}){
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[position,setPosition]=useState({top:0,left:0,width:300,height:320});
 const trigger=useRef<HTMLButtonElement>(null),popup=useRef<HTMLDivElement>(null);
 const close=()=>{setOpen(false);trigger.current?.focus()};
 useEffect(()=>{
  if(!open)return;
  const outside=(e:PointerEvent)=>{if(!popup.current?.contains(e.target as Node)&&!trigger.current?.contains(e.target as Node))setOpen(false)};
  const dismiss=(e:Event)=>{if(!popup.current?.contains(e.target as Node))setOpen(false)};
  document.addEventListener('pointerdown',outside);window.addEventListener('resize',dismiss);window.addEventListener('scroll',dismiss,true);
  return()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',dismiss);window.removeEventListener('scroll',dismiss,true)};
 },[open]);
 const choose=(id:number|null)=>{onChange(id);close()};
 const results=categories.filter(c=>norm(categoryLabel(c.id,categories)).includes(norm(query.trim())));
 return <><button ref={trigger} type="button" className="categoryPickerTrigger" aria-label={label} aria-haspopup="dialog" aria-expanded={open} disabled={disabled} onClick={()=>{if(open){setOpen(false);return}const r=trigger.current!.getBoundingClientRect(),width=Math.min(360,window.innerWidth-24),below=window.innerHeight-r.bottom-12,above=r.top-12,height=Math.min(360,Math.max(below,above));setPosition({width,height,top:below>=Math.min(240,height)?r.bottom+6:Math.max(8,r.top-height-6),left:Math.max(12,Math.min(r.right-width,window.innerWidth-width-12))});setQuery('');setOpen(true)}}>{value==null?'بدون قسم':categoryLabel(value,categories)||'قسم غير موجود'} <span aria-hidden="true">⌄</span></button>{open&&createPortal(<div ref={popup} className="categoryPickerPopup" role="dialog" aria-label={label} style={{top:position.top,left:position.left,width:position.width,maxHeight:position.height}} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();close()}}}><div className="categoryPickerSearch"><input autoFocus aria-label={`بحث في ${label}`} placeholder="ابحث عن القسم..." value={query} onChange={e=>setQuery(e.target.value)}/><button type="button" aria-label="إغلاق بحث الأقسام" onClick={close}>×</button></div><div className="categoryPickerOptions" onScroll={e=>e.stopPropagation()}>{(!query.trim()||norm('بدون قسم').includes(norm(query)))&&<button type="button" aria-pressed={value===null} onClick={()=>choose(null)}>بدون قسم</button>}{results.map(c=><button type="button" key={c.id} aria-pressed={c.id===value} onClick={()=>choose(c.id)}>{categoryLabel(c.id,categories)}</button>)}{!results.length&&query.trim()&&!norm('بدون قسم').includes(norm(query))&&<p>لا يوجد قسم مطابق</p>}</div></div>,document.body)}</>;
}
