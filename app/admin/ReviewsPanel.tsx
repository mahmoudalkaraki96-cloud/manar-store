"use client";
import {useEffect,useState} from "react";
type Review={id:number;rating:number;body:string;photos_json:string;status:string;product_name:string};
export default function ReviewsPanel(){
 const [reviews,setReviews]=useState<Review[]>([]),[message,setMessage]=useState(""),[busy,setBusy]=useState<number|null>(null);
 const load=async()=>{const r=await fetch("/api/admin/reviews",{cache:"no-store"}),body=await r.json() as {reviews?:Review[];error?:string};if(!r.ok)throw Error(body.error||"تعذر تحميل المراجعات");setReviews(body.reviews||[])};
 useEffect(()=>{void load().catch(e=>setMessage(e.message))},[]);
 const moderate=async(id:number,status:string)=>{setBusy(id);setMessage("");try{const r=await fetch("/api/admin/reviews/"+id,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({status})});const body=await r.json() as {error?:string};if(!r.ok)throw Error(body.error||"تعذر الحفظ");await load();setMessage("تم حفظ حالة المراجعة")}catch(e){setMessage(e instanceof Error?e.message:"تعذر الحفظ")}finally{setBusy(null)}};
 return <section className="dataPanel productReviews"><h2>مراجعات المنتجات</h2><p>المراجعات والصور لا تظهر للزبائن قبل الموافقة.</p>{message&&<p role="status">{message}</p>}{!reviews.length&&<p>لا توجد مراجعات.</p>}{reviews.map(review=><article key={review.id}><h3>{review.product_name}</h3><strong>{review.rating} / 5</strong><p>{review.body}</p><small>{review.status==="approved"?"منشورة":review.status==="rejected"?"مرفوضة":"بانتظار الموافقة"}</small><div>{(JSON.parse(review.photos_json) as string[]).map(photo=><a key={photo} href={photo} target="_blank" rel="noopener noreferrer"><img src={photo} alt="صورة مراجعة"/></a>)}</div><button disabled={busy!==null||review.status==="approved"} onClick={()=>void moderate(review.id,"approved")}>موافقة ونشر</button><button disabled={busy!==null||review.status==="rejected"} onClick={()=>void moderate(review.id,"rejected")}>رفض / إخفاء</button></article>)}</section>
}
