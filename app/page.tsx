"use client";
import {useEffect,useMemo,useState} from "react";
import {categoryData,products,Product,Variant} from "./catalog";
import ProductCard from "./components/ProductCard";
import StoreHeader from "./components/StoreHeader";
type Slide={id:number;image:string;mobileImage?:string;focus:"center"|"right"|"left";linkType:"product"|"category"|"offers"|"none";target:string;active:boolean};
type Settings={name:string;logo:string;logoImage:string;primary:string;accent:string;bg:string;whatsapp:string;facebook:string;instagram:string;tiktok:string;slider:boolean;sliderInterval:number;slides:Slide[];popup:boolean;offers:boolean;bests:boolean;ratings:boolean;categoryBlocks:boolean};
const defaultSlides:Slide[]=[{id:1,image:"https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1600&q=82",focus:"center",linkType:"category",target:"giveaways",active:true},{id:2,image:"https://images.unsplash.com/photo-1513883049090-d0b7439799bf?auto=format&fit=crop&w=1600&q=82",focus:"center",linkType:"category",target:"wrapping",active:true},{id:3,image:"https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=1600&q=82",focus:"center",linkType:"category",target:"gifts",active:true}];
const defaults:Settings={name:"Manar Store",logo:"MANAR",logoImage:"",primary:"#b85f7d",accent:"#d7a46d",bg:"#fff8fb",whatsapp:"",facebook:"",instagram:"",tiktok:"",slider:true,sliderInterval:4500,slides:defaultSlides,popup:true,offers:true,bests:true,ratings:true,categoryBlocks:true};
function Brand({s}:{s:Settings}){return <a className="brand" href="/">{s.logoImage?<img className="brandLogo" src={s.logoImage} alt={s.name}/>:<b>{s.logo}</b>}<small>{s.name}</small>
</a>}
type CartLine={productId:number;variantSku?:string;variantName?:string;qty:number;price:number;image?:string};
export default function Home(){
 const [settings,setSettings]=useState(defaults),[catalog,setCatalog]=useState<Product[]>(products),[slide,setSlide]=useState(0),[popup,setPopup]=useState(true),[wholesale,setWholesale]=useState(false),[cart,setCart]=useState<Record<string,CartLine>>({}),[cartOpen,setCartOpen]=useState(false),[favorites,setFavorites]=useState<number[]>([]),[favOpen,setFavOpen]=useState(false);
 useEffect(()=>{try{const s=localStorage.getItem("manar_settings"),p=localStorage.getItem("manar_products"),c=localStorage.getItem("manar_cart"),f=localStorage.getItem("manar_favorites");if(s)setSettings({...defaults,...JSON.parse(s)});if(p){const saved:Product[]=JSON.parse(p),merged=[...saved,...products.filter(x=>!saved.some(y=>y.id===x.id))];setCatalog(merged.map((x:Product)=>({...x,image:x.image||products.find(y=>y.id===x.id)?.image,variantName:x.variantName||products.find(y=>y.id===x.id)?.variantName,variantDisplay:x.variantDisplay||products.find(y=>y.id===x.id)?.variantDisplay})))};if(c){const parsed=JSON.parse(c);if(Object.values(parsed).every(v=>typeof v==="object"))setCart(parsed)}if(f)setFavorites(JSON.parse(f))}catch{}},[]);
 useEffect(()=>{localStorage.setItem("manar_cart",JSON.stringify(cart))},[cart]);useEffect(()=>{localStorage.setItem("manar_favorites",JSON.stringify(favorites))},[favorites]);
 const activeSlides=settings.slides.filter(x=>x.active&&x.image);
 useEffect(()=>{if(!settings.slider||activeSlides.length<2)return;const t=setInterval(()=>setSlide(x=>(x+1)%activeSlides.length),settings.sliderInterval);return()=>clearInterval(t)},[settings.slider,settings.sliderInterval,activeSlides.length]);
 useEffect(()=>{if(slide>=activeSlides.length)setSlide(0)},[slide,activeSlides.length]);
 const slideHref=(x:Slide)=>x.linkType==="product"?`/product/${x.target}`:x.linkType==="category"?`/category/${x.target}`:x.linkType==="offers"?"/category/offers":"";
 const count=Object.values(cart).reduce((a,b)=>a+b.qty,0),subtotal=Object.values(cart).reduce((n,line)=>n+line.price*line.qty,0);
 const add=(p:Product,v?:Variant)=>{const key=`${p.id}:${v?.sku||"base"}`,price=wholesale?(v?.wholesale??p.wholesale??v?.price??p.price):(v?.price??p.price);setCart(c=>({...c,[key]:{productId:p.id,variantSku:v?.sku,variantName:v?.name,qty:(c[key]?.qty||0)+1,price,image:v?.image||p.image}}))},toggleFav=(id:number)=>setFavorites(f=>f.includes(id)?f.filter(x=>x!==id):[...f,id]);
 const row=(title:string,list:Product[],slug?:string)=>
<section className="homeRow">{slug&&<div className="homeCategoryBanner"><span>{categoryData.find(c=>c.slug===slug)?.icon||"✦"}</span><div><small>مختارات من المتجر</small><h2>{title}</h2></div><a href={"/category/"+slug}>مشاهدة الكل ←</a></div>}
<div className={slug?"rowTitle compactTitle":"rowTitle"}>
<h2>{title}</h2>{slug&&<a href={"/category/"+slug}>مشاهدة الكل ←</a>}</div>
<div className="rowProducts">{list.slice(0,5).map(p=>
<ProductCard key={p.id} p={p} wholesale={wholesale} onAdd={v=>add(p,v)} favorite={favorites.includes(p.id)} onFavorite={()=>toggleFav(p.id)} watermark={settings.logoImage}/>)}</div>
</section>;
 return <main style={{"--green":settings.primary,"--gold":settings.accent,"--pageBg":settings.bg} as React.CSSProperties}>
  <div className="notice">التوصيل: الضفة 20 ₪ • القدس 30 ₪ • الداخل 70 ₪</div>
<StoreHeader actions={<button className={wholesale?"mode active":"mode"} onClick={()=>setWholesale(v=>!v)}>حساب الجملة</button>} onCart={()=>setCartOpen(true)} onFavorites={()=>setFavOpen(true)} cartCount={count} favoriteCount={favorites.length}/>
  {settings.slider&&activeSlides.length>0&&<section className="imageOnlySlider">
<button className="slideArrow right" onClick={()=>setSlide((slide-1+activeSlides.length)%activeSlides.length)}>›</button>
{slideHref(activeSlides[slide])?<a href={slideHref(activeSlides[slide])} aria-label="فتح عرض السلايدر"><picture>{activeSlides[slide].mobileImage&&<source media="(max-width: 720px)" srcSet={activeSlides[slide].mobileImage}/>}<img src={activeSlides[slide].image} alt="عرض المتجر" style={{objectPosition:activeSlides[slide].focus}} loading="eager"/></picture></a>:<picture>{activeSlides[slide].mobileImage&&<source media="(max-width: 720px)" srcSet={activeSlides[slide].mobileImage}/>}<img src={activeSlides[slide].image} alt="عرض المتجر" style={{objectPosition:activeSlides[slide].focus}} loading="eager"/></picture>}
<button className="slideArrow left" onClick={()=>setSlide((slide+1)%activeSlides.length)}>‹</button><div className="sliderDots">{activeSlides.map((_,i)=><button key={i} className={i===slide?"active":""} onClick={()=>setSlide(i)} aria-label={`السلايد ${i+1}`}/>)}</div>
</section>}
  {settings.offers&&row("عروض لا تفوّت",catalog.filter(p=>p.oldPrice),"offers")}{settings.bests&&row("الأكثر طلباً",[...catalog].sort((a,b)=>b.orders-a.orders))}{settings.ratings&&row("الأعلى تقييماً",[...catalog].sort((a,b)=>b.rating-a.rating))}{settings.categoryBlocks&&categoryData.filter(c=>c.slug!=="offers"&&catalog.some(p=>p.category===c.name)).map(c=>
<div key={c.slug}>{row(c.name,catalog.filter(p=>p.category===c.name),c.slug)}</div>)}
  <footer>
<div>
<Brand s={settings}/>
<p>تفاصيل ناعمة تجعل كل هدية ومناسبة أجمل.</p>
</div>
<div>
<b>خدمة العملاء</b>
<a href="/policies/shipping">التوصيل والدفع</a>
<a href="/policies/returns">الاستبدال والترجيع</a>
</div>
<div>
<b>تابعنا</b>
<div className="socials">
<a href={settings.facebook||"#"}>f</a>
<a href={settings.instagram||"#"}>◎</a>
<a href={settings.tiktok||"#"}>♪</a>
</div>
</div>
</footer>
  <a className="whatsapp" href={settings.whatsapp?"https://wa.me/"+settings.whatsapp:"/policies/contact"}>☏</a>{settings.popup&&popup&&<div className="promoPopup">
<button onClick={()=>setPopup(false)}>×</button>
<i>٪</i>
<h3>خصم 20% على توزيعات مختارة</h3>
<a className="mainBtn" href="/category/offers">شاهد العروض</a>
</div>}
  {cartOpen&&<div className="overlay cartOverlay" onMouseDown={()=>setCartOpen(false)}>
<aside className="cart" onMouseDown={e=>e.stopPropagation()}>
<div className="cartHead">
<h2>سلة المشتريات</h2>
<button onClick={()=>setCartOpen(false)}>×</button>
</div>
<div className="cartItems">{count===0?<div className="emptyCart">السلة فارغة</div>:Object.entries(cart).map(([key,line])=>{const p=catalog.find(x=>x.id===line.productId);return p&&<div className="cartItem" key={key}>
<img src={line.image||p.image}/>
<div>
<b>{p.name}</b>
{line.variantName&&<em>{line.variantName}</em>}<small>{line.price} ₪</small>
<span>
<button onClick={()=>setCart(c=>({...c,[key]:{...c[key],qty:Math.max(1,c[key].qty-1)}}))}>−</button>{line.qty}<button onClick={()=>setCart(c=>({...c,[key]:{...c[key],qty:c[key].qty+1}}))}>＋</button>
</span>
</div>
<button className="trash" onClick={()=>setCart(c=>{const n={...c};delete n[key];return n})}>حذف</button>
</div>})}</div>{count>0&&<div className="cartSummary">
<span>المجموع <b>{subtotal} ₪</b>
</span>
<span>التوصيل <b>يحدد حسب المنطقة</b>
</span>
<strong>إجمالي المنتجات <b>{subtotal} ₪</b>
</strong>
<button>إتمام الطلب</button>
</div>}</aside>
</div>}
  {favOpen&&<div className="overlay cartOverlay" onMouseDown={()=>setFavOpen(false)}>
<aside className="cart" onMouseDown={e=>e.stopPropagation()}>
<div className="cartHead">
<h2>المفضلة</h2>
<button onClick={()=>setFavOpen(false)}>×</button>
</div>
<div className="favList">{catalog.filter(p=>favorites.includes(p.id)).map(p=>
<div className="cartItem" key={p.id}>
<img src={p.image}/>
<div>
<a href={"/product/"+p.id}>
<b>{p.name}</b>
</a>
<small>{p.price} ₪</small>
</div>
<button className="trash" onClick={()=>toggleFav(p.id)}>إزالة</button>
</div>)}</div>
</aside>
</div>}
 </main>
}
