"use client";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    __manarPixelPath?: string;
  }
}

export type AnalyticsItem = {
  item_id: string;
  meta_content_id?: string;
  item_name?: string;
  item_variant?: string;
  item_category?: string;
  price?: number;
  quantity?: number;
};

type InternalEvent="page_view"|"view_item"|"add_to_cart"|"begin_checkout"|"purchase"|"search";
const visitorKey="manar:marketing-visitor:v1",attributionKey="manar:marketing-attribution:v1";
function internalIdentity(){if(typeof window==="undefined")return"";try{const saved=JSON.parse(localStorage.getItem(visitorKey)||"null") as {id?:string;createdAt?:number}|null;if(saved?.id&&Date.now()-(saved.createdAt||0)<180*86400000)return saved.id;const id=crypto.randomUUID();localStorage.setItem(visitorKey,JSON.stringify({id,createdAt:Date.now()}));return id}catch{return crypto.randomUUID()}}
function attribution(){if(typeof window==="undefined")return{};try{const current=new URL(window.location.href),stored=JSON.parse(localStorage.getItem(attributionKey)||"null") as Record<string,string>|null,source=current.searchParams.get("utm_source"),medium=current.searchParams.get("utm_medium"),campaign=current.searchParams.get("utm_campaign");if(!stored||source||medium||campaign){const referrer=(()=>{try{const host=new URL(document.referrer).hostname;return host===location.hostname?"":host}catch{return""}})();const next={source:(source||stored?.source||referrer||"direct").slice(0,100),medium:(medium||stored?.medium||"").slice(0,100),campaign:(campaign||stored?.campaign||"").slice(0,140),referrerHost:referrer.slice(0,120)};localStorage.setItem(attributionKey,JSON.stringify(next));return next}return stored}catch{return{}}}
function recordInternalEvent(event:InternalEvent,parameters:Record<string,unknown>={}){if(typeof window==="undefined")return;const items=Array.isArray(parameters.items)?(parameters.items as AnalyticsItem[]).slice(0,30).map(item=>({item_id:String(item.item_id||""),item_category:item.item_category,price:item.price,quantity:item.quantity})):[];const attributionData=attribution();const payload={visitorId:event==="search"?crypto.randomUUID():internalIdentity(),event,route:location.pathname,source:attributionData.source,medium:attributionData.medium,campaign:attributionData.campaign,referrerHost:attributionData.referrerHost,productId:parameters.product_id,category:parameters.item_category,value:parameters.value,quantity:parameters.quantity,transactionId:parameters.transaction_id,searchTerm:event==="search"?parameters.searchTerm:undefined,items};void fetch("/api/analytics/event",{method:"POST",headers:{"content-type":"application/json"},credentials:"same-origin",keepalive:true,body:JSON.stringify(payload)}).catch(()=>{})}
export function trackSearch(query:string){if(query.trim().length<2)return;recordInternalEvent("search",{searchTerm:query})}

export function trackPageView(pathname: string) {
  if (typeof window === "undefined") return;
  recordInternalEvent("page_view",{route:pathname});
  if (typeof window.fbq !== "function" || window.__manarPixelPath === pathname) return;
  window.__manarPixelPath = pathname;
  window.fbq("track", "PageView");
}

export function trackEcommerce(event: "view_item" | "add_to_cart" | "begin_checkout" | "purchase" | "share", parameters: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const items = (Array.isArray(parameters.items) ? parameters.items : []) as AnalyticsItem[];
  if(event!=="share")recordInternalEvent(event,parameters);
  if (typeof window.gtag === "function") {
    window.gtag("event", event, {...parameters, ...(Array.isArray(parameters.items) ? {
      items: items.map(({meta_content_id, ...item}) => item)
    } : {})});
  }
  if (typeof window.fbq !== "function" || event === "share") return;
  const names = {view_item: "ViewContent", add_to_cart: "AddToCart", begin_checkout: "InitiateCheckout", purchase: "Purchase"} as const;
  const contents = items.map(item => ({
    id: String(item.meta_content_id || item.item_id),
    quantity: Number(item.quantity) || 1,
    ...(typeof item.price === "number" ? {item_price: item.price} : {})
  }));
  // Only product and order metrics are sent; never customer contact or notes.
  const payload = {
    content_type: "product",
    content_ids: contents.map(item => item.id),
    contents,
    currency: String(parameters.currency || "ILS"),
    value: Number(parameters.value) || 0,
    num_items: contents.reduce((sum, item) => sum + item.quantity, 0),
    ...(items.length === 1 && items[0].item_name ? {content_name: items[0].item_name} : {})
  };
  if (event === "purchase" && parameters.transaction_id) {
    window.fbq("track", names[event], payload, {eventID: "order:" + String(parameters.transaction_id)});
  } else {
    window.fbq("track", names[event], payload);
  }
}
