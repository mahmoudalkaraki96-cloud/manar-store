"use client";
import {useEffect,useRef,useState} from "react";
import type {Highlight} from "../storefront-types";

export default function StoreHighlights({highlights,intervalMs=5000}:{highlights:Highlight[];intervalMs?:number}){
 const [open,setOpen]=useState<{highlight:number;image:number}|null>(null);
 const [touchX,setTouchX]=useState<number|null>(null);
 const [loadedKey,setLoadedKey]=useState("");
 const [visible,setVisible]=useState(true);
 const [paused,setPaused]=useState(false);
 const progressBarRef=useRef<HTMLElement|null>(null);
 const elapsedRef=useRef(0);
 const current=open?highlights[open.highlight]:null;
 const activeUrl=open&&current?current.images[open.image]:"";
 const duration=Math.min(20000,Math.max(2000,intervalMs));
 const resetClock=()=>{elapsedRef.current=0;if(progressBarRef.current)progressBarRef.current.style.width="0%";setLoadedKey("");setPaused(false)};
 const close=()=>setOpen(null);
 const select=(highlight:number,image:number)=>{resetClock();setOpen({highlight,image})};
 const step=(direction:number)=>{resetClock();setOpen(position=>{
  if(!position)return null;
  const image=position.image+direction;
  if(image>=0&&image<highlights[position.highlight].images.length)return {...position,image};
  const highlight=position.highlight+direction;
  if(highlight<0||highlight>=highlights.length)return null;
  return {highlight,image:direction>0?0:highlights[highlight].images.length-1};
 })};
 useEffect(()=>{
  if(!open)return;
  const onKey=(event:KeyboardEvent)=>{
   if(event.key==="Escape")close();
   if(event.key==="ArrowLeft")step(1);
   if(event.key==="ArrowRight")step(-1);
  };
  window.addEventListener("keydown",onKey);
  return()=>window.removeEventListener("keydown",onKey);
 },[open,highlights]);
 useEffect(()=>{
  const onVisibility=()=>setVisible(!document.hidden);
  document.addEventListener("visibilitychange",onVisibility);
  return()=>document.removeEventListener("visibilitychange",onVisibility);
 },[]);
 useEffect(()=>{
  if(!open||loadedKey!==activeUrl||!visible||paused)return;
  let frame=0,last=performance.now(),cancelled=false;
  const tick=(now:number)=>{
   if(cancelled)return;
   elapsedRef.current=Math.min(duration,elapsedRef.current+Math.max(0,now-last));
   last=now;
   if(progressBarRef.current)progressBarRef.current.style.width=(elapsedRef.current/duration*100)+"%";
   if(elapsedRef.current>=duration){step(1);return}
   frame=requestAnimationFrame(tick);
  };
  frame=requestAnimationFrame(tick);
  return()=>{cancelled=true;cancelAnimationFrame(frame)};
 },[open?.highlight,open?.image,activeUrl,loadedKey,visible,paused,duration]);
 useEffect(()=>{
  if(!open||!current)return;
  const next=current.images[open.image+1];
  if(next){const preload=new Image();preload.src=next}
 },[open?.highlight,open?.image,highlights]);
 return <div className="storeHighlights">
  <div className="storeHighlightsTrack" role="list" aria-label="هايلايتس المتجر">
   {highlights.map((item,index)=><button key={item.id} type="button" role="listitem" className="storeHighlightItem" onClick={()=>select(index,0)}>
    <span className="storeHighlightRing"><img src={item.coverUrl||item.images[0]} alt="" loading="eager" decoding="async"/></span>
    <span className="storeHighlightLabel">{item.title}</span>
   </button>)}
  </div>
  {current&&open&&<div className="highlightViewer" role="dialog" aria-modal="true" aria-label={current.title} onMouseDown={event=>{if(event.target===event.currentTarget)close()}}>
   <div className="highlightViewerCard" onTouchStart={event=>setTouchX(event.touches[0].clientX)} onTouchEnd={event=>{if(touchX==null)return;const delta=event.changedTouches[0].clientX-touchX;if(Math.abs(delta)>55)step(delta<0?1:-1);setTouchX(null)}}>
    <div className="highlightViewerProgress">{current.images.map((_,index)=><span key={index}><i ref={index===open.image?progressBarRef:null} style={{width:index<open.image?"100%":"0%"}}/></span>)}</div>
    <div className="highlightViewerHead"><b>{current.title}</b><span>{open.image+1} / {current.images.length}</span><button type="button" aria-label="إغلاق" onClick={close}>×</button></div>
    <button type="button" className="highlightViewerPhoto" onClick={()=>setPaused(value=>!value)} aria-label={paused?"استئناف العرض التلقائي":"إيقاف العرض التلقائي"}>
     <img key={open.highlight+"-"+open.image} className="highlightViewerImage" src={activeUrl} alt={current.title} onLoad={()=>setLoadedKey(activeUrl)}/>
     <span className="highlightViewerCode" dir="ltr">{current.imageNumbers?.[open.image]||""}</span>
     {paused&&<span className="highlightViewerPaused">⏸ متوقف · اضغط للاستئناف</span>}
    </button>
    <button type="button" className="highlightViewerPrev" aria-label="الصورة السابقة" onClick={()=>step(-1)}>‹</button>
    <button type="button" className="highlightViewerNext" aria-label="الصورة التالية" onClick={()=>step(1)}>›</button>
    <div className="highlightViewerThumbnails" aria-label="معاينة صور الهايلايت">{current.images.map((url,index)=><button type="button" key={url} className={index===open.image?"selected":""} onClick={()=>select(open.highlight,index)} aria-label={`الانتقال إلى الصورة ${current.imageNumbers?.[index]||index+1}`}><img src={url} alt="" loading="lazy"/><span dir="ltr">{current.imageNumbers?.[index]||""}</span></button>)}</div>
   </div>
  </div>}
 </div>;
}
