"use client";
import {useEffect,useMemo,useState} from "react";
import {useParams} from "next/navigation";
import {loadCatalog,type CatalogResponse,type Product,type Variant} from "../../catalog-types";
import StoreHeader from "../../components/StoreHeader";
import ProductCard from "../../components/ProductCard";
import {addCartItem} from "../../cart-storage";

const labels:Record<string,string>={offers:"العروض",featured:"منتجات مميزة",newest:"مضاف حديثاً","most-ordered":"الأكثر طلباً","top-rated":"الأعلى تقييماً"};
export default function ProductCollectionPage(){
 const params=useParams<{collection:string}>(),[data,setData]=useState<CatalogResponse>({categories:[],products:[]}),[loading,setLoading]=useState(true),[failed,setFailed]=useState(false);
 useEffect(()=>{loadCatalog().then(setData).catch(()=>setFailed(true)).finally(()=>setLoading(false))},[]);
 const list=useMemo(()=>{const items=[...data.products];if(params.collection==="offers")return items.filter(item=>item.oldPrice);if(params.collection==="featured")return items.filter(item=>item.featured);if(params.collection==="newest")return items.sort((a,b)=>b.createdAt-a.createdAt);if(params.collection==="most-ordered")return items.filter(item=>item.orders>0).sort((a,b)=>b.orders-a.orders);if(params.collection==="top-rated")return items.filter(item=>item.ratingCount>0).sort((a,b)=>b.rating-a.rating);return[]},[data.products,params.collection]);
 const add=(product:Product,variant?:Variant,qty=1)=>{addCartItem(product,variant,qty)};
 const title=labels[params.collection];
 if(loading)return <main><StoreHeader/><div className="storeState">جاري التحميل...</div></main>;
 if(failed)return <main><StoreHeader/><div className="storeState error">تعذر تحميل المنتجات حالياً، حدّث الصفحة وحاول مرة ثانية</div></main>;
 if(!title)return <main><StoreHeader categories={data.categories} products={data.products}/><div className="emptyStore"><h1>الصفحة غير موجودة</h1></div></main>;
 return <main><StoreHeader categories={data.categories} products={data.products}/><div className="categoryHero compactCategoryHero"><div><small><a href="/">الرئيسية</a> / {title}</small><h1>{title}</h1></div><span>{params.collection==="newest"?"＋":"★"}</span></div><section className="categoryProducts"><div className="resultsHead"><h2>{title}</h2><span>{list.length} منتج</span></div>{list.length?<div className="productGrid">{list.map(product=><ProductCard key={product.id} p={product} onAdd={(variant,qty)=>add(product,variant,qty)}/>)}</div>:<div className="emptyCategory"><b>لا توجد منتجات هنا حالياً</b></div>}</section></main>
}
