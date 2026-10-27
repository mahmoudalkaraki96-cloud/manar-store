"use client";
import {useEffect,useRef,useState,type ReactNode} from "react";
import {emptyFloatingPreferences,floatingEvent,floatingKey,floatingPoint,floatingPosition,readFloatingPreferences,updateFloatingPreference,type FloatingId,type FloatingPosition} from "../floating-actions";

export function useFloatingPreferences(){
 const [prefs,setPrefs]=useState(emptyFloatingPreferences),[ready,setReady]=useState(false);
 useEffect(()=>{const refresh=()=>{setPrefs(readFloatingPreferences());setReady(true)};const storage=(event:StorageEvent)=>{if(event.key===floatingKey||event.key===null)refresh()};refresh();window.addEventListener(floatingEvent,refresh);window.addEventListener("storage",storage);return()=>{window.removeEventListener(floatingEvent,refresh);window.removeEventListener("storage",storage)}},[]);
 return {prefs,ready};
}
export default function FloatingAction({id,label,bottom,children}:{id:FloatingId;label:string;bottom:number;children:ReactNode}){
 const {prefs,ready}=useFloatingPreferences(),ref=useRef<HTMLDivElement>(null),drag=useRef<{pointer:number;startX:number;startY:number;left:number;top:number}|null>(null),[moving,setMoving]=useState<FloatingPosition|null>(null),[dimensions,setDimensions]=useState({width:0,height:0,boxWidth:0,boxHeight:0});
 const hidden=prefs[id].hidden;
 useEffect(()=>{if(!ready||hidden)return;const measure=()=>{const box=ref.current?.getBoundingClientRect();if(box)setDimensions({width:document.documentElement.clientWidth,height:window.innerHeight,boxWidth:box.width,boxHeight:box.height})};measure();const observer=new ResizeObserver(measure);if(ref.current)observer.observe(ref.current);window.addEventListener("resize",measure);return()=>{observer.disconnect();window.removeEventListener("resize",measure)}},[ready,hidden]);
 if(!ready||hidden)return null;
 const position=moving||prefs[id].position,point=position&&dimensions.width?floatingPoint(position,dimensions.width,dimensions.height,dimensions.boxWidth,dimensions.boxHeight):null;
 const fromPoint=(left:number,top:number)=>floatingPosition(left,top,dimensions.width,dimensions.height,dimensions.boxWidth,dimensions.boxHeight);
 return <div ref={ref} className={`visitorFloatingAction ${moving?"isMoving":""}`} data-floating-action={id} style={point?{left:point.left,top:point.top}:{right:14,bottom:`calc(${bottom}px + env(safe-area-inset-bottom,0px))`}}>
  <div className="visitorFloatingPrimary">{children}</div>
  <div className="visitorFloatingTools">
   <button type="button" className="visitorFloatingMove" aria-label={`تحريك زر ${label}`} title="اسحب لتغيير الموقع، أو استخدم أسهم لوحة المفاتيح" onPointerDown={event=>{if(event.button!==0)return;const box=ref.current!.getBoundingClientRect();drag.current={pointer:event.pointerId,startX:event.clientX,startY:event.clientY,left:box.left,top:box.top};event.currentTarget.setPointerCapture(event.pointerId)}} onPointerMove={event=>{const start=drag.current;if(start&&start.pointer===event.pointerId)setMoving(fromPoint(start.left+event.clientX-start.startX,start.top+event.clientY-start.startY))}} onPointerUp={event=>{if(drag.current?.pointer!==event.pointerId)return;if(moving)updateFloatingPreference(id,{...prefs[id],position:moving});drag.current=null;setMoving(null);if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId)}} onPointerCancel={()=>{drag.current=null;setMoving(null)}} onKeyDown={event=>{if(event.key==="Home"){event.preventDefault();updateFloatingPreference(id,{hidden:false});return}const offsets:Record<string,[number,number]>={ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]};const step=offsets[event.key];if(!step)return;event.preventDefault();const box=ref.current!.getBoundingClientRect();updateFloatingPreference(id,{...prefs[id],position:fromPoint(box.left+step[0],box.top+step[1])})}}><span aria-hidden="true">⠿</span></button>
   <button type="button" className="visitorFloatingHide" aria-label={`إخفاء زر ${label}`} title="إخفاء الزر؛ يمكنك إظهاره من أزرار الشاشة أعلى المتجر" onClick={()=>updateFloatingPreference(id,{...prefs[id],hidden:true})}>×</button>
  </div>
 </div>;
}

export function FloatingActionsMenu(){
 const {prefs}=useFloatingPreferences(),dialog=useRef<HTMLDialogElement>(null);
 return <><button className="floatingActionsMenuButton" type="button" title="أزرار الشاشة" aria-label="إعدادات أزرار الشاشة" onClick={()=>dialog.current?.showModal()}><span aria-hidden="true">⚙</span><small>أزرار الشاشة</small></button><dialog className="floatingActionsDialog" ref={dialog} aria-labelledby="floatingActionsTitle" onClick={event=>{if(event.target===event.currentTarget)dialog.current?.close()}}><div className="floatingActionsDialogHead"><h2 id="floatingActionsTitle">أزرار الشاشة</h2><button type="button" aria-label="إغلاق إعدادات أزرار الشاشة" onClick={()=>dialog.current?.close()}>×</button></div><p>اسحب مقبض الزر لتغيير مكانه. اختياراتك تُحفظ على هذا الجهاز.</p>{([{id:"install",label:"تثبيت التطبيق"},{id:"notifications",label:"الإشعارات"}] as const).map(item=><section key={item.id}><label><input type="checkbox" checked={!prefs[item.id].hidden} onChange={event=>updateFloatingPreference(item.id,{...prefs[item.id],hidden:!event.target.checked})}/><span>إظهار زر {item.label}</span></label><button type="button" onClick={()=>updateFloatingPreference(item.id,{hidden:false})}>إرجاع لمكانه الأصلي</button></section>)}<small>زر تثبيت التطبيق يظهر عندما يكون التثبيت متاحًا في متصفحك. إخفاء زر الإشعارات لا يوقف اشتراكك.</small></dialog></>;
}
