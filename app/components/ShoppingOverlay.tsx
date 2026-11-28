"use client";
import {useStoreDataVersion} from "../fresh-cache";
import {loadItemsCatalog} from "../catalog-views";
import {useStoreLanguage,storeCurrency} from "../store-language";
import {useEffect,useState} from "react";
import {usePathname} from "next/navigation";
import Link from "next/link";
import {stockLimit,loadCatalog,catalogText,type Product,type CatalogResponse} from "../catalog-types";
import {defaultSettings,loadStorefront} from "../storefront-types";
import {loadCart,saveCart,syncCart,type CartLine} from "../cart-storage";
import {trackEcommerce} from "../analytics";
import {productThumbnail} from "../image-utils";
import {toggleFavorite,useFavorites,loadFavorites} from "../favorites-storage";
import type {CartDiscountQuote} from "../../shared/discounts";
import CheckoutModal from "./CheckoutModal";
import FreeShippingProgress from "./FreeShippingProgress";
export default function ShoppingOverlay(){const storeDataVersion=useStoreDataVersion();
 const {money,t,language}=useStoreLanguage();
 const productLabel=(product?:Product)=>product?(catalogText(product,language,"name")||product.name):t("product");
 const variantLabel=(product:Product|undefined,line:{variantId?:number|null;variantName?:string})=>{
  const variant=line.variantId==null?undefined:product?.variants?.find(item=>item.id===line.variantId);
  return variant?(catalogText(variant,language,"name")||variant.name):line.variantName;
 };
 const pathname=usePathname();
 const [data,setData]=useState<CatalogResponse>({categories:[],products:[]}),[settings,setSettings]=useState(defaultSettings),[cart,setCart]=useState<Record<string,CartLine>>({}),[cartOpen,setCartOpen]=useState(false),[favoritesOpen,setFavoritesOpen]=useState(false),[checkoutOpen,setCheckoutOpen]=useState(false),[completedOrder,setCompletedOrder]=useState<number|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const favoriteIds=useFavorites(),itemsKey=[...new Set([...Object.values(cart).map(line=>line.productId),...favoriteIds])].sort((a,b)=>a-b).join(",");
  useEffect(()=>{if(pathname.startsWith("/admin"))return;let alive=true;setCart(loadCart());const saved=loadCart(),ids=[...Object.values(saved).map(line=>line.productId),...loadFavorites()];Promise.all([loadItemsCatalog(ids),loadStorefront()]).then(([catalog,store])=>{if(!alive)return;setData(catalog);setSettings(store.settings);const next=syncCart(loadCart(),catalog.products);saveCart(next);setCart(next);setError("")}).catch(()=>{if(alive)setError(t("could_not_load_the_cart_try_again"))}).finally(()=>{if(alive)setLoading(false)});return()=>{alive=false}},[pathname,storeDataVersion,itemsKey]);
 useEffect(()=>{const refresh=()=>setCart(loadCart());window.addEventListener("manar:cart",refresh);window.addEventListener("storage",refresh);return()=>{window.removeEventListener("manar:cart",refresh);window.removeEventListener("storage",refresh)}},[]);
 const updateCart=(change:(current:Record<string,CartLine>)=>Record<string,CartLine>)=>{const next=change(loadCart());saveCart(next);setCart(next)};
 useEffect(()=>{const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"){setCartOpen(false);setFavoritesOpen(false);setCompletedOrder(null)}};window.addEventListener("keydown",escape);return()=>window.removeEventListener("keydown",escape)},[]);
 const favorites=useFavorites(),favoriteProducts=data.products.filter(product=>favorites.includes(product.id));
 const overlayOpen=cartOpen||favoritesOpen||checkoutOpen||completedOrder!==null;
 useEffect(()=>{
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
 useEffect(()=>{
  if(!overlayOpen)return;
  const previous=document.activeElement as HTMLElement|null,background=document.querySelector<HTMLElement>(".storeShell"),wasInert=background?.inert;
  if(background)background.inert=true;
  const dialog=()=>document.querySelector<HTMLElement>(".checkoutBox,.cartOverlay .cart,.checkoutSuccess");
  const focusable=()=>Array.from(dialog()?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex="0"]')||[]).filter(node=>node.getClientRects().length>0);
  focusable()[0]?.focus({preventScroll:true});
  const trap=(event:KeyboardEvent)=>{if(event.key!=="Tab")return;const nodes=focusable(),first=nodes[0],last=nodes[nodes.length-1];if(!first)return;if(event.shiftKey&&(document.activeElement===first||!dialog()?.contains(document.activeElement))){event.preventDefault();last.focus()}else if(!event.shiftKey&&(document.activeElement===last||!dialog()?.contains(document.activeElement))){event.preventDefault();first.focus()}};
  document.addEventListener("keydown",trap);
  return()=>{document.removeEventListener("keydown",trap);if(background)background.inert=Boolean(wasInert);if(previous?.isConnected)previous.focus({preventScroll:true})};
 },[cartOpen,favoritesOpen,checkoutOpen,completedOrder]);
 const [codeInput,setCodeInput]=useState(""),[code,setCode]=useState(""),[quote,setQuote]=useState<CartDiscountQuote|null>(null),[quoteError,setQuoteError]=useState(""),[quoteAttempt,setQuoteAttempt]=useState(0);
 const quoteItems=JSON.stringify(Object.values(cart).map(({productId,variantId,qty})=>({productId,variantId,qty})));
 const shouldQuote=cartOpen||checkoutOpen;
 useEffect(()=>{
  setQuote(null);setQuoteError("");
  if(!shouldQuote||quoteItems==="[]")return;
  const controller=new AbortController();
  const timer=window.setTimeout(()=>{
   void fetch("/api/discount-quote",{method:"POST",headers:{"content-type":"application/json"},signal:controller.signal,body:JSON.stringify({items:JSON.parse(quoteItems),code})})
    .then(async response=>{if(!response.ok)throw new Error();const value=await response.json();if(!controller.signal.aborted)setQuote(value)})
    .catch(()=>{if(!controller.signal.aborted)setQuoteError(t("could_not_update_the_discount_try_again"))});
  },250);
  return()=>{window.clearTimeout(timer);controller.abort()};
 },[quoteItems,code,shouldQuote,quoteAttempt]);
 const count=Object.values(cart).reduce((sum,line)=>sum+line.qty,0),subtotal=Object.values(cart).reduce((sum,line)=>sum+line.qty*line.price,0);
 useEffect(()=>{const url=new URL(window.location.href);if(url.searchParams.get("cart")==="open"){setCartOpen(true);url.searchParams.delete("cart");window.history.replaceState(window.history.state,"",url.pathname+url.search+url.hash)}},[]);
 const netSubtotal=quote?quote.discountedSubtotalAgorot/100:subtotal;
 const discount=quote?(quote.automaticAgorot+quote.couponAgorot)/100:0;
 const beginCheckout=()=>{if(!count||loading)return;trackEcommerce("begin_checkout",{currency:storeCurrency(),value:subtotal,items:Object.values(cart).map(line=>{const product=data.products.find(item=>item.id===line.productId);return {item_id:String(line.productId),meta_content_id:String(product?.itemNumber||line.productId),item_name:product?.name,item_variant:line.variantName,price:line.price,quantity:line.qty}})});setCartOpen(false);setCheckoutOpen(true)};
 useEffect(()=>{const openCart=()=>setCartOpen(true),openFavoritesPanel=()=>setFavoritesOpen(true),openCheckout=()=>beginCheckout();window.addEventListener("manar:open-cart",openCart);window.addEventListener("manar:open-favorites",openFavoritesPanel);window.addEventListener("manar:open-checkout",openCheckout);return()=>{window.removeEventListener("manar:open-cart",openCart);window.removeEventListener("manar:open-favorites",openFavoritesPanel);window.removeEventListener("manar:open-checkout",openCheckout)}},[cart,data.products,loading]);
 useEffect(()=>{if(loading)return;const url=new URL(window.location.href);if(url.searchParams.get("checkout")==="open"){url.searchParams.delete("checkout");window.history.replaceState(window.history.state,"",url.pathname+url.search+url.hash);beginCheckout()}},[loading]);
 if(pathname.startsWith("/admin"))return null;
 return <> {cartOpen&&<div className="overlay cartOverlay" onMouseDown={()=>setCartOpen(false)}><aside role="dialog" aria-modal="true" aria-label={t("shopping_cart")} className="cart" onMouseDown={event=>event.stopPropagation()}><div className="cartHead"><h2>{t("shopping_cart")}</h2><button onClick={()=>setCartOpen(false)}>×</button></div>{error&&<p role="alert">{error}</p>}<div className="cartItems">{count===0?<div className="emptyCart">{t("your_cart_is_empty")}</div>:Object.entries(cart).map(([key,line])=>{const product=data.products.find(item=>item.id===line.productId);return product&&<div className="cartItem" key={key}>{line.image&&<img src={productThumbnail(line.image,240)} alt="" decoding="async" onError={event=>{const img=event.currentTarget;if(img.dataset.fallback!=="1"){img.dataset.fallback="1";img.src=line.image||""}}}/>}<div><b>{productLabel(product)}</b>{variantLabel(product,line)&&<em>{variantLabel(product,line)}</em>}<div className="cartCustomizationEditor">{(product.customFields||[]).map(field=><label key={field.id||field.label}>{field.label}<input maxLength={field.maxLength} value={line.customizations?.[field.label]||""} placeholder={field.placeholder} onChange={event=>updateCart(current=>({...current,[key]:{...current[key],customizations:{...current[key].customizations,[field.label]:event.target.value}}}))}/></label>)}<label>{t("product_notes")}<textarea maxLength={500} value={line.notes||""} placeholder={t("any_notes_for_this_item")} onChange={event=>updateCart(current=>({...current,[key]:{...current[key],notes:event.target.value}}))}/></label></div><small>{money(line.price)}</small><span><button onClick={()=>updateCart(current=>({...current,[key]:{...current[key],qty:Math.max(1,current[key].qty-1)}}))}>−</button>{line.qty}<button onClick={()=>updateCart(current=>({...current,[key]:{...current[key],qty:Math.min(99,Math.max(1,stockLimit(product,product.variants?.find(v=>v.id===line.variantId))),current[key].qty+1)}}))}>＋</button></span><button type="button" className="cartRemove" aria-label={t("cart.remove_item",{name:productLabel(product)})} onClick={()=>updateCart(current=>{const next={...current};delete next[key];return next})}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7"/></svg>{t("remove_from_cart")}</button></div></div>})}</div>{count>0&&<div className="cartSummary">
 <form onSubmit={event=>{event.preventDefault();setCode(codeInput.trim().toUpperCase());setQuoteAttempt(attempt=>attempt+1)}}><label>{t("discount_code")} <input dir="ltr" maxLength={32} value={codeInput} onChange={event=>setCodeInput(event.target.value)}/></label> <button type="submit">{t("apply")}</button>{code&&<button type="button" onClick={()=>{setCode("");setCodeInput("")}}>{t("remove_code")}</button>}</form>
 {quoteError&&<p role="alert">{quoteError}</p>}{quote?.invalidCode&&<p role="alert">{t("this_code_is_unavailable_for_this_cart")}</p>}
 <FreeShippingProgress subtotal={netSubtotal} settings={settings}/>{discount>0&&<span>{t("discount")} <b>{money(discount)}</b></span>}<strong>{t("subtotal")} <b>{money(netSubtotal)}</b></strong><button disabled={loading||Boolean(error)||!quote||quote.invalidCode} onClick={()=>{beginCheckout()}}>{t("checkout")}</button></div>}</aside></div>}
 {favoritesOpen&&<div className="overlay cartOverlay" onMouseDown={()=>setFavoritesOpen(false)}><aside role="dialog" aria-modal="true" aria-label={t("favorites")} className="cart" onMouseDown={event=>event.stopPropagation()}><div className="cartHead"><h2>{t("favorites")}</h2><button onClick={()=>setFavoritesOpen(false)}>×</button></div><div className="favList">{favoriteProducts.length===0?<div className="emptyCart">{loading?t("loading"):t("no_favorite_products_yet")}</div>:favoriteProducts.map(product=><div className="cartItem" key={product.id}>{product.image&&<img src={productThumbnail(product.image,240)} alt="" decoding="async" onError={event=>{const img=event.currentTarget;if(img.dataset.fallback!=="1"){img.dataset.fallback="1";img.src=product.image||""}}}/>}<div><Link href={`/product/${product.id}`} onClick={()=>setFavoritesOpen(false)}><b>{productLabel(product)}</b></Link><small>{money(product.price)}</small></div><button className="trash" onClick={()=>toggleFavorite(product.id)}>{t("remove")}</button></div>)}</div></aside></div>}
 {checkoutOpen&&<CheckoutModal settings={settings} discountCode={code} quote={quote} quoteError={quoteError} retryQuote={()=>setQuoteAttempt(value=>value+1)} onReview={()=>{setCheckoutOpen(false);setCartOpen(true)}} subtotal={subtotal} items={Object.values(cart).map(line=>({productId:line.productId,productName:productLabel(data.products.find(product=>product.id===line.productId)),variantName:variantLabel(data.products.find(product=>product.id===line.productId),line),itemNumber:data.products.find(product=>product.id===line.productId)?.itemNumber,price:line.price,variantId:line.variantId,customizations:line.customizations,notes:line.notes,qty:line.qty}))} onClose={()=>setCheckoutOpen(false)} onSuccess={number=>{setCheckoutOpen(false);setCode("");setCodeInput("");saveCart({});setCart({});setCompletedOrder(number)}}/>}{completedOrder&&<div role="dialog" aria-modal="true" aria-label={t("order_received")} className="checkoutSuccess"><button onClick={()=>setCompletedOrder(null)}>×</button><span>✓</span><h2>{t("order_received")}</h2><p>{t("order_number")} <b>#{completedOrder}</b></p><a href="/track-order">{t("track_order_2")}</a></div>}
</>;
}
