"use client";
import {useEffect,useState} from "react";
import {productThumbnail} from "../image-utils";

// 1.9.11: small product image for admin lists. Loads straight away (no lazy loading inside
// scrolling popups), falls back to the original image if the resized copy fails, and keeps a
// grey placeholder instead of a blank space when neither loads.
export default function AdminThumb({src,width=384,className}:{src?:string|null;width?:number;className?:string}){
 const thumb=src?productThumbnail(src,width):"";
 const [current,setCurrent]=useState(thumb),[failed,setFailed]=useState(!src);
 useEffect(()=>{setCurrent(thumb);setFailed(!src)},[thumb,src]);
 if(failed||!current)return <span className={"adminThumbEmpty"+(className?" "+className:"")} aria-hidden>▢</span>;
 return <img className={className} src={current} alt="" decoding="async" onError={()=>{if(src&&current!==src)setCurrent(src);else setFailed(true)}}/>;
}
