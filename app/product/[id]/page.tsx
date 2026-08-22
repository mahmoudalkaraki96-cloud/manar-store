"use client";
import {useEffect,useState} from "react";
import {useParams} from "next/navigation";
import {loadCatalog,type Product,type Variant} from "../../catalog-types";
import StoreHeader from "../../components/StoreHeader";

export default function ProductPage(){
 const params=useParams<{id:string}>(),[catalog,setCatalog]=useState<Product[]>([]),[variant,setVariant]=useState<Variant>(),[wholesale,setWholesale]=useState(false),[qty,setQty]=useState(1),[favorite,setFavorite]=useState(false),[zoom,setZoom]=useState(""),[loading,setLoading]=useState(true);
 useEffect(()=>{loadCatalog().then(data=>setCatalog(data.products)).finally(()=>setLoading(false));try{setFavorite((JSON.parse(localStorage.getItem("manar_favorites")||"[]") as number[]).includes(Number(params.id)))}catch{}},[params.id]);
 const product=catalog.find(item=>item.id===Number(params.id)||item.itemNumber===Number(params.id));
 useEffect(()=>{setVariant(product?.variants?.find(item=>item.stock>0)||product?.variants?.[0])},[product?.id]);
 if(loading)return <main><StoreHeader/><div className="storeState">جاري تحميل الصنف...</div></main>;
 if(!product)return <main><StoreHeader/><div className="emptyStore"><h1>الصنف غير موجود</h1><a href="/">العودة للمتجر</a></div></main>;
 const price=wholesale?(variant?.wholesale??product.wholesale??variant?.price??product.price):(variant?.price??product.price),fallback=wholesale&&(variant?variant.wholesale==null:product.wholesale==null);
 const available=variant?variant.stock>0:product.inStock;
 const fav=()=>{const list:number[]=JSON.parse(localStorage.getItem("manar_favorites")||"[]"),next=list.includes(product.id)?list.filter(id=>id!==product.id):[...list,product.id];localStorage.setItem("manar_favorites",JSON.stringify(next));setFavorite(next.includes(product.id))};
 const add=()=>{if(!available)return;const cart=JSON.parse(localStorage.getItem("manar_cart")||"{}"),key=`${product.id}:${variant?.id||"base"}`,line=cart[key];cart[key]={productId:product.id,variantId:variant?.id,variantSku:variant?.sku,variantName:variant?.name,qty:(line?.qty||0)+qty,price,image:variant?.image||product.image};localStorage.setItem("manar_cart",JSON.stringify(cart))};
 const selectedImage=variant?.image||product.image;
 return <main><StoreHeader/><section className="productPage">
  <div className="gallery"><div className="mainImage containImage zoomable" onClick={()=>selectedImage&&setZoom(selectedImage)} style={{background:variant?.color||"#f5f2f3"}}>{selectedImage?<img src={selectedImage} alt={product.name}/>:<i>▧</i>}</div>{product.video&&<div className="productVideo"><video src={product.video} controls preload="metadata"/></div>}<div className="thumbs">{(product.images||[]).map((url,index)=><button key={index} onClick={()=>setZoom(url)}><img src={url} alt=""/></button>)}</div></div>
  <div className="details"><small>{product.subcategory||product.category} • #{product.itemNumber}</small><button className={favorite?"detailFav active":"detailFav"} onClick={fav}>♥</button><h1>{product.name}</h1>{product.rating>0&&<div className="stars">★★★★★ <span>{product.rating.toFixed(1)}</span></div>}<p>{product.description}</p>
   {product.variants&&product.variants.length>0&&<><label>{product.variantName||"الخيار"}: <b>{variant?.name}</b></label><div className="detailVariantChoices">{product.variants.map(item=>item.displayType==="color"?<button key={item.sku} disabled={item.stock<=0} title={item.stock<=0?`${item.name} - نفدت الكمية`:item.name} aria-label={item.name} className={`detailColorChoice ${variant?.sku===item.sku?"active":""}`} style={{background:item.color||"#ddd"}} onClick={()=>setVariant(item)}><span>{item.name}</span></button>:<button key={item.sku} disabled={item.stock<=0} title={item.stock<=0?`${item.name} - نفدت الكمية`:item.name} className={`detailTextChoice ${variant?.sku===item.sku?"active":""}`} onClick={()=>setVariant(item)}>{item.name}</button>)}</div><div className="variantMeta"><span>رقم المتغير: <b>{variant?.sku}</b></span><span>المتوفر: <b>{variant?.stock}</b></span></div></>}
   <div className={`bigPrice ${fallback?"retailFallback":""}`}>{price} ₪</div><button className={wholesale?"mode active":"mode"} onClick={()=>setWholesale(value=>!value)}>حساب الجملة</button><div className="buyRow"><input type="number" min="1" value={qty} onChange={event=>setQty(Math.max(1,Number(event.target.value)))}/><button className="mainBtn" disabled={!available} onClick={add}>{available?"أضف إلى السلة":"نفدت الكمية"}</button></div>
  </div>
 </section>{zoom&&<div className="imageLightbox" onClick={()=>setZoom("")}><button>×</button><div><img src={zoom} alt={product.name}/></div></div>}</main>;
}
