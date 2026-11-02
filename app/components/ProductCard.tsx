"use client";
import {useState,type CSSProperties} from "react";
import Link from "next/link";
import type {Product,Variant} from "../catalog-types";
import {cachedStoreSettings,type StoreSettings} from "../storefront-types";
import {parseWatermark} from "../watermark-config";
import {productThumbnail} from "../image-utils";

type WatermarkStyle=CSSProperties&{"--wm-size":string};

export default function ProductCard({p,wholesale=false,watermark="",settings,favorite=false,onFavorite,onAdd}:{p:Product;wholesale?:boolean;watermark?:string;settings?:StoreSettings;favorite?:boolean;onFavorite?:()=>void;onAdd?:(variant?:Variant)=>void}){
  const store=settings||cachedStoreSettings(),configured=parseWatermark(store.watermarkUrl||""),watermarkImage=(watermark?parseWatermark(watermark).base:configured.base)||store.logoUrl,watermarkOpacity=Math.min(100,Math.max(0,store.watermarkOpacity??25))/100;
  const watermarkEnabled=store.watermarkEnabled??configured.enabled,watermarkX=store.watermarkX??configured.x,watermarkY=store.watermarkY??configured.y,watermarkSize=store.watermarkSize??configured.size;
  const watermarkStyle:WatermarkStyle={opacity:watermarkOpacity,"--wm-size":`${watermarkSize}%`,left:`${watermarkX}%`,top:`${watermarkY}%`,right:"auto",bottom:"auto",transform:"translate(-50%,-50%)"};
  const [failedImages,setFailedImages]=useState<Record<string,boolean>>({});
  const [variantIndex,setVariantIndex]=useState<number|null>(null);
  const variant=variantIndex===null?undefined:p.variants?.[variantIndex];
  const price=wholesale?(variant?.wholesale??p.wholesale??variant?.price??p.price):(variant?.price??p.price);
  const variantPrices=(p.variants||[]).filter(item=>item.stock>0).map(item=>wholesale?(item.wholesale??p.wholesale??item.price??p.price):(item.price??p.price)),minPrice=variantPrices.length?Math.min(...variantPrices):price,maxPrice=variantPrices.length?Math.max(...variantPrices):price,priceLabel=variant?`${price} ₪`:minPrice===maxPrice?`${minPrice} ₪`:`${minPrice} ₪ - ${maxPrice} ₪`;
  const fallback=wholesale&&(variant?variant.wholesale==null:p.wholesale==null),image=variant?.image||p.image,cardImage=failedImages[productThumbnail(image,384)]?image:productThumbnail(image,384);
  const hasVariants=Boolean(p.variants?.length),hasAvailableVariant=(p.variants||[]).some(item=>item.stock>0);
  const available=hasVariants?Boolean(variant&&variant.stock>0):p.inStock;
  const addLabel=hasVariants&&!variant&&hasAvailableVariant?"اختر الخيار":available?"أضف إلى السلة":"نفدت الكمية";
  return <article className="product softProduct"><div className="productCategoryLabel">{p.subcategory||p.category}</div>
    {onFavorite&&<button aria-label="إضافة للمفضلة" className={favorite?"favBtn active":"favBtn"} onClick={onFavorite}>♥</button>}
    {!p.inStock&&<span className="soldOutBadge">نفدت الكمية</span>}
    <Link className="productVisual portraitVisual containImage" style={{background:variant?.color||"#f5f2f3"}} href={`/product/${p.id}`}>{image?<img src={cardImage} alt={p.imageAlt||p.name} loading="lazy" decoding="async" fetchPriority="low" onError={event=>{const target=event.currentTarget;if(image&&target.getAttribute("src")!==image){setFailedImages(current=>({...current,[cardImage||""]:true}))}else{target.style.visibility="hidden";target.parentElement?.classList.add("imageUnavailable")}}}/>:<i>▧</i>}{watermarkEnabled&&watermarkImage&&<img className="logoWatermark wm-manual" src={watermarkImage} alt="" loading="lazy" decoding="async" style={watermarkStyle}/>}<small>#{p.itemNumber}</small></Link>
    <div className="productInfo">      <div className={"price "+(fallback?"retailFallback":"")}><b>{priceLabel}</b>{!wholesale&&p.oldPrice&&<del>{p.oldPrice} ₪</del>}</div>
<Link href={`/product/${p.id}`}><h3>{p.name}</h3></Link>
      {p.variants?.length?<div className="cardVariantChoices">{p.variants.map((v,index)=>{const kind=v.displayType||(p.variantDisplay==="color"?"color":"text");return <button type="button" disabled={v.stock<=0} aria-label={v.name} aria-pressed={variantIndex===index} title={v.stock<=0?`${v.name} - نفدت الكمية`:v.name} key={v.id??index} className={`${kind==="color"?"variantColorChoice":"variantTextChoice"} ${variantIndex===index?"active":""}`} style={kind==="color"?{background:v.color||"#ddd"}:undefined} onClick={()=>setVariantIndex(index)}>{kind==="color"?<span>{v.name}</span>:v.name}</button>})}</div>:null}
      {onAdd&&<button className="cardAddButton" disabled={!available} aria-label={hasVariants&&!variant&&hasAvailableVariant?`اختر خيارًا لـ ${p.name}`:available?`إضافة ${p.name} للسلة`:`${p.name} غير متوفر`} onClick={()=>available&&onAdd(variant)}>{addLabel}</button>}
    </div>
  </article>;
}
