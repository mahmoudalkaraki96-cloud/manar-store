"use client";
import {useStoreLanguage} from "../../store-language";
import {useEffect,useMemo,useState} from "react";
import {useParams} from "next/navigation";
import {loadCatalog,matches,type CatalogResponse,type Product,type Variant} from "../../catalog-types";
import StoreHeader from "../../components/StoreHeader";
import ProductCard from "../../components/ProductCard";
import {addCartItem} from "../../cart-storage";

const labels:Record<string,string>={all:"كل المنتجات",offers:"العروض",featured:"منتجات مميزة",newest:"مضاف حديثاً","most-ordered":"الأكثر طلباً","top-rated":"الأعلى تقييماً"};
export default function ProductCollectionPage(){
 const {t}=useStoreLanguage();
 const params=useParams<{collection:string}>(),[data,setData]=useState<CatalogResponse>({categories:[],products:[]}),[loading,setLoading]=useState(true),[failed,setFailed]=useState(false);
 useEffect(()=>{loadCatalog().then(setData).catch(()=>setFailed(true)).finally(()=>setLoading(false))},[]);
 const [query,setQuery]=useState(""),[sort,setSort]=useState("newest"),[availability,setAvailability]=useState("all");
 useEffect(()=>{setQuery("");setSort("newest");setAvailability("all")},[params.collection]);
 const list=useMemo(()=>{const items=[...data.products];if(params.collection==="all"){const seen=new Set<number>();return items.filter(item=>{if(item.active===false||seen.has(item.id)||query.trim()&&!matches(item,query.trim())||availability==="available"&&!item.inStock||availability==="unavailable"&&item.inStock)return false;seen.add(item.id);return true}).sort((a,b)=>sort==="priceAsc"?a.price-b.price:sort==="priceDesc"?b.price-a.price:sort==="rating"?b.rating-a.rating:b.createdAt-a.createdAt)}if(params.collection==="offers")return items.filter(item=>item.oldPrice);if(params.collection==="featured")return items.filter(item=>item.featured);if(params.collection==="newest")return items.sort((a,b)=>b.createdAt-a.createdAt);if(params.collection==="most-ordered")return items.filter(item=>item.orders>0).sort((a,b)=>b.orders-a.orders);if(params.collection==="top-rated")return items.filter(item=>item.ratingCount>0).sort((a,b)=>b.rating-a.rating);return[]},[data.products,params.collection,query,sort,availability]);
 const add=(product:Product,variant?:Variant,qty=1)=>{addCartItem(product,variant,qty)};
 const title=labels[params.collection];
 if(loading)return <main><StoreHeader/><div className="storeState">{t("جاري التحميل...", "Loading…", "בטעינה…")}</div></main>;
 if(failed)return <main><StoreHeader/><div className="storeState error">تعذر تحميل المنتجات حالياً، حدّث الصفحة وحاول مرة ثانية</div></main>;
 if(!title)return <main><StoreHeader categories={data.categories} products={data.products}/><div className="emptyStore"><h1>{t("الصفحة غير موجودة", "Page not found", "הדף לא נמצא")}</h1></div></main>;
 return <main><StoreHeader categories={data.categories} products={data.products}/><div className="categoryHero compactCategoryHero"><div><small><a href="/">{t("الرئيسية", "Home", "דף הבית")}</a> / {title}</small><h1>{title}</h1></div><span>{params.collection==="newest"?"＋":"★"}</span></div><section className="categoryProducts">{params.collection==="all"&&<div className="horizontalFilters"><div className="filterSearch"><span aria-hidden="true">⌕</span><input aria-label="بحث في جميع المنتجات" value={query} onChange={event=>setQuery(event.target.value)} placeholder="ابحث باسم المنتج أو رقمه..."/></div><select aria-label="توفر جميع المنتجات" value={availability} onChange={event=>setAvailability(event.target.value)}><option value="all">{t("كل حالات التوفر", "All stock statuses", "כל מצבי המלאי")}</option><option value="available">{t("متوفر", "In stock", "במלאי")}</option><option value="unavailable">{t("منتهي", "Sold out", "אזל מהמלאי")}</option></select><select aria-label="ترتيب جميع المنتجات" value={sort} onChange={event=>setSort(event.target.value)}><option value="newest">{t("الأحدث", "Newest", "החדשים ביותר")}</option><option value="priceAsc">السعر: الأقل أولاً</option><option value="priceDesc">السعر: الأعلى أولاً</option><option value="rating">{t("الأعلى تقييماً", "Highest rated", "דירוג גבוה")}</option></select></div>}<div className="resultsHead"><h2>{title}</h2><span>{list.length} منتج</span></div>{list.length?<div className="productGrid">{list.map(product=><ProductCard key={product.id} p={product} onAdd={(variant,qty)=>add(product,variant,qty)}/>)}</div>:<div className="emptyCategory"><b>{t("لا توجد منتجات هنا حالياً", "No products here yet", "אין כאן מוצרים כרגע")}</b></div>}</section></main>
}
