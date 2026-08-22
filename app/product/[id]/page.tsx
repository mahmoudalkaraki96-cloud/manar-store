"use client";
import {useEffect,useState} from "react";
import {useParams} from "next/navigation";
import {products,Product,Variant} from "../../catalog";
import StoreHeader from "../../components/StoreHeader";
export default function ProductPage(){const params=useParams<{id:string}>();const [catalog,setCatalog]=useState<Product[]>(products),[variant,setVariant]=useState<Variant>(),[wholesale,setWholesale]=useState(false),[qty,setQty]=useState(1),[favorite,setFavorite]=useState(false),[logo,setLogo]=useState(""),[zoom,setZoom]=useState("");
const p=catalog.find(x=>x.id===Number(params.id))||products.find(x=>x.id===Number(params.id))||products[0];
useEffect(()=>{try{const saved=localStorage.getItem("manar_products"),settings=JSON.parse(localStorage.getItem("manar_settings")||"{}"),fav=JSON.parse(localStorage.getItem("manar_favorites")||"[]");if(saved){const list=JSON.parse(saved);setCatalog(list.map((x:Product)=>({...x,image:x.image||products.find(y=>y.id===x.id)?.image,variantName:x.variantName||products.find(y=>y.id===x.id)?.variantName,variantDisplay:x.variantDisplay||products.find(y=>y.id===x.id)?.variantDisplay})))};setLogo(settings.logoImage||"");setFavorite(fav.includes(Number(params.id)))}catch{}},[params.id]);
useEffect(()=>{setVariant(p.variants?.[0])},[p.id]);
useEffect(()=>{document.title=(p.seoTitle||p.name)+" | Manar Store";let meta=document.querySelector('meta[name="description"]') as HTMLMetaElement|null;if(!meta){meta=document.createElement("meta");meta.name="description";document.head.appendChild(meta)}meta.content=p.seoDescription||p.description},[p.id,p.seoTitle,p.seoDescription,p.name,p.description]);
const price=wholesale?(variant?.wholesale??p.wholesale??variant?.price??p.price):(variant?.price??p.price),fallback=wholesale&&(variant?variant.wholesale==null:p.wholesale==null);
const fav=()=>{const list:number[]=JSON.parse(localStorage.getItem("manar_favorites")||"[]"),next=list.includes(p.id)?list.filter(x=>x!==p.id):[...list,p.id];localStorage.setItem("manar_favorites",JSON.stringify(next));setFavorite(next.includes(p.id))};
const add=()=>{const c=JSON.parse(localStorage.getItem("manar_cart")||"{}"),key=`${p.id}:${variant?.sku||"base"}`,line=c[key];c[key]={productId:p.id,variantSku:variant?.sku,variantName:variant?.name,qty:(line?.qty||0)+qty,price,image:variant?.image||p.image};localStorage.setItem("manar_cart",JSON.stringify(c))};
return <main><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify({"@context":"https://schema.org","@type":"Product",name:p.name,image:[p.image,...(p.images||[])].filter(Boolean),description:p.seoDescription||p.description,sku:variant?.sku||String(p.id),offers:{"@type":"Offer",price:String(price),priceCurrency:"ILS",availability:(variant?.stock??1)>0?"https://schema.org/InStock":"https://schema.org/OutOfStock"}})}}/>
<StoreHeader actions={<button className={wholesale?"mode active":"mode"} onClick={()=>setWholesale(v=>!v)}>حساب الجملة</button>}/>
<section className="productPage">
<div className="gallery">
<div className="mainImage containImage zoomable" onClick={()=>setZoom(variant?.image||p.image||"")} style={{background:variant?.color||p.color}}>{(variant?.image||p.image)?<img src={variant?.image||p.image} alt={p.imageAlt||p.name}/>:<i>{p.icon}</i>}{logo&&<img className="logoWatermark" src={logo} alt=""/>}
</div>{p.video&&<div className="productVideo">{p.video.includes("youtube")||p.video.includes("youtu.be")?<iframe src={p.video.replace("watch?v=","embed/")} title="فيديو المنتج" allowFullScreen/>:<video src={p.video} controls preload="metadata"/>}</div>}<div className="thumbs">{[p.image,...(p.images||[])].filter(Boolean).map((x,i)=>
<button key={i}>
<img src={x}/>
</button>)}</div>
</div>
<div className="details">
<small>{p.category} • #{p.id}</small>
<button className={favorite?"detailFav active":"detailFav"} onClick={fav}>♥</button>
<h1>{p.name}</h1>
<div className="stars">★★★★★ <span>{p.rating.toFixed(1)} • {p.orders} طلب</span>
</div>
<p>{p.description}</p>{p.variants&&p.variants.length>0&&<>
<label>{p.variantName||"الخيار"}: <b>{variant?.name}</b>
</label>
<div className="detailVariantChoices">{p.variants.map(v=>{const kind=v.displayType||(p.variantDisplay==="color"?"color":"text");return kind==="color"?<button key={v.sku} title={v.name} aria-label={v.name} className={`detailColorChoice ${variant?.sku===v.sku?"active":""}`} style={{background:v.color||"#ddd"}} onClick={()=>setVariant(v)}><span>{v.name}</span></button>:<button key={v.sku} className={`detailTextChoice ${variant?.sku===v.sku?"active":""}`} onClick={()=>setVariant(v)}>{v.name}</button>})}</div>
<div className="variantMeta">
<span>رقم الصنف: <b>{variant?.sku}</b>
</span>
<span>المتوفر: <b>{variant?.stock}</b>
</span>
</div>
</>}<div className={"bigPrice "+(fallback?"retailFallback":"")}>{price} ₪</div>
<div className="buyRow">
<input type="number" min="1" value={qty} onChange={e=>setQty(+e.target.value)}/>
<button className="mainBtn" onClick={add}>أضف إلى السلة</button>
</div>
<a className="waInquiry" href={"/policies/contact?product="+p.id}>☏ استفسر عبر واتساب</a>
<div className="deliveryBox">
<b>التوصيل والدفع</b>
<span>الدفع عند الاستلام أو إلكترونياً مع قيمة الطلب والتوصيل.</span>
</div>
</div>
</section>{zoom&&<div className="imageLightbox" onClick={()=>setZoom("")}><button>×</button><div><img src={zoom} alt={p.imageAlt||p.name}/>{logo&&<img className="logoWatermark" src={logo} alt=""/>}</div></div>}
</main>}
