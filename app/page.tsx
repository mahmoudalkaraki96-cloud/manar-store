"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import StoreHeader from "./components/StoreHeader";
import CategoryCards from "./components/CategoryCards";
import ProductCard from "./components/ProductCard";
import StoreSlider from "./components/StoreSlider";
import StoreFooter from "./components/StoreFooter";
import OfferPopup from "./components/OfferPopup";
import {loadCatalog,type CatalogResponse,type Product,type Variant,type Category} from "./catalog-types";
import {defaultSettings,loadStorefront,type StorefrontResponse} from "./storefront-types";
import {addCartItem,loadCart,type CartLine} from "./cart-storage";
import {productThumbnail} from "./image-utils";
const storageKey=(name:string)=>`store:${typeof window!=="undefined"?window.location.hostname:"local"}:${name}`;
export default function Home(){
 const [data,setData]=useState<CatalogResponse>({categories:[],products:[]}),[store,setStore]=useState<StorefrontResponse>({settings:defaultSettings,sliders:[],popup:null,highlightsEnabled:false,highlights:[],highlightsIntervalMs:5000}),[loading,setLoading]=useState(true),[error,setError]=useState(""),[wholesale]=useState(false),[cart,setCart]=useState<Record<string,CartLine>>({}),[favorites,setFavorites]=useState<number[]>([]),[favOpen,setFavOpen]=useState(false);
 useEffect(()=>{let saved:Record<string,CartLine>={};try{saved=loadCart();setCart(saved);setFavorites(JSON.parse(localStorage.getItem(storageKey("favorites"))||"[]"));}catch{}Promise.all([loadCatalog(),loadStorefront()]).then(([catalog,storefront])=>{setData(catalog);setStore(storefront);setCart(loadCart())}).catch(()=>setError("تعذر تحميل المتجر حالياً")).finally(()=>setLoading(false))},[]);
 useEffect(()=>{const refresh=(event:Event)=>setCart((event as CustomEvent<Record<string,CartLine>>).detail||loadCart());window.addEventListener("manar:cart",refresh);return()=>window.removeEventListener("manar:cart",refresh)},[]);
 useEffect(()=>{localStorage.setItem(storageKey("favorites"),JSON.stringify(favorites))},[favorites]);
 const overlayOpen=favOpen; useEffect(()=>{
  if(!overlayOpen)return;
  const body=document.body,root=document.documentElement,scrollY=window.scrollY;
  const previous={position:body.style.position,top:body.style.top,left:body.style.left,right:body.style.right,width:body.style.width,overflow:body.style.overflow,rootOverflow:root.style.overflow,scrollBehavior:root.style.scrollBehavior};
  // A fixed body also locks the background on mobile Safari.
  Object.assign(body.style,{position:"fixed",top:`-${scrollY}px`,left:"0",right:"0",width:"100%",overflow:"hidden"});
  root.style.overflow="hidden";
  return()=>{
   Object.assign(body.style,{position:previous.position,top:previous.top,left:previous.left,right:previous.right,width:previous.width,overflow:previous.overflow});
   root.style.overflow=previous.rootOverflow;
   root.style.scrollBehavior="auto";
   window.scrollTo(0,scrollY);
   root.style.scrollBehavior=previous.scrollBehavior;
  };
 },[overlayOpen]);

 const count=Object.values(cart).reduce((sum,line)=>sum+line.qty,0),subtotal=Object.values(cart).reduce((sum,line)=>sum+line.price*line.qty,0),roots=data.categories.filter(category=>category.parentId==null);
 const categoryTreeIds=(rootId:number)=>{const ids=new Set<number>([rootId]);let added=true;while(added){added=false;for(const category of data.categories)if(category.parentId!=null&&ids.has(category.parentId)&&!ids.has(category.id)){ids.add(category.id);added=true}}return ids};
 const add=(product:Product,variant?:Variant,qty=1)=>setCart(addCartItem(product,variant,qty));
 const toggleFav=(id:number)=>setFavorites(current=>current.includes(id)?current.filter(value=>value!==id):[...current,id]);
 const row=(title:string,list:Product[],href?:string,bannerUrl?:string,iconUrl?:string,showWhenEmpty=false,subcategories:Category[]=[])=>{if(!list.length&&!showWhenEmpty&&!subcategories.length)return null;const limit=store.settings.homeProductsLimit||6;return <section className="homeRow"><div className="homeCategoryBanner vibrantBanner" style={bannerUrl?{backgroundImage:`linear-gradient(90deg,color-mix(in srgb,var(--green) 88%,transparent),color-mix(in srgb,var(--gold) 72%,transparent)),url(${bannerUrl})`}:undefined}>{iconUrl?<img className="categoryBannerIcon" src={iconUrl} alt=""/>:<span>{title==="العروض"?"%":title==="الأكثر طلباً"?"★":title==="الأعلى تقييماً"?"✦":title==="مضاف حديثاً"?"＋":title==="منتجات مميزة"?"★":"▦"}</span>}<div><small>{href?.startsWith("/category/")?"مختارات من القسم":"مختارات مميزة لك"}</small><h2>{title}</h2></div>{href&&<Link href={href}>عرض الكل ←</Link>}</div><CategoryCards categories={subcategories}/>{list.length>0&&<div className="rowProducts">{list.slice(0,limit).map(product=><ProductCard key={product.id} p={product} wholesale={wholesale} settings={store.settings} onAdd={(variant,qty)=>add(product,variant,qty)} favorite={favorites.includes(product.id)} onFavorite={()=>toggleFav(product.id)}/>)}</div>}</section>};
 return <main style={{background:store.settings.backgroundColor,"--green":store.settings.primaryColor,"--gold":store.settings.secondaryColor} as React.CSSProperties}><StoreHeader categories={data.categories} products={data.products} settings={store.settings} onCart={()=>window.dispatchEvent(new CustomEvent("manar:open-cart"))} onFavorites={()=>setFavOpen(true)} cartCount={count} favoriteCount={favorites.length}/><StoreSlider settings={store.settings} slides={store.sliders} products={data.products} categories={data.categories}/><OfferPopup settings={store.settings} popup={store.popup}/>
 {loading?<div className="storeState">جاري تحميل المنتجات...</div>:error?<div className="storeState error">{error}</div>:data.products.length===0&&roots.length===0?<section className="emptyStore"><span>▧</span><h1>المتجر قيد التجهيز</h1></section>:<>{store.settings.showOffers&&row("العروض",data.products.filter(product=>product.oldPrice),"/products/offers")}{store.settings.showFeatured&&row("منتجات مميزة",data.products.filter(product=>product.featured),"/products/featured")}{store.settings.showNewest&&row("مضاف حديثاً",[...data.products].sort((a,b)=>b.createdAt-a.createdAt),"/products/newest")}{store.settings.showMostOrdered&&row("الأكثر طلباً",data.products.filter(product=>product.orders>0).sort((a,b)=>b.orders-a.orders),"/products/most-ordered")}{store.settings.showTopRated&&row("الأعلى تقييماً",data.products.filter(product=>product.ratingCount>0).sort((a,b)=>b.rating-a.rating),"/products/top-rated")}{roots.map(category=>{const ids=categoryTreeIds(category.id);return <div key={category.id}>{row(category.name,data.products.filter(product=>product.categoryId!=null&&ids.has(product.categoryId)),`/category/${category.slug}`,category.bannerUrl,category.iconUrl,false,data.categories.filter(child=>child.parentId===category.id))}</div>})}</>}
 <StoreFooter settings={store.settings}/>
 {favOpen&&<div className="overlay cartOverlay" onMouseDown={()=>setFavOpen(false)}><aside className="cart" onMouseDown={event=>event.stopPropagation()}><div className="cartHead"><h2>المفضلة</h2><button onClick={()=>setFavOpen(false)}>×</button></div><div className="favList">{data.products.filter(product=>favorites.includes(product.id)).map(product=><div className="cartItem" key={product.id}>{product.image&&<img src={productThumbnail(product.image,240)} alt="" loading="lazy" decoding="async"/>}<div><Link href={`/product/${product.id}`}><b>{product.name}</b></Link><small>{product.price} ₪</small></div><button className="trash" onClick={()=>toggleFav(product.id)}>إزالة</button></div>)}</div></aside></div>}
 </main>;
}


