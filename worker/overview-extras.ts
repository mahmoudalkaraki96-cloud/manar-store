import {matches,type Product} from "../app/catalog-types";

// 1.10.0: the extra overview cards — visitor sources, orders by city, reviews waiting,
// searches that found nothing, and this month's sales against the goal. Read on load,
// not on every 30-second dashboard refresh.
interface Statement{bind(...values:unknown[]):Statement;first<T>():Promise<T|null>;all<T>():Promise<{results:T[]}>}
interface Database{prepare(sql:string):Statement}

const sourceGroups:[string,string,RegExp][]=[
 ["instagram","إنستغرام",/instagram|^ig$|l\.instagram/i],
 ["facebook","فيسبوك",/facebook|^fb$|fb\.me|m\.facebook|lm\.facebook/i],
 ["google","جوجل",/google/i],
 ["tiktok","تيك توك",/tiktok/i],
 ["whatsapp","واتساب",/whatsapp|wa\.me/i]
];
export function sourceGroup(source:string|null,referrer:string|null,ownHost=""):string{
 const value=[source,referrer].filter(Boolean).join(" ").trim();
 if(!value||value==="direct"||(ownHost&&value.includes(ownHost)))return "direct";
 for(const [key,,pattern] of sourceGroups)if(pattern.test(value))return key;
 return "other";
}
const labels:Record<string,string>={...Object.fromEntries(sourceGroups.map(([key,label])=>[key,label])),direct:"مباشر",other:"مواقع تانية"};

export function hebronMonth(now=Date.now()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Hebron",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(now)).map(p=>[p.type,p.value]));
 const year=Number(parts.year),month=Number(parts.month),day=Number(parts.day);
 const offset=Date.UTC(year,month-1,day,Number(parts.hour),Number(parts.minute))-Math.floor(now/60000)*60000;
 const daysInMonth=new Date(Date.UTC(year,month,0)).getUTCDate();
 return {start:Date.UTC(year,month-1,1)-offset,day,daysInMonth,daysLeft:daysInMonth-day+1};
}

export async function readOverviewExtras(db:Database,{now=Date.now(),days=30,goal=0,ownHost=""}={}){
 const since=now-days*864e5,month=hebronMonth(now);
 const safe=async<T>(work:()=>Promise<T>,fallback:T)=>{try{return await work()}catch{return fallback}};
 const [traffic,cities,reviews,pendingCount,terms,products,monthSales]=await Promise.all([
  safe(()=>db.prepare("SELECT source,referrer_host,COUNT(DISTINCT visitor_hash) AS visitors FROM marketing_events WHERE event_name='page_view' AND occurred_at>=? GROUP BY source,referrer_host").bind(since).all<{source:string|null;referrer_host:string|null;visitors:number}>(),{results:[]}),
  safe(()=>db.prepare("SELECT TRIM(city) AS city,COUNT(*) AS orders FROM orders WHERE deleted_at IS NULL AND status NOT IN ('draft','cancelled') AND created_at>=? AND TRIM(COALESCE(city,''))!='' GROUP BY TRIM(city) ORDER BY orders DESC LIMIT 6").bind(since).all<{city:string;orders:number}>(),{results:[]}),
  safe(()=>db.prepare("SELECT r.id,r.rating,r.body,r.created_at,p.name AS product_name FROM product_reviews r LEFT JOIN products p ON p.id=r.product_id WHERE r.status='pending' ORDER BY r.created_at DESC LIMIT 4").all<{id:number;rating:number;body:string;created_at:number;product_name:string|null}>(),{results:[]}),
  safe(()=>db.prepare("SELECT COUNT(*) AS total FROM product_reviews WHERE status='pending'").first<{total:number}>(),null),
  safe(()=>db.prepare("SELECT MIN(term) AS term,COUNT(*) AS searches FROM marketing_search_terms WHERE occurred_at>=? GROUP BY LOWER(TRIM(term)) ORDER BY searches DESC LIMIT 40").bind(since).all<{term:string;searches:number}>(),{results:[]}),
  safe(()=>db.prepare("SELECT p.id,p.name,p.item_number,(SELECT GROUP_CONCAT(k.keyword,' ') FROM product_keywords k WHERE k.product_id=p.id) AS keywords FROM products p WHERE p.active=1 AND p.deleted_at IS NULL").all<{id:number;name:string;item_number:number;keywords:string|null}>(),{results:[]}),
  safe(()=>db.prepare("SELECT COALESCE(SUM(total_agorot),0) AS sales FROM orders WHERE deleted_at IS NULL AND status NOT IN ('draft','cancelled') AND created_at>=?").bind(month.start).first<{sales:number}>(),null)
 ]);
 const buckets=new Map<string,number>();for(const row of traffic.results){const key=sourceGroup(row.source,row.referrer_host,ownHost);buckets.set(key,(buckets.get(key)||0)+Number(row.visitors||0))}
 const totalVisitors=[...buckets.values()].reduce((a,b)=>a+b,0);
 const catalog=products.results.map(p=>({id:p.id,name:p.name,itemNumber:p.item_number,category:"",keywords:p.keywords||"",variants:[]}) as unknown as Product);
 const failedSearches=terms.results.filter(t=>String(t.term||"").trim().length>=2&&!catalog.some(p=>matches(p,String(t.term)))).slice(0,8).map(t=>({term:String(t.term).trim(),searches:Number(t.searches)}));
 const sales=Number(monthSales?.sales||0)/100;
 return {
  days,
  traffic:{visitors:totalVisitors,sources:[...buckets.entries()].sort((a,b)=>b[1]-a[1]).map(([key,visitors])=>({key,label:labels[key]||key,visitors,share:totalVisitors?Math.round(visitors/totalVisitors*100):0}))},
  cities:cities.results.map(c=>({city:c.city,orders:Number(c.orders)})),
  reviews:{pending:Number(pendingCount?.total||0),items:reviews.results.map(r=>({id:r.id,rating:Number(r.rating),body:String(r.body||"").slice(0,180),product:r.product_name||"منتج",createdAt:Number(r.created_at)}))},
  failedSearches,
  month:{sales,goal,daysLeft:month.daysLeft,daysInMonth:month.daysInMonth,perDayNeeded:goal>sales?Math.ceil((goal-sales)/Math.max(1,month.daysLeft)):0}
 };
}
