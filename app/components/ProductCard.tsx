"use client";
import {useEffect,useRef,useState,type CSSProperties} from "react";
import {createPortal} from "react-dom";
import Link from "next/link";
import {stockLimit,productAvailable,type Product,type Variant} from "../catalog-types";
import {cachedStoreSettings,type StoreSettings} from "../storefront-types";
import {parseWatermark} from "../watermark-config";
import {productThumbnail} from "../image-utils";
import {toggleFavorite,useFavorites} from "../favorites-storage";

type WatermarkStyle=CSSProperties&{"--wm-size":string};
const cardChoiceLimit=5;
const productImage=(p:Product,v?:Variant)=>v?.image||v?.images?.[0]||p.image||p.images?.[0]||p.variants?.flatMap(item=>item.image?[item.image]:item.images||[]).find(Boolean);
const variantKind=(p:Product,v:Variant)=>v.displayType||(p.variantDisplay==="color"?"color":"text");
const variantPrice=(p:Product,v:Variant|undefined,wholesale:boolean)=>wholesale?(v?.wholesale??p.wholesale??v?.price??p.price):(v?.price??p.price);

function VariantPicker({p,wholesale,onClose,onConfirm}:{p:Product;wholesale:boolean;onClose:()=>void;onConfirm:(index:number,qty:number)=>void}){
  const [index,setIndex]=useState<number|null>(null),[qty,setQty]=useState(1),closeRef=useRef(onClose);closeRef.current=onClose;
  const choices=p.variants||[],variant=index===null?undefined:choices[index],price=variantPrice(p,variant,wholesale),image=productImage(p,variant),max=Math.max(1,stockLimit(p,variant)),label=p.variantName||"الخيار";
  useEffect(()=>{const root=document.documentElement,previous=root.style.overflow;root.style.overflow="hidden";const key=(event:KeyboardEvent)=>{if(event.key==="Escape")closeRef.current()};window.addEventListener("keydown",key);return()=>{root.style.overflow=previous;window.removeEventListener("keydown",key)}},[]);
  useEffect(()=>setQty(current=>Math.min(current,max)),[max]);
  return createPortal(<div className="variantPickerLayer" onClick={onClose}><div className="variantPickerSheet" role="dialog" aria-modal="true" aria-label={`اختر ${label}: ${p.name}`} onClick={event=>event.stopPropagation()}>
    <div className="variantPickerHead">{image?<img src={productThumbnail(image,180)} alt="" onError={event=>{if(image&&event.currentTarget.getAttribute("src")!==image)event.currentTarget.src=image}}/>:<i>▧</i>}<div><b>{p.name}</b><span>{price} ₪</span></div><button type="button" aria-label="إغلاق" onClick={onClose}>×</button></div>
    <h4>اختر {label}{variant&&<b>{variant.name}</b>}</h4>
    <div className="variantPickerChoices">{choices.map((v,i)=>{const color=variantKind(p,v)==="color";return <button type="button" key={v.id??i} disabled={stockLimit(p,v)<=0} aria-pressed={index===i} title={stockLimit(p,v)<=0?`${v.name} - نفدت الكمية`:v.name} className={`${color?"variantPickerColor":"variantPickerText"} ${index===i?"active":""}`} onClick={()=>setIndex(i)}>{color&&<i style={{background:v.color||"#ddd"}}/>}<span>{v.name}</span>{stockLimit(p,v)<=0&&<small className="variantSoldOutLabel">منتهي</small>}</button>})}</div>
    <div className="variantPickerQty"><span>الكمية</span><div><button type="button" aria-label="إنقاص الكمية" disabled={qty<=1} onClick={()=>setQty(qty-1)}>−</button><b>{qty}</b><button type="button" aria-label="زيادة الكمية" disabled={!variant||qty>=max} onClick={()=>setQty(qty+1)}>+</button></div></div>
    <button type="button" className="variantPickerAdd" disabled={!variant||stockLimit(p,variant)<=0} onClick={()=>index!==null&&onConfirm(index,qty)}>{variant?`أضف إلى السلة · ${Math.round(price*qty*100)/100} ₪`:`اختر ${label} أولاً`}</button>
  </div></div>,document.body);
}

export default function ProductCard({p,wholesale=false,watermark="",settings,onAdd}:{p:Product;wholesale?:boolean;watermark?:string;settings?:StoreSettings;onAdd?:(variant?:Variant,qty?:number)=>void}){
  const store=settings||cachedStoreSettings(),configured=parseWatermark(store.watermarkUrl||""),watermarkImage=(watermark?parseWatermark(watermark).base:configured.base)||store.logoUrl,watermarkOpacity=Math.min(100,Math.max(0,store.watermarkOpacity??25))/100;
  const watermarkEnabled=store.watermarkEnabled??configured.enabled,watermarkX=store.watermarkX??configured.x,watermarkY=store.watermarkY??configured.y,watermarkSize=store.watermarkSize??configured.size;
  const watermarkStyle:WatermarkStyle={opacity:watermarkOpacity,"--wm-size":`${watermarkSize}%`,left:`${watermarkX}%`,top:`${watermarkY}%`,right:"auto",bottom:"auto",transform:"translate(-50%,-50%)"};
  const favorite=useFavorites().includes(p.id);
  const [failedImages,setFailedImages]=useState<Record<string,boolean>>({});
  const [variantIndex,setVariantIndex]=useState<number|null>(null),[picking,setPicking]=useState(false),[added,setAdded]=useState(false);
  const variant=variantIndex===null?undefined:p.variants?.[variantIndex];
  const price=variantPrice(p,variant,wholesale);
  const variantPrices=(p.variants||[]).filter(item=>stockLimit(p,item)>0).map(item=>variantPrice(p,item,wholesale)),minPrice=variantPrices.length?Math.min(...variantPrices):price,maxPrice=variantPrices.length?Math.max(...variantPrices):price,priceLabel=variant?`${price} ₪`:minPrice===maxPrice?`${minPrice} ₪`:`${minPrice} ₪ - ${maxPrice} ₪`;
  const fallback=wholesale&&(variant?variant.wholesale==null:p.wholesale==null),image=productImage(p,variant),cardImage=failedImages[productThumbnail(image,384)]?image:productThumbnail(image,384);
  const choices=p.variants||[],hasVariants=choices.length>0,hasAvailableVariant=choices.some(item=>stockLimit(p,item)>0),showChoices=hasVariants&&choices.length<=cardChoiceLimit;
  const canAdd=hasVariants?hasAvailableVariant:productAvailable(p);
  const addLabel=added?"✓ تمت الإضافة":canAdd?"أضف إلى السلة":"نفدت الكمية";
  const confirmAdded=()=>{setAdded(true);window.setTimeout(()=>setAdded(false),1600)};
  const add=()=>{if(!onAdd||!canAdd)return;if(hasVariants&&!(variant&&stockLimit(p,variant)>0)){setPicking(true);return}onAdd(variant,1);confirmAdded()};
  const pick=(index:number,qty:number)=>{if(!choices[index]||stockLimit(p,choices[index])<=0)return;setVariantIndex(index);setPicking(false);onAdd?.(choices[index],qty);confirmAdded()};
  return <article className="product softProduct"><div className="productCategoryLabel">{p.subcategory||p.category}</div>
    <button type="button" aria-label={favorite?"إزالة من المفضلة":"إضافة للمفضلة"} aria-pressed={favorite} className={favorite?"favBtn active":"favBtn"} onClick={()=>toggleFavorite(p.id)}>♥</button>
    {!productAvailable(p)&&<span className="soldOutBadge">نفدت الكمية</span>}
    <Link className="productVisual portraitVisual containImage" style={{background:variant?.color||"#f5f2f3"}} href={`/product/${p.id}`}>{image?<img src={cardImage} alt={p.imageAlt||p.name} loading="lazy" decoding="async" fetchPriority="low" onError={event=>{const target=event.currentTarget;if(image&&target.getAttribute("src")!==image){setFailedImages(current=>({...current,[cardImage||""]:true}))}else{target.style.visibility="hidden";target.parentElement?.classList.add("imageUnavailable")}}}/>:<i>▧</i>}{watermarkEnabled&&watermarkImage&&<img className="logoWatermark wm-manual" src={watermarkImage} alt="" loading="lazy" decoding="async" style={watermarkStyle}/>}<small>#{p.itemNumber}</small></Link>
    <div className="productInfo">      <div className={"price "+(fallback?"retailFallback":"")}><b>{priceLabel}</b>{!wholesale&&p.oldPrice&&<del>{p.oldPrice} ₪</del>}</div>
<Link href={`/product/${p.id}`}><h3>{p.name}</h3></Link>
      {showChoices?<div className="cardVariantChoices">{choices.map((v,index)=>{const kind=variantKind(p,v);return <button type="button" disabled={stockLimit(p,v)<=0} aria-label={stockLimit(p,v)<=0?`${v.name} — منتهي`:v.name} aria-pressed={variantIndex===index} title={stockLimit(p,v)<=0?`${v.name} - نفدت الكمية`:v.name} key={v.id??index} className={`${kind==="color"?"variantColorChoice":"variantTextChoice"} ${variantIndex===index?"active":""}`} style={kind==="color"?{background:v.color||"#ddd"}:undefined} onClick={()=>setVariantIndex(index)}>{kind==="color"?<span>{v.name}</span>:v.name}{stockLimit(p,v)<=0&&<small className="variantSoldOutLabel">منتهي</small>}</button>})}</div>:hasVariants&&canAdd?<small className="cardVariantCount">{choices.filter(item=>stockLimit(p,item)>0).length} خيارات متوفرة</small>:null}
      {onAdd&&<button className={`cardAddButton ${added?"added":""}`} disabled={!canAdd} aria-label={canAdd?`إضافة ${p.name} للسلة`:`${p.name} غير متوفر`} onClick={add}>{addLabel}</button>}
    </div>
    {picking&&<VariantPicker p={p} wholesale={wholesale} onClose={()=>setPicking(false)} onConfirm={pick}/>}
  </article>;
}
