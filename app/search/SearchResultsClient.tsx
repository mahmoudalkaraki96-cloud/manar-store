"use client";
import {useEffect,useMemo,useState,type FormEvent} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import StoreHeader from "../components/StoreHeader";
import ProductCard from "../components/ProductCard";
import {loadCatalog,matches,norm,type CatalogResponse} from "../catalog-types";
import {defaultSettings,loadStorefront,type StoreSettings} from "../storefront-types";
import {trackSearch} from "../analytics";

export default function SearchResultsClient({initialQuery}:{initialQuery:string}){
 const router=useRouter();
 const [data,setData]=useState<CatalogResponse>({categories:[],products:[]});
 const [settings,setSettings]=useState<StoreSettings>(defaultSettings);
 const [query,setQuery]=useState(initialQuery);
 const [sort,setSort]=useState("relevance");
 const [visible,setVisible]=useState(48);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 useEffect(()=>{setQuery(initialQuery);setVisible(48)},[initialQuery]);
 useEffect(()=>{let alive=true;Promise.all([loadCatalog(),loadStorefront()]).then(([catalog,store])=>{if(alive){setData(catalog);setSettings(store.settings)}}).catch(()=>{if(alive)setError("تعذر تحميل نتائج البحث حاليًا")}).finally(()=>{if(alive)setLoading(false)});return()=>{alive=false}},[]);
 const products=useMemo(()=>{const term=query.trim();if(!term)return[];const found=data.products.filter(product=>matches(product,term));return found.sort((a,b)=>sort==="newest"?b.createdAt-a.createdAt:sort==="priceAsc"?a.price-b.price:sort==="priceDesc"?b.price-a.price:(Number(b.featured)-Number(a.featured))||b.orders-a.orders)},[data.products,query,sort]);
 const categories=useMemo(()=>{const term=norm(query.trim());if(!term)return[];return data.categories.filter(category=>norm(category.name).includes(term)).slice(0,12)},[data.categories,query]);
 const submit=(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();const term=query.trim();if(!term)return;trackSearch(term);setVisible(48);router.push("/search?q="+encodeURIComponent(term))};
 return <main className="searchResultsPage" style={{background:settings.backgroundColor,"--green":settings.primaryColor,"--gold":settings.secondaryColor} as React.CSSProperties}>
  <StoreHeader categories={data.categories} products={data.products} settings={settings}/>
  <section className="categoryProducts searchResultsContainer">
   <form className="horizontalFilters searchResultsForm" onSubmit={submit}>
    <div className="filterSearch"><span>⌕</span><input aria-label="ابحث في المنتجات" value={query} onChange={event=>setQuery(event.target.value)} placeholder="اكتب اسم المنتج أو رقمه أو القسم"/></div>
    <button className="cardAddButton" style={{width:"auto",flexShrink:0}} type="submit" disabled={!query.trim()}>ابحث</button>
   </form>
   <div className="resultsHead"><div><h1>نتائج البحث</h1>{query.trim()&&<p>نتائج البحث عن «{query.trim()}»</p>}</div><span>{loading?"جاري البحث...":products.length+" منتج"}</span></div>
   {error?<div className="emptyCategory">{error}</div>:loading?<div className="storeState">جاري تحميل المنتجات...</div>:!query.trim()?<div className="emptyCategory"><b>اكتب كلمة للبحث</b><span>استخدم مربع البحث بالأعلى أو اكتب كلمة هنا.</span></div>:<>
    {categories.length>0&&<section className="subcategorySection searchCategoryResults"><div className="categorySectionHead"><h2>الأقسام المطابقة</h2><span>{categories.length} قسم</span></div><div className="subcategoryGrid">{categories.map(category=><Link key={category.id} href={"/category/"+category.slug}><b>{category.name}</b><small>تصفّح القسم ←</small></Link>)}</div></section>}
    <div className="horizontalFilters searchSort"><div className="resultsHead"><h2>المنتجات</h2><span>{products.length} نتيجة</span></div><select aria-label="ترتيب نتائج البحث" value={sort} onChange={event=>setSort(event.target.value)}><option value="relevance">الأكثر ملاءمة</option><option value="newest">الأحدث</option><option value="priceAsc">السعر: الأقل أولًا</option><option value="priceDesc">السعر: الأعلى أولًا</option></select></div>
    {products.length?<><div className="productGrid">{products.slice(0,visible).map(product=><ProductCard key={product.id} p={product} settings={settings}/>)}</div>{visible<products.length&&<div className="searchMoreWrap" style={{display:"flex",justifyContent:"center",marginBlock:20}}><button type="button" className="cardAddButton" onClick={()=>setVisible(count=>count+48)}>عرض المزيد من النتائج</button></div>}</>:<div className="emptyCategory"><b>ما لقينا منتجات مطابقة</b><span>جرّب كلمة ثانية أو تصفّح الأقسام المطابقة.</span></div>}
   </>}
  </section>
 </main>;
}
