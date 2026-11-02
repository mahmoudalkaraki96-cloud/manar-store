"use client";
import {useEffect,useRef,useState,type CSSProperties} from "react";
import type {Highlight} from "../storefront-types";

const isVideo=(url:string)=>/\.(mp4|webm)(?:\?|$)/i.test(url);
type ScrollStyle=CSSProperties&{"--highlight-scroll":string};
function HighlightLabel({title}:{title:string}){
 const box=useRef<HTMLSpanElement|null>(null),text=useRef<HTMLSpanElement|null>(null),[distance,setDistance]=useState(0);
 useEffect(()=>{const measure=()=>setDistance(Math.max(0,(text.current?.scrollWidth||0)-(box.current?.clientWidth||0)));measure();const observer=typeof ResizeObserver==="undefined"?null:new ResizeObserver(measure);if(box.current)observer?.observe(box.current);if(text.current)observer?.observe(text.current);return()=>observer?.disconnect()},[title]);
 return <span ref={box} className={"storeHighlightLabel"+(distance>0?" scrolling":"")}><span ref={text} style={{"--highlight-scroll":distance+"px"} as ScrollStyle}>{title.trim().toLowerCase()==="feedback"?"آراء الزبائن":title}</span></span>
}
export default function StoreHighlights({highlights,intervalMs=5000}:{highlights:Highlight[];intervalMs?:number}){
 const [open,setOpen]=useState<{highlight:number;image:number}|null>(null);
 const [touchX,setTouchX]=useState<number|null>(null);
 const [loadedKey,setLoadedKey]=useState("");
 const [visible,setVisible]=useState(true);
 const [paused,setPaused]=useState(false);
 const [soundOn,setSoundOn]=useState(false);
 const [playError,setPlayError]=useState(false);
 const videoRef=useRef<HTMLVideoElement|null>(null);
 const progressBarRef=useRef<HTMLElement|null>(null);
 const elapsedRef=useRef(0);
 const current=open?highlights[open.highlight]:null;
 useEffect(()=>{if(!current?.id)return;const key="manar_highlight_view_"+current.id,now=Date.now();try{const last=Number(localStorage.getItem(key)||0);if(now-last<30*60*1000)return}catch{}void fetch("/api/highlights/"+current.id+"/view",{method:"POST",credentials:"same-origin",keepalive:true}).then(response=>{if(response.ok)try{localStorage.setItem(key,String(now))}catch{}}).catch(()=>{})},[current?.id]);
 const activeUrl=open&&current?current.images[open.image]:"";
 const activeVideo=isVideo(activeUrl);
 const activeImageNumber=current&&open?Number(current.imageNumbers?.[open.image]?.split("-").pop()||0):0;
 useEffect(()=>{if(!current?.id||!activeImageNumber)return;const key="manar_highlight_image_view_"+current.id+"_"+activeImageNumber,now=Date.now();try{const last=Number(localStorage.getItem(key)||0);if(now-last<30*60*1000)return}catch{}void fetch("/api/highlights/"+current.id+"/images/"+activeImageNumber+"/view",{method:"POST",credentials:"same-origin",keepalive:true}).then(response=>{if(response.ok)try{localStorage.setItem(key,String(now))}catch{}}).catch(()=>{})},[current?.id,activeImageNumber]);
 const duration=Math.min(20000,Math.max(2000,intervalMs));
 const resetClock=()=>{elapsedRef.current=0;if(progressBarRef.current)progressBarRef.current.style.width="0%";setLoadedKey("");setPaused(false);setSoundOn(false);setPlayError(false)};
 const close=()=>{videoRef.current?.pause();setOpen(null)};
 const togglePlayback=()=>{if(activeVideo){const video=videoRef.current;if(!video)return;if(video.paused){void video.play().then(()=>{setPaused(false);setPlayError(false)}).catch(()=>setPlayError(true))}else{video.pause();setPaused(true)}}else setPaused(value=>!value)};
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
  if(!open||activeVideo||loadedKey!==activeUrl||!visible||paused)return;
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
 },[open?.highlight,open?.image,activeUrl,activeVideo,loadedKey,visible,paused,duration]);
 useEffect(()=>{if(!activeVideo||!videoRef.current)return;const video=videoRef.current;if(!visible||paused){video.pause();return}void video.play().then(()=>setPlayError(false)).catch(()=>setPlayError(true));},[activeUrl,activeVideo,visible,paused]);
 useEffect(()=>{
  if(!open||!current)return;
  const next=current.images[open.image+1];
  if(next&&!isVideo(next)){const preload=new Image();preload.src=next}
 },[open?.highlight,open?.image,highlights]);
 return <div className="storeHighlights">
  <div className="storeHighlightsTrack" role="list" aria-label="هايلايتس المتجر">
   {highlights.map((item,index)=><button key={item.id} type="button" role="listitem" className="storeHighlightItem" onClick={()=>select(index,0)}>
    <span className="storeHighlightRing">{((!isVideo(item.coverUrl)?item.coverUrl:"")||item.images.find(url=>!isVideo(url)))?<img src={item.coverUrl||item.images.find(url=>!isVideo(url))} alt="" loading="lazy" decoding="async" onError={event=>{event.currentTarget.style.display="none";event.currentTarget.parentElement?.classList.add("highlightImageUnavailable")}}/>:<span aria-hidden="true">▧</span>}</span>
    <HighlightLabel title={item.title}/>
   </button>)}
  </div>
  {current&&open&&<div className="highlightViewer" role="dialog" aria-modal="true" aria-label={current.title} onMouseDown={event=>{if(event.target===event.currentTarget)close()}}>
   <div className="highlightViewerCard" onTouchStart={event=>setTouchX(event.touches[0].clientX)} onTouchEnd={event=>{if(touchX==null)return;const delta=event.changedTouches[0].clientX-touchX;if(Math.abs(delta)>55)step(delta<0?1:-1);setTouchX(null)}}>
    <div className="highlightViewerProgress">{current.images.map((_,index)=><span key={index}><i ref={index===open.image?progressBarRef:null} style={{width:index<open.image?"100%":"0%"}}/></span>)}</div>
    <div className="highlightViewerHead"><b>{current.title}</b><span>{open.image+1} / {current.images.length}</span><button type="button" aria-label="إغلاق" onClick={close}>×</button></div>
    <button type="button" className="highlightViewerPhoto" onClick={togglePlayback} aria-label={paused?"استئناف العرض التلقائي":"إيقاف العرض التلقائي"}>
     {activeVideo?<video key={open.highlight+"-"+open.image} ref={videoRef} className="highlightViewerVideo" src={activeUrl} muted={!soundOn} playsInline preload="metadata" onTimeUpdate={event=>{const video=event.currentTarget;if(progressBarRef.current&&Number.isFinite(video.duration)&&video.duration>0)progressBarRef.current.style.width=(video.currentTime/video.duration*100)+"%"}} onEnded={()=>step(1)} onError={()=>setPlayError(true)}/>:<img key={open.highlight+"-"+open.image} className="highlightViewerImage" src={activeUrl} alt={current.title} onLoad={()=>setLoadedKey(activeUrl)}/>}
     <span className="highlightViewerCode" dir="ltr">{current.imageNumbers?.[open.image]||""}</span>
     {(paused||playError)&&<span className="highlightViewerPaused">{playError?"اضغط لتشغيل الفيديو":"⏸ متوقف · اضغط للاستئناف"}</span>}
    </button>
    {activeVideo&&<button type="button" className="highlightViewerSound" onClick={()=>setSoundOn(value=>!value)} aria-label={soundOn?"كتم الصوت":"تشغيل الصوت"}>{soundOn?"🔊":"🔇"}</button>}
    <button type="button" className="highlightViewerPrev" aria-label="الصورة السابقة" onClick={()=>step(-1)}>‹</button>
    <button type="button" className="highlightViewerNext" aria-label="الصورة التالية" onClick={()=>step(1)}>›</button>
    <div className="highlightViewerThumbnails" aria-label="معاينة صور الهايلايت">{current.images.map((url,index)=><button type="button" key={url} className={index===open.image?"selected":""} onClick={()=>select(open.highlight,index)} aria-label={`الانتقال إلى الصورة ${current.imageNumbers?.[index]||index+1}`}>{isVideo(url)?<span className="highlightVideoThumb">▶</span>:<img src={url} alt="" loading="lazy"/>}<span dir="ltr">{current.imageNumbers?.[index]||""}</span></button>)}</div>
   </div>
  </div>}
 </div>;
}
