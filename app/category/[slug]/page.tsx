"use client";
import {useEffect,useMemo,useState} from "react";
import {useParams,useSearchParams} from "next/navigation";
import {categoryData,products,Product,Variant} from "../../catalog";
import StoreHeader from "../../components/StoreHeader";
import ProductCard from "../../components/ProductCard";

export default function CategoryPage(){
 const params=useParams<{slug:string}>(),searchParams=useSearchParams(),cat=categoryData.find(c=>c.slug===params.slug)||categoryData[0],sub=searchParams.get("sub")||"";
 const [sort,setSort]=useState("featured"),[term,setTerm]=useState(""),[price,setPrice]=useState("all"),[stock,setStock]=useState("all"),[option,setOption]=useState("all"),[catalog,setCatalog]=useState<Product[]>(products),[logo,setLogo]=useState("");
 useEffect(()=>{try{const x=localStorage.getItem("manar_products"),s=JSON.parse(localStorage.getItem("manar_settings")||"{}");setLogo(s.logoImage||"");if(x){const saved:Product[]=JSON.parse(x),list=[...saved,...products.filter(p=>!saved.some(y=>y.id===p.id))];setCatalog(list.map((p:Product)=>({...p,image:p.image||products.find(y=>y.id===p.id)?.image,subcategory:p.subcategory||products.find(y=>y.id===p.id)?.subcategory,variantName:p.variantName||products.find(y=>y.id===p.id)?.variantName,variantDisplay:p.variantDisplay||products.find(y=>y.id===p.id)?.variantDisplay})))}}catch{}},[]);
 const options=useMemo(()=>Array.from(new Set(catalog.filter(p=>p.category===cat.name).flatMap(p=>(p.variants||[]).map(v=>v.name)))),[catalog,cat.name]);
 const list=useMemo(()=>{let a=catalog.filter(p=>cat.slug==="offers"?p.oldPrice:(p.category===cat.name&&(sub?p.subcategory===sub:!p.subcategory))).filter(p=>p.name.includes(term)||String(p.id).includes(term));if(price==="under20")a=a.filter(p=>p.price<20);if(price==="20to50")a=a.filter(p=>p.price>=20&&p.price<=50);if(price==="over50")a=a.filter(p=>p.price>50);if(stock==="available")a=a.filter(p=>!p.variants?.length||p.variants.some(v=>v.stock>0));if(stock==="unavailable")a=a.filter(p=>p.variants?.length&&p.variants.every(v=>v.stock<=0));if(option!=="all")a=a.filter(p=>p.variants?.some(v=>v.name===option));return [...a].sort((x,y)=>sort==="priceAsc"?x.price-y.price:sort==="priceDesc"?y.price-x.price:sort==="rating"?y.rating-x.rating:sort==="newest"?y.id-x.id:y.orders-x.orders)},[catalog,cat.name,cat.slug,sub,term,price,stock,option,sort]);
 const reset=()=>{setTerm("");setPrice("all");setStock("all");setOption("all");setSort("featured")};
 const add=(p:Product,v?:Variant)=>{const key=`${p.id}:${v?.sku||"base"}`,saved=JSON.parse(localStorage.getItem("manar_cart")||"{}"),line=saved[key],linePrice=v?.price??p.price;saved[key]={productId:p.id,variantSku:v?.sku,variantName:v?.name,qty:(line?.qty||0)+1,price:linePrice,image:v?.image||p.image};localStorage.setItem("manar_cart",JSON.stringify(saved))};
 return <main><div className="notice">التوصيل: الضفة 20 ₪ • القدس 30 ₪ • الداخل 70 ₪</div><StoreHeader/>
 <div className="categoryHero compactCategoryHero"><div><small><a href="/">الرئيسية</a> / <a href={`/category/${cat.slug}`}>{cat.name}</a>{sub&&` / ${sub}`}</small><h1>{sub||cat.name}</h1><p>{sub?`منتجات ${sub} المتوفرة حالياً.`:"اختر قسماً فرعياً أو تصفّح المنتجات المضافة مباشرة لهذا القسم."}</p></div><span>{cat.icon}</span></div>
 {!sub&&cat.subs.length>0&&<section className="subcategorySection"><div className="categorySectionHead"><h2>الأقسام الفرعية</h2><span>{cat.subs.length} أقسام</span></div><div className="subcategoryGrid">{cat.subs.map((name,i)=><a key={name} href={`/category/${cat.slug}?sub=${encodeURIComponent(name)}`}><i>{["🎀","🎁","✨","💝"][i%4]}</i><b>{name}</b><small>تصفّح المنتجات ←</small></a>)}</div></section>}
 <section className="categoryProducts"><div className="horizontalFilters">
 <div className="filterSearch"><span>⌕</span><input value={term} onChange={e=>setTerm(e.target.value)} placeholder="ابحث بالاسم أو رقم الصنف..."/></div>
 <select aria-label="فلتر السعر" value={price} onChange={e=>setPrice(e.target.value)}><option value="all">كل الأسعار</option><option value="under20">أقل من 20 ₪</option><option value="20to50">20 – 50 ₪</option><option value="over50">أكثر من 50 ₪</option></select>
 <select aria-label="فلتر التوفر" value={stock} onChange={e=>setStock(e.target.value)}><option value="all">كل حالات التوفر</option><option value="available">متوفر</option><option value="unavailable">غير متوفر</option></select>
 {options.length>0&&<select aria-label="فلتر المتغير" value={option} onChange={e=>setOption(e.target.value)}><option value="all">كل الخيارات</option>{options.map(x=><option key={x}>{x}</option>)}</select>}
 <select aria-label="ترتيب المنتجات" value={sort} onChange={e=>setSort(e.target.value)}><option value="featured">الأكثر طلباً</option><option value="newest">الأحدث</option><option value="rating">الأعلى تقييماً</option><option value="priceAsc">السعر: الأقل أولاً</option><option value="priceDesc">السعر: الأعلى أولاً</option></select>
 <button onClick={reset}>مسح الفلاتر</button></div>
 <div className="resultsHead"><h2>المنتجات</h2><span>{list.length} نتيجة</span></div>{list.length?<div className="productGrid">{list.map(p=><ProductCard key={p.id} p={p} watermark={logo} onAdd={v=>add(p,v)}/>)}</div>:<div className="emptyCategory"><b>لا توجد منتجات هنا حالياً</b><span>يمكن إضافة منتجات مباشرة لهذا القسم من لوحة التحكم.</span></div>}
 </section></main>
}
