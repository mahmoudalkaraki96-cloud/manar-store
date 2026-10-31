"use client";
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {norm,type Category} from '../catalog-types';
import {categoryLabel} from './product-filters';
export default function SearchableCategory({categories,value,onChange,label,disabled=false}:{categories:Category[];value:number|null;onChange:(id:number|null)=>void;label:string;disabled?:boolean}){
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[position,setPosition]=useState({top:0,left:0,width:300,height:320});
 const trigger=useRef<HTMLButtonElement>(null),popup=useRef<HTMLDivElement>(null);
 const place=()=>{const r=trigger.current?.getBoundingClientRect();if(!r)return;const v=window.visualViewport;const left=v?.offsetLeft||0,top=v?.offsetTop||0,right=left+(v?.width||window.innerWidth),bottom=top+(v?.height||window.innerHeight),width=Math.max(1,Math.min(360,right-left-24)),height=Math.max(1,Math.min(360,bottom-top-24)),below=bottom-r.bottom-12;const next={width,height,top:Math.max(top+12,Math.min(below>=Math.min(240,height)?r.bottom+6:r.top-height-6,bottom-height-12)),left:Math.max(left+12,Math.min(r.right-width,right-width-12))};setPosition(current=>Object.keys(next).every(key=>current[key as keyof typeof current]===next[key as keyof typeof next])?current:next)};
 const close=()=>{setOpen(false);trigger.current?.focus()};
 useEffect(()=>{
  if(!open)return;
  const outside=(e:PointerEvent)=>{if(!popup.current?.contains(e.target as Node)&&!trigger.current?.contains(e.target as Node))setOpen(false)};
  // iOS keyboard focus scrolls/resizes the viewport: re-anchor instead of dismissing.
  const reposition=()=>place();place();
  document.addEventListener('pointerdown',outside);window.addEventListener('resize',reposition);window.addEventListener('scroll',reposition,true);window.visualViewport?.addEventListener('resize',reposition);window.visualViewport?.addEventListener('scroll',reposition);
  return()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',reposition);window.removeEventListener('scroll',reposition,true);window.visualViewport?.removeEventListener('resize',reposition);window.visualViewport?.removeEventListener('scroll',reposition)};
 },[open]);
 const choose=(id:number|null)=>{onChange(id);close()};
 const results=categories.filter(c=>norm(categoryLabel(c.id,categories)).includes(norm(query.trim())));
 return <><button ref={trigger} type="button" className="categoryPickerTrigger" aria-label={label} aria-haspopup="dialog" aria-expanded={open} disabled={disabled} onClick={()=>{if(open){setOpen(false);return}place();setQuery('');setOpen(true)}}>{value==null?'بدون قسم':categoryLabel(value,categories)||'قسم غير موجود'} <span aria-hidden="true">⌄</span></button>{open&&createPortal(<div ref={popup} className="categoryPickerPopup" role="dialog" aria-label={label} style={{top:position.top,left:position.left,width:position.width,maxHeight:position.height}} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();close()}}}><div className="categoryPickerSearch"><input autoFocus aria-label={`بحث في ${label}`} placeholder="ابحث عن القسم..." value={query} onChange={e=>setQuery(e.target.value)}/><button type="button" aria-label="إغلاق بحث الأقسام" onClick={close}>×</button></div><div className="categoryPickerOptions" onScroll={e=>e.stopPropagation()}>{(!query.trim()||norm('بدون قسم').includes(norm(query)))&&<button type="button" aria-pressed={value===null} onClick={()=>choose(null)}>بدون قسم</button>}{results.map(c=><button type="button" key={c.id} aria-pressed={c.id===value} onClick={()=>choose(c.id)}>{categoryLabel(c.id,categories)}</button>)}{!results.length&&query.trim()&&!norm('بدون قسم').includes(norm(query))&&<p>لا يوجد قسم مطابق</p>}</div></div>,document.body)}</>;
}
