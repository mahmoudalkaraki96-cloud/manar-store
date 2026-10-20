"use client";
import {useState} from 'react';
import {productThumbnail} from '../image-utils';
export default function ProductImagePreview({url,name}:{url:string;name:string}){
 const [open,setOpen]=useState(false);
 return <span className="productImagePreview"><button type="button" className="productImageTrigger" aria-label={`تكبير صورة ${name}`} aria-expanded={open} onMouseEnter={()=>setOpen(true)} onMouseLeave={()=>setOpen(false)} onFocus={()=>setOpen(true)} onBlur={()=>setOpen(false)} onClick={()=>setOpen(value=>!value)} onKeyDown={e=>{if(e.key==='Escape')setOpen(false)}}><img className="tableImage" src={productThumbnail(url,480)} alt={name} loading="lazy" decoding="async"/></button>{open&&<span className="productImageZoom" role="tooltip"><img src={url} alt={name}/><b>{name}</b></span>}</span>;
}
