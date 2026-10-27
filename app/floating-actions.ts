export type FloatingId="install"|"notifications";
export type FloatingPosition={x:number;y:number};
export type FloatingPreference={hidden:boolean;position?:FloatingPosition};
export type FloatingPreferences=Record<FloatingId,FloatingPreference>;
export const floatingKey="manar_floating_actions_v1",floatingEvent="manar:floating-actions";
export const emptyFloatingPreferences=():FloatingPreferences=>({install:{hidden:false},notifications:{hidden:false}});
const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value));
export function parseFloatingPreferences(raw:string|null):FloatingPreferences{
 const result=emptyFloatingPreferences();
 try{const saved=JSON.parse(raw||"null");for(const id of ["install","notifications"] as const){const item=saved?.[id];result[id].hidden=item?.hidden===true;const p=item?.position;if(typeof p?.x==="number"&&Number.isFinite(p.x)&&typeof p?.y==="number"&&Number.isFinite(p.y))result[id].position={x:clamp(p.x,0,1),y:clamp(p.y,0,1)}}}catch{}
 return result;
}
export function floatingPoint(position:FloatingPosition,width:number,height:number,boxWidth:number,boxHeight:number){
 const roomX=Math.max(0,width-boxWidth-16),roomY=Math.max(0,height-boxHeight-16);
 return {left:8+clamp(position.x,0,1)*roomX,top:8+clamp(position.y,0,1)*roomY};
}
export function floatingPosition(left:number,top:number,width:number,height:number,boxWidth:number,boxHeight:number):FloatingPosition{
 return {x:clamp((left-8)/Math.max(1,width-boxWidth-16),0,1),y:clamp((top-8)/Math.max(1,height-boxHeight-16),0,1)};
}
let fallback=emptyFloatingPreferences(),memoryOnly=false;
export function readFloatingPreferences(){if(memoryOnly)return fallback;try{return parseFloatingPreferences(localStorage.getItem(floatingKey))}catch{return fallback}}
export function updateFloatingPreference(id:FloatingId,next:FloatingPreference){
 const prefs=readFloatingPreferences();prefs[id]=next;fallback=prefs;
 try{localStorage.setItem(floatingKey,JSON.stringify(prefs))}catch{memoryOnly=true}
 window.dispatchEvent(new Event(floatingEvent));
}

// Ignore small tap jitter before treating pointer motion as a drag.
export function floatingGestureMoved(startX:number,startY:number,x:number,y:number){return Math.hypot(x-startX,y-startY)>=8}
