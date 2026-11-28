"use client";
import {useEffect,useMemo,useState,type ReactNode} from "react";
import AdminThumb from "./AdminThumb";
import {securityFetch} from "./AdminAccess";

// 1.10.2: an order's or a cart's items grouped by the supplier they are imported from, with the profit
// worked out from the purchase prices stored in the store. Used inside the order details and the cart popup.
export type SourcingLine={productId:number|null;variantId?:number|null;quantity:number;unitPrice:number;name?:string;variantName?:string;image?:string|null};
type Item={productId:number|null;variantId:number|null;itemNumber:number|null;name:string;variantName:string;sku:string;image:string|null;quantity:number;unitPrice:number;lineTotal:number;unitCost:number|null;lineCost:number|null;profit:number|null;sourceProductId:string;sourceUrl:string};
type Group={supplierId:number|null;supplierName:string;phone:string;items:Item[];pieces:number;revenue:number;cost:number;profit:number;missingCost:number};
type Result={groups:Group[];totals:{revenue:number;costedRevenue:number;cost:number;profit:number;margin:number|null;missingCost:number;pieces:number}};

const n=(v:number)=>v.toLocaleString("ar-PS-u-nu-latn",{maximumFractionDigits:2});
const shekel=(v:number|null|undefined)=>v==null?"—":n(v)+" ₪";
const groupMargin=(group:Group)=>{const costed=group.items.reduce((s,i)=>s+(i.lineCost==null?0:i.lineTotal),0);return costed>0?Math.round(group.profit/costed*1000)/10:null};

function orderText(group:Group){
 return [group.supplierName,...group.items.map(item=>`• ${item.sourceProductId?"["+item.sourceProductId+"] ":""}${item.name}${item.variantName?" — "+item.variantName:""} × ${item.quantity}`)].join("\n");
}

export default function SourcingView({lines,discount=0,title="الأصناف حسب المورد",renderName}:{lines:SourcingLine[];discount?:number;title?:string;renderName?:(item:Item)=>ReactNode}){
 const key=useMemo(()=>JSON.stringify(lines.map(l=>[l.productId,l.variantId??null,l.quantity,l.unitPrice])),[lines]);
 const [data,setData]=useState<Result|null>(null),[error,setError]=useState(""),[copied,setCopied]=useState<string|null>(null);
 useEffect(()=>{
  let live=true;setError("");
  securityFetch("/api/admin/sourcing","POST",{items:lines}).then(result=>{if(live)setData(result as Result)}).catch(e=>{if(live)setError(e instanceof Error?e.message:"تعذر حساب الموردين")});
  return()=>{live=false};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[key]);
 const copy=async(group:Group)=>{const text=orderText(group);try{await navigator.clipboard.writeText(text);setCopied(group.supplierName);setTimeout(()=>setCopied(null),2000)}catch{window.prompt("قائمة الطلب",text)}};
 if(error)return <p className="dashboardError" role="alert">{error}</p>;
 if(!data)return <p className="sourcingLoading" role="status">جاري ترتيب الأصناف حسب المورد…</p>;
 const t=data.totals,afterDiscount=t.profit-Math.max(0,discount);
 return <section className="sourcingView" aria-label={title}>
  <div className="sourcingSummary">
   <div><small>المبيع</small><b>{shekel(t.revenue)}</b></div>
   <div><small>التكلفة</small><b>{shekel(t.cost)}</b></div>
   <div className={t.profit<0?"loss":"gain"}><small>الربح</small><b>{shekel(t.profit)}</b>{t.margin!=null&&<em>{n(t.margin)}%</em>}</div>
   {discount>0&&<div className={afterDiscount<0?"loss":"gain"}><small>الربح بعد الخصم</small><b>{shekel(afterDiscount)}</b></div>}
  </div>
  {t.missingCost>0&&<p className="sourcingNote">{n(t.missingCost)} صنف ما إله سعر تكلفة، فما دخل بحساب الربح.</p>}
  <p className="sourcingNote">الربح محسوب من سعر التكلفة المسجّل هلّأ بالمنتج، بدون التوصيل.</p>
  {data.groups.map(group=><article className="sourcingGroup" key={group.supplierName+group.supplierId}>
   <header><div><h4>{group.supplierName}</h4><small>{n(group.items.length)} صنف · {n(group.pieces)} قطعة{group.phone?<> · <a href={"tel:"+group.phone} dir="ltr">{group.phone}</a></>:null}</small></div>
    <div className="sourcingGroupMoney"><small>مبيع {shekel(group.revenue)} · تكلفة {shekel(group.cost)}</small><b className={group.profit<0?"loss":"gain"}>ربح {shekel(group.profit)}{groupMargin(group)!=null?` · ${n(groupMargin(group)!)}%`:""}</b></div>
    {group.supplierId!=null&&<button type="button" className="secondaryAction" onClick={()=>void copy(group)}>{copied===group.supplierName?"انسخت ✓":"نسخ قائمة الطلب"}</button>}
   </header>
   <ul>{group.items.map((item,index)=><li key={index}>
    <span className="sourcingThumb"><AdminThumb src={item.image}/></span>
    <span className="sourcingInfo">{renderName?renderName(item):<b>{item.name}</b>}
     <small>{[item.itemNumber?"#"+item.itemNumber:"",item.variantName,item.sku?"SKU "+item.sku:""].filter(Boolean).join(" · ")}</small>
     {(item.sourceProductId||item.sourceUrl)&&<small className="sourcingCode">عند المورد: {item.sourceProductId&&<b dir="ltr">{item.sourceProductId}</b>}{item.sourceUrl&&<a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">افتح عند المورد ↗</a>}</small>}
    </span>
    <span className="sourcingLineMoney"><b>{n(item.quantity)} × {shekel(item.unitPrice)}</b><small>تكلفة {item.unitCost==null?"غير مسجلة":shekel(item.unitCost)}</small>{item.profit!=null&&<small className={item.profit<0?"loss":"gain"}>ربح {shekel(item.profit)}</small>}</span>
   </li>)}</ul>
  </article>)}
 </section>;
}
