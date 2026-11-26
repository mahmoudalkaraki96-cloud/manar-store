"use client";
import {useMemo,useState} from "react";
import OrderWhatsAppLinks from "./OrderWhatsAppLinks";

// 1.10.0: customers summary like the sample — who buys, how much, and when they last bought.
export type OverviewOrder={id:number;customer_name:string;phone:string;city:string;status:string;total_agorot:number;created_at:number;deleted_at:number|null};
export type OverviewCustomer={key:string;name:string;phone:string;city:string;orders:number;spent:number;first:number;last:number;segment:Segment};
type Segment="vip"|"new"|"back"|"sleep"|"regular";
const segmentLabels:Record<Segment,string>={vip:"زبون مميز",new:"جديد",back:"رجع اشترى",sleep:"ما اشترى من زمان",regular:"زبون"};
const DAY=864e5;
const digits=(phone:string)=>String(phone||"").replace(/\D/g,"");
const money=(agorot:number)=>new Intl.NumberFormat("en-US",{maximumFractionDigits:0}).format(Math.round(agorot/100))+" ₪";
const ago=(time:number,now:number)=>{const days=Math.floor((now-time)/DAY);if(days<=0)return "اليوم";if(days===1)return "مبارح";if(days===2)return "قبل يومين";if(days<=10)return `قبل ${days} أيام`;if(days<30)return `قبل ${days} يوم`;const months=Math.floor(days/30);if(months===1)return "قبل شهر";if(months===2)return "قبل شهرين";if(months<=10)return `قبل ${months} شهور`;if(months<12)return `قبل ${months} شهر`;return new Date(time).toLocaleDateString("en-GB",{timeZone:"Asia/Hebron"})};

export function buildCustomerOverview(orders:OverviewOrder[],now=Date.now()){
 const groups=new Map<string,OverviewOrder[]>();
 for(const order of orders){if(order.deleted_at!=null||order.status==="cancelled"||order.status==="draft")continue;const key=digits(order.phone).slice(-9)||"name:"+String(order.customer_name||"").trim();if(!key||key==="name:")continue;const list=groups.get(key)||[];list.push(order);groups.set(key,list)}
 const rows:OverviewCustomer[]=[...groups.entries()].map(([key,list])=>{list.sort((a,b)=>b.created_at-a.created_at);const latest=list[0];const spent=list.reduce((sum,o)=>sum+Number(o.total_agorot||0),0);return {key,name:String(latest.customer_name||"زبون"),phone:String(latest.phone||""),city:String(latest.city||""),orders:list.length,spent,first:list[list.length-1].created_at,last:latest.created_at,segment:"regular" as Segment}});
 const average=rows.length?rows.reduce((sum,r)=>sum+r.spent,0)/rows.length:0;
 for(const row of rows)row.segment=now-row.last>90*DAY?"sleep":row.orders>=5||row.orders>=3&&row.spent>=average*3?"vip":row.orders===1&&now-row.first<=30*DAY?"new":row.orders>=2?"back":"regular";
 const monthStart=(()=>{const d=new Date(now);d.setDate(1);d.setHours(0,0,0,0);return d.getTime()})();
 return {rows:rows.sort((a,b)=>b.last-a.last),summary:{total:rows.length,newThisMonth:rows.filter(r=>r.first>=monthStart).length,returning:rows.length?Math.round(rows.filter(r=>r.orders>=2).length/rows.length*100):0,average}};
}

export default function CustomersOverview({orders,onOpen}:{orders:OverviewOrder[];onOpen:(customer:OverviewCustomer)=>void}){
 const [query,setQuery]=useState(""),[segment,setSegment]=useState<"all"|Segment>("all"),[page,setPage]=useState(1);
 const now=Date.now();
 const {rows,summary}=useMemo(()=>buildCustomerOverview(orders),[orders]);
 const search=query.trim().toLowerCase(),searchDigits=digits(query);
 const filtered=rows.filter(r=>(segment==="all"||r.segment===segment)&&(!search||r.name.toLowerCase().includes(search)||searchDigits.length>=3&&digits(r.phone).includes(searchDigits)));
 const pageSize=25,pages=Math.max(1,Math.ceil(filtered.length/pageSize)),current=Math.min(page,pages),shown=filtered.slice((current-1)*pageSize,current*pageSize);
 const exportCsv=()=>{const cell=(v:unknown)=>{let t=String(v??"");if(/^[=+\-@\t\r]/.test(t))t="'"+t;return '"'+t.replace(/"/g,'""')+'"'};const lines=[["الزبون","الهاتف","المدينة","الطلبات","مجموع الصرف","أول طلب","آخر طلب","الفئة"],...filtered.map(r=>[r.name,r.phone,r.city,r.orders,Math.round(r.spent/100),new Date(r.first).toLocaleDateString("en-GB"),new Date(r.last).toLocaleDateString("en-GB"),segmentLabels[r.segment]])];const blob=new Blob(["﻿"+lines.map(l=>l.map(cell).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`customers-${new Date().toISOString().slice(0,10)}.csv`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)};
 return <div className="customersOverview">
  <div className="customersOverviewHead"><p>مين بيشتري منك، قديش، وآخر مرة اشترى.</p><button type="button" className="secondaryAction" disabled={!filtered.length} onClick={exportCsv}>تصدير</button></div>
  <section className="customerStats" aria-label="ملخص الزبائن"><div><small>كل الزبائن</small><b>{summary.total}</b></div><div><small>جداد هالشهر</small><b>{summary.newThisMonth}</b></div><div><small>رجعوا اشتروا مرة تانية</small><b>{summary.returning}%</b></div><div><small>متوسط صرف الزبون</small><b>{money(summary.average)}</b></div></section>
  <div className="customersFilters"><label className="customersSearchField"><span className="visuallyHidden">بحث بالزبائن</span><input type="search" value={query} onChange={e=>{setQuery(e.target.value);setPage(1)}} placeholder="ابحث بالاسم أو التلفون"/></label><label className="customersSegmentField"><span>الفئة</span><select value={segment} onChange={e=>{setSegment(e.target.value as "all"|Segment);setPage(1)}}><option value="all">الكل</option><option value="vip">زبائن مميزين</option><option value="new">جداد</option><option value="back">رجعوا اشتروا</option><option value="sleep">ما اشتروا من زمان</option></select></label></div>
  {!filtered.length?<div className="emptyCategory"><b>ما في زبائن بهالبحث</b></div>:<div className="customersTableWrap"><table className="customersTable"><thead><tr><th>الزبون</th><th>المدينة</th><th>الطلبات</th><th>مجموع الصرف</th><th>آخر طلب</th><th>الفئة</th><th><span className="visuallyHidden">تواصل</span></th></tr></thead><tbody>{shown.map(r=><tr key={r.key} onClick={()=>onOpen(r)}><td data-label="الزبون"><div className="customerCell"><span className="customerAvatar" aria-hidden>{r.name.trim().charAt(0)||"؟"}</span><span><b>{r.name}</b><small dir="ltr">{r.phone}</small></span></div></td><td data-label="المدينة">{r.city||"—"}</td><td data-label="الطلبات">{r.orders}</td><td data-label="مجموع الصرف"><b>{money(r.spent)}</b></td><td data-label="آخر طلب">{ago(r.last,now)}</td><td data-label="الفئة"><span className={"customerTag "+r.segment}>{segmentLabels[r.segment]}</span></td><td data-label="تواصل" onClick={e=>e.stopPropagation()}>{r.phone?<OrderWhatsAppLinks phone={r.phone}/>:null}</td></tr>)}</tbody></table></div>}
  {pages>1&&<div className="ordersPager"><small>عرض {(current-1)*pageSize+1}–{(current-1)*pageSize+shown.length} من {filtered.length} زبون</small><nav aria-label="صفحات الزبائن"><button type="button" className="secondaryAction" disabled={current<=1} onClick={()=>setPage(current-1)}>السابق</button><span>{current} / {pages}</span><button type="button" className="secondaryAction" disabled={current>=pages} onClick={()=>setPage(current+1)}>التالي</button></nav></div>}
 </div>;
}
