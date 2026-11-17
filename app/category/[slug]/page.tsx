"use client";
import {useStoreDataVersion} from "../../fresh-cache";
import {loadCategoryCatalog} from "../../catalog-views";
import {catalogText} from "../../catalog-types";
import {useStoreLanguage} from "../../store-language";
import {useEffect,useMemo,useRef,useState} from "react";
import {useParams} from "next/navigation";
import {categoryProducts,categoryTreeIds} from "../../category-products";
import "../../category-all-products.css";
import {loadCatalog,type CatalogResponse,type Product,type Variant} from "../../catalog-types";
import {defaultSettings,loadStorefront,type StoreSettings} from "../../storefront-types";
import StoreHeader from "../../components/StoreHeader";
import CategoryCards from "../../components/CategoryCards";
import ProductCard from "../../components/ProductCard";
import {addCartItem} from "../../cart-storage";

export default function CategoryPage(){const storeDataVersion=useStoreDataVersion();
 const {money,moneyRange,t,language}=useStoreLanguage();
 const params=useParams<{slug:string}>(),[data,setData]=useState<CatalogResponse>({categories:[],products:[]}),[settings,setSettings]=useState<StoreSettings>(defaultSettings),[loading,setLoading]=useState(true),[sort,setSort]=useState("featured"),[term,setTerm]=useState(""),[price,setPrice]=useState("all"),[stock,setStock]=useState("all"),[failed,setFailed]=useState(false);
 useEffect(()=>{Promise.all([loadCategoryCatalog(params.slug),loadStorefront().catch(()=>({settings:defaultSettings}))]).then(([catalog,storefront])=>{setData(catalog);setSettings(storefront.settings)}).catch(()=>setFailed(true)).finally(()=>setLoading(false))},[params.slug,storeDataVersion]);
 const [showAll,setShowAll]=useState(false),productsRef=useRef<HTMLElement>(null);
 useEffect(()=>{if(showAll)productsRef.current?.scrollIntoView({behavior:"smooth",block:"start"})},[showAll]);
 useEffect(()=>setShowAll(false),[params.slug]);
 const category=data.categories.find(item=>item.slug===params.slug),children=category?data.categories.filter(item=>item.parentId===category.id):[];
 const scopedProducts=useMemo(()=>category?categoryProducts(data.categories,data.products,category.id,showAll):[],[category,data.categories,data.products,showAll]);
 const list=useMemo(()=>{if(!category)return[];let result=scopedProducts.filter(product=>product.name.includes(term)||String(product.itemNumber).includes(term));if(price==="under20")result=result.filter(product=>product.price<20);if(price==="20to50")result=result.filter(product=>product.price>=20&&product.price<=50);if(price==="over50")result=result.filter(product=>product.price>50);if(stock==="available")result=result.filter(product=>product.inStock);if(stock==="unavailable")result=result.filter(product=>!product.inStock);return [...result].sort((a,b)=>sort==="priceAsc"?a.price-b.price:sort==="priceDesc"?b.price-a.price:sort==="rating"?b.rating-a.rating:sort==="newest"?b.createdAt-a.createdAt:b.orders-a.orders)},[category,scopedProducts,term,price,stock,sort]);
 const add=(product:Product,variant?:Variant,qty=1)=>{addCartItem(product,variant,qty)};
 if(loading)return <main><StoreHeader/><div className="storeState">{t("loading")}</div></main>;
 if(failed)return <main><StoreHeader/><div className="storeState error">{t("category.load_failed")}</div></main>;
 if(!category)return <main><StoreHeader categories={data.categories} products={data.products}/><div className="emptyStore"><h1>{t("category_not_found")}</h1><a href="/">{t("back_to_home")}</a></div></main>;
 const ancestors=[];let current=category.parentId?data.categories.find(item=>item.id===category.parentId):undefined;while(current){ancestors.unshift(current);const parentId=current.parentId;current=parentId?data.categories.find(item=>item.id===parentId):undefined}
 const hasDirectProducts=data.products.some(product=>product.categoryId===category.id);
 const allCategoryProducts=categoryProducts(data.categories,data.products,category.id,true);
 const canShowAll=category.parentId==null&&children.length>0&&allCategoryProducts.length>0;
 const childSections=!showAll&&settings.showSubcategoryProductsInParent?children.map(child=>({child,products:data.products.filter(product=>product.categoryId!=null&&categoryTreeIds(data.categories,child.id).has(product.categoryId)).slice(0,6)})).filter(section=>section.products.length>0):[];
 return <main><StoreHeader categories={data.categories} products={data.products}/><div className="categoryHero compactCategoryHero"><div><small><a href="/">{t("home")}</a>{ancestors.map(item=><span key={item.id}> / <a href={`/category/${item.slug}`}>{item.name}</a></span>)} / {catalogText(category,language,"name")||category.name}</small><h1>{catalogText(category,language,"name")||category.name}</h1>{category.description&&<p>{catalogText(category,language,"description")||category.description}</p>}</div>{category.iconUrl?<img className="categoryHeroIcon" src={category.iconUrl} alt=""/>:<span>▦</span>}</div>{children.length>0&&<section className="subcategorySection"><div className="categorySectionHead"><h2>{t("subcategories")}</h2><span>{children.length} {t("category.subcategories")}</span></div><CategoryCards categories={children}/></section>}{showAll||hasDirectProducts?<section className="categoryProducts" ref={productsRef}><div className="horizontalFilters"><div className="filterSearch"><span>⌕</span><input value={term} onChange={event=>setTerm(event.target.value)} placeholder={t("category.search_placeholder")}/></div><select value={price} onChange={event=>setPrice(event.target.value)}><option value="all">{t("all_prices")}</option><option value="under20">{t("filter.under_20",{amount:money(20)})}</option><option value="20to50">{moneyRange(20,50)}</option><option value="over50">{t("filter.over_50",{amount:money(50)})}</option></select><select value={stock} onChange={event=>setStock(event.target.value)}><option value="all">{t("all_stock_statuses")}</option><option value="available">{t("in_stock")}</option><option value="unavailable">{t("unavailable")}</option></select><select value={sort} onChange={event=>setSort(event.target.value)}><option value="featured">{t("most_ordered")}</option><option value="newest">{t("newest")}</option><option value="rating">{t("highest_rated")}</option><option value="priceAsc">{t("sort.price_low")}</option><option value="priceDesc">{t("sort.price_high")}</option></select></div><div className="resultsHead"><h2>{showAll?t("category.products_with_children"):t("category.products")}</h2><span>{list.length} {t("search.results_word")}</span></div>{list.length?<div className="productGrid">{list.map(product=><ProductCard key={product.id} p={product} settings={settings} onAdd={(variant,qty)=>add(product,variant,qty)}/>)}</div>:<div className="emptyCategory"><b>{t("no_matching_products")}</b><span>{t("change_your_search_or_filters_to_see_other_produ")}</span></div>}</section>:<section className="categoryProducts categoryProductsEmpty"><div className="emptyProductsStrip"><b>{t("category_products")}</b><span>{t("browse_the_subcategories_to_see_products")}</span></div></section>}{childSections.map(({child,products})=><section className="subcategoryProducts" key={child.id}><div className="subcategoryProductsHead"><div>{child.iconUrl&&<img src={child.iconUrl} alt=""/>}<h2>{catalogText(child,language,"name")||child.name}</h2></div><a href={`/category/${child.slug}`}>{t("view_all")}</a></div><div className="rowProducts">{products.map(product=><ProductCard key={product.id} p={product} settings={settings} onAdd={(variant,qty)=>add(product,variant,qty)}/>)}</div></section>)}{canShowAll&&!showAll&&<div className="categoryAllProductsAction"><button type="button" className="mainBtn" onClick={()=>setShowAll(true)}>{t("show_all_products_in_this_category")}</button></div>}</main>
}


