"use client";
import {useState,type CSSProperties} from "react";
import Link from "next/link";
import type {Product,Variant} from "../catalog-types";
import {cachedStoreSettings,type StoreSettings} from "../storefront-types";
import {parseWatermark} from "../watermark-config";

type WatermarkStyle=CSSProperties&{"--wm-size":string};

export default function ProductCard({p,wholesale=false,watermark="",settings,favorite=false,onFavorite,onAdd}:{p:Product;wholesale?:boolean;watermark?:string;settings?:StoreSettings;favorite?:boolean;onFavorite?:()=>void;onAdd?:(variant?:Variant)=>void}){
  const store=settings||cachedStoreSettings(),configured=parseWatermark(store.watermarkUrl||""),watermarkImage=(watermark?parseWatermark(watermark).base:configured.base)||store.logoUrl,watermarkOpacity=Math.min(100,Math.max(0,store.watermarkOpacity??25))/100;
  const watermarkStyle:WatermarkStyle={opacity:watermarkOpacity,"--wm-size":`${configured.size}%`,left:`${configured.x}%`,top:`${configured.y}%`,right:"auto",bottom:"auto",transform:"translate(-50%,-50%)"};
  const [variant,setVariant]=useState<Variant|undefined>(()=>p.variants?.find(item=>item.stock>0)||p.variants?.[0]);
  const price=wholesale?(variant?.wholesale??p.wholesale??variant?.price??p.price):(variant?.price??p.price);
  const variantPrices=(p.variants||[]).filter(item=>item.stock>0).map(item=>wholesale?(item.wholesale??p.wholesale??item.price??p.price):(item.price??p.price)),minPrice=variantPrices.length?Math.min(...variantPrices):price,maxPrice=variantPrices.length?Math.max(...variantPrices):price,priceLabel=minPrice===maxPrice?`${minPrice} ₪`:`${minPrice} ₪ - ${maxPrice} ₪`;
  const fallback=wholesale&&(variant?variant.wholesale==null:p.wholesale==null),image=variant?.image||p.image;
  const available=variant?variant.stock>0:p.inStock;
  return <article className="product softProduct">
    {onFavorite&&<button aria-label="إضافة للمفضلة" className={favorite?"favBtn active":"favBtn"} onClick={onFavorite}>♥</button>}
    {!p.inStock&&<span className="soldOutBadge">نفدت الكمية</span>}
    <Link className="productVisual portraitVisual containImage" style={{background:variant?.color||"#f5f2f3"}} href={`/product/${p.id}`}>{image?<img src={image} alt={p.imageAlt||p.name} loading="lazy" decoding="async"/>:<i>▧</i>}{configured.enabled&&watermarkImage&&<img className="logoWatermark wm-manual" src={watermarkImage} alt="" loading="lazy" decoding="async" style={watermarkStyle}/>}<small>#{p.itemNumber}</small></Link>
    <div className="productInfo"><small>{p.subcategory||p.category}</small><Link href={`/product/${p.id}`}><h3>{p.name}</h3></Link>
      {p.variants?.length?<div className="cardVariantChoices">{p.variants.slice(0,6).map(v=>{const kind=v.displayType||(p.variantDisplay==="color"?"color":"text");return <button type="button" disabled={v.stock<=0} aria-label={v.name} title={v.stock<=0?`${v.name} - نفدت الكمية`:v.name} key={v.sku} className={`${kind==="color"?"variantColorChoice":"variantTextChoice"} ${variant?.sku===v.sku?"active":""}`} style={kind==="color"?{background:v.color||"#ddd"}:undefined} onClick={()=>setVariant(v)}>{kind==="color"?<span>{v.name}</span>:v.name}</button>})}{p.variants.length>6&&<small>+{p.variants.length-6}</small>}</div>:null}
      <div className={"price "+(fallback?"retailFallback":"")}><b>{priceLabel}</b>{!wholesale&&p.oldPrice&&<del>{p.oldPrice} ₪</del>}</div>
      {onAdd&&<button className="cardAddButton" disabled={!available} aria-label={available?`إضافة ${p.name} للسلة`:`${p.name} غير متوفر`} onClick={()=>available&&onAdd(variant)}>{available?"أضف إلى السلة":"نفدت الكمية"}</button>}
    </div>
  </article>;
}
