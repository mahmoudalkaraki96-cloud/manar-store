"use client";
import {useEffect,useState} from "react";
import type {Highlight} from "../storefront-types";

export default function StoreHighlights({highlights}:{highlights:Highlight[]}){
 const [open,setOpen]=useState<{highlight:number;image:number}|null>(null);
 const [touchX,setTouchX]=useState<number|null>(null);
 const current=open?highlights[open.highlight]:null;
 const close=()=>setOpen(null);
 const step=(direction:number)=>setOpen(position=>{
  if(!position)return null;
  const image=position.image+direction;
  if(image>=0&&image<highlights[position.highlight].images.length)return {...position,image};
  const highlight=position.highlight+direction;
  if(highlight<0||highlight>=highlights.length)return null;
  return {highlight,image:direction>0?0:highlights[highlight].images.length-1};
 });
 useEffect(()=>{
  if(!open)return;
  const onKey=(event:KeyboardEvent)=>{
   if(event.key==="Escape")close();
   if(event.key==="ArrowLeft")step(1);
   if(event.key==="ArrowRight")step(-1);
  };
  window.addEventListener("keydown",onKey);
  return()=>window.removeEventListener("keydown",onKey);
 },[open]);
 return <div className="storeHighlights">
  <div className="storeHighlightsTrack" role="list" aria-label="هايلايتس المتجر">
   {highlights.map((item,index)=><button key={item.id} type="button" role="listitem" className="storeHighlightItem" onClick={()=>setOpen({highlight:index,image:0})}>
    <span className="storeHighlightRing"><img src={item.coverUrl||item.images[0]} alt="" loading="eager" decoding="async"/></span>
    <span className="storeHighlightLabel">{item.title}</span>
   </button>)}
  </div>
  {current&&open&&<div className="highlightViewer" role="dialog" aria-modal="true" aria-label={current.title} onMouseDown={event=>{if(event.target===event.currentTarget)close()}}>
   <div className="highlightViewerCard" onTouchStart={event=>setTouchX(event.touches[0].clientX)} onTouchEnd={event=>{if(touchX==null)return;const delta=event.changedTouches[0].clientX-touchX;if(Math.abs(delta)>55)step(delta<0?1:-1);setTouchX(null)}}>
    <div className="highlightViewerProgress">{current.images.map((_,index)=><span key={index} className={index<=open.image?"active":""}/>)}</div>
    <div className="highlightViewerHead"><b>{current.title}</b><span>{current.imageNumbers?.[open.image]||""} · {open.image+1} / {current.images.length}</span><button type="button" aria-label="إغلاق" onClick={close}>×</button></div>
    <img className="highlightViewerImage" src={current.images[open.image]} alt={current.title}/>
    <button type="button" className="highlightViewerPrev" aria-label="الصورة السابقة" onClick={()=>step(-1)}>‹</button>
    <button type="button" className="highlightViewerNext" aria-label="الصورة التالية" onClick={()=>step(1)}>›</button>
   </div>
  </div>}
 </div>;
}
