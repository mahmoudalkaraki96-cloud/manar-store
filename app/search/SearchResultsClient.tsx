"use client";
import {useStoreDataVersion} from "../fresh-cache";
import {matchesLocale,catalogText} from "../catalog-types";
import {useStoreLanguage} from "../store-language";
import {useEffect,useMemo,useState,type FormEvent} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import StoreHeader from "../components/StoreHeader";
import CategoryCards from "../components/CategoryCards";
import ProductCard from "../components/ProductCard";
import {loadCatalog,matches,norm,type CatalogResponse} from "../catalog-types";
import {defaultSettings,loadStorefront,type StoreSettings} from "../storefront-types";
import {trackSearch} from "../analytics";
import {addCartItem} from "../cart-storage";

export default function SearchResultsClient({initialQuery}:{initialQuery:string}){const storeDataVersion=useStoreDataVersion();
 const {t,language}=useStoreLanguage();
 const router=useRouter();
 const [data,setData]=useState<CatalogResponse>({categories:[],products:[]});
 const [settings,setSettings]=useState<StoreSettings>(defaultSettings);
 const [query,setQuery]=useState(initialQuery);
 const [sort,setSort]=useState("relevance");
 const [visible,setVisible]=useState(48);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 useEffect(()=>{setQuery(initialQuery);setVisible(48)},[initialQuery]);
 useEffect(()=>{let alive=true;Promise.all([loadCatalog(),loadStorefront()]).then(([catalog,store])=>{if(alive){setData(catalog);setSettings(store.settings)}}).catch(()=>{if(alive)setError(t("search.load_failed"))}).finally(()=>{if(alive)setLoading(false)});return()=>{alive=false}},[storeDataVersion]);
 const products=useMemo(()=>{const term=query.trim();if(!term)return[];const found=data.products.filter(product=>matchesLocale(product,term,language));return found.sort((a,b)=>sort==="newest"?b.createdAt-a.createdAt:sort==="priceAsc"?a.price-b.price:sort==="priceDesc"?b.price-a.price:(Number(b.featured)-Number(a.featured))||b.orders-a.orders)},[data.products,query,sort,language]);
 const categories=useMemo(()=>{const term=norm(query.trim());if(!term)return[];return data.categories.filter(category=>norm(catalogText(category,language,"name")||category.name).includes(term)).slice(0,12)},[data.categories,query,language]);
 const submit=(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();const term=query.trim();if(!term)return;trackSearch(term);setVisible(48);router.push("/search?q="+encodeURIComponent(term))};
 return <main className="searchResultsPage" style={{background:settings.backgroundColor,"--green":settings.primaryColor,"--gold":settings.secondaryColor} as React.CSSProperties}>
  <StoreHeader categories={data.categories} products={data.products} settings={settings}/>
  <section className="categoryProducts searchResultsContainer">
   <form className="horizontalFilters searchResultsForm" onSubmit={submit}>
    <div className="filterSearch"><span>⌕</span><input aria-label={t("search.products_label")} value={query} onChange={event=>setQuery(event.target.value)} placeholder={t("search.page_placeholder")}/></div>
    <button className="cardAddButton" style={{width:"auto",flexShrink:0}} type="submit" disabled={!query.trim()}>{t("search")}</button>
   </form>
   <div className="resultsHead"><div><h1>{t("search_results")}</h1>{query.trim()&&<p>{t("search.results_for")}{query.trim()}»</p>}</div><span>{loading?t("search.searching"):products.length+t("search.product_word")}</span></div>
   {error?<div className="emptyCategory">{error}</div>:loading?<div className="storeState">{t("loading_products")}</div>:!query.trim()?<div className="emptyCategory"><b>{t("enter_a_search_term")}</b><span>{t("use_either_search_box")}</span></div>:<>
    {categories.length>0&&<section className="subcategorySection searchCategoryResults"><div className="categorySectionHead"><h2>{t("matching_categories")}</h2><span>{categories.length} {t("search.category")}</span></div><CategoryCards categories={categories}/></section>}
    <div className="horizontalFilters searchSort"><div className="searchSortHeading"><h2>{t("products")}</h2><span>{products.length} {t("search.results_word")}</span></div><select aria-label={t("search.sort")} value={sort} onChange={event=>setSort(event.target.value)}><option value="relevance">{t("most_relevant")}</option><option value="newest">{t("newest")}</option><option value="priceAsc">{t("price_low_to_high_2")}</option><option value="priceDesc">{t("price_high_to_low_2")}</option></select></div>
    {products.length?<><div className="productGrid">{products.slice(0,visible).map(product=><ProductCard key={product.id} p={product} settings={settings} onAdd={(variant,qty)=>{addCartItem(product,variant,qty)}}/>)}</div>{visible<products.length&&<div className="searchMoreWrap" style={{display:"flex",justifyContent:"center",marginBlock:20}}><button type="button" className="cardAddButton" onClick={()=>setVisible(count=>count+48)}>{t("show_more_results")}</button></div>}</>:<div className="emptyCategory"><b>{t("no_matching_products_2")}</b><span>{t("try_another_term_or_browse_the_matching_categori")}</span></div>}
   </>}
  </section>
  <style jsx global>{`
   .searchResultsPage .searchCategoryResults{padding:18px;background:#fff8fb;border:1px solid #f1dce5;border-radius:16px}
   .searchResultsPage .searchCategoryResults .categorySectionHead{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
   .searchResultsPage .searchCategoryCardGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,190px),1fr));gap:10px}
   .searchResultsPage .searchCategoryCard{box-sizing:border-box;display:flex;min-width:0;min-height:88px;flex-direction:column;justify-content:space-between;gap:12px;padding:14px 16px;border:1px solid #ead5df;border-radius:13px;background:#fff;color:inherit;text-decoration:none;transition:border-color .18s,box-shadow .18s}
   .searchResultsPage .searchCategoryCard:hover,.searchResultsPage .searchCategoryCard:focus-visible{border-color:var(--green);box-shadow:0 4px 14px #47233412}
   .searchResultsPage .searchCategoryCardName{display:block;min-width:0;font-size:15px;font-weight:700;line-height:1.55;white-space:normal;overflow-wrap:anywhere}
   .searchResultsPage .searchCategoryCard small{display:flex;align-items:center;justify-content:space-between;gap:8px;color:#946678;font-size:12px}
   .searchResultsPage .searchSort{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
   .searchResultsPage .searchSortHeading{display:flex;align-items:baseline;gap:10px;min-width:0;flex-wrap:wrap}
   .searchResultsPage .searchSortHeading h2{margin:0;line-height:1.4}
   .searchResultsPage .searchSortHeading>span{font-size:13px;white-space:nowrap}
   .searchResultsPage .productGrid{align-items:stretch}
   .searchResultsPage .productGrid>.product{height:auto;min-width:0;overflow:visible;align-self:stretch}
   .searchResultsPage .productGrid .productInfo{box-sizing:border-box;min-width:0;overflow:visible}
   .searchResultsPage .productGrid .productInfo>a{display:block;min-width:0;white-space:normal}
   .searchResultsPage .productGrid .productInfo h3{display:block;max-width:100%;height:auto;max-height:none;margin-block:6px 10px;overflow:visible;white-space:normal;overflow-wrap:anywhere;word-break:normal;line-height:1.5}
   @media(max-width:600px){.searchResultsPage .searchCategoryCardGrid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.searchResultsPage .searchCategoryCard{min-height:84px;padding:12px}.searchResultsPage .searchSort{align-items:stretch}.searchResultsPage .searchSort select{max-width:100%}}
  `}</style>
 </main>;
}


