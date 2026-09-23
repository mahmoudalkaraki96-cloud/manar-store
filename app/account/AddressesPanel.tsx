"use client";
import {useEffect,useState} from "react";

type Zone={code:string;label:string;price:number;active:boolean};
type Address={id:number;label:string;recipientName:string;phone:string;city:string;address:string;shippingZone:string;isDefault:boolean};
const empty=(name="",phone=""):Omit<Address,"id">=>({label:"المنزل",recipientName:name,phone,city:"",address:"",shippingZone:"west_bank",isDefault:false});
async function request(path:string,method="GET",body?:unknown){
 const response=await fetch(path,{method,cache:"no-store",credentials:"same-origin",headers:body?{"content-type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined});
 const data=await response.json() as {error?:string;ok?:boolean;addresses?:Address[];zones?:Zone[]};
 if(!response.ok)throw new Error(data.error||"تعذر إتمام العملية");return data;
}
export default function AddressesPanel({name,phone}:{name:string;phone:string}){
 const [addresses,setAddresses]=useState<Address[]>([]),[zones,setZones]=useState<Zone[]>([]),[editing,setEditing]=useState<(Address|Omit<Address,"id">)|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const refresh=async()=>{const [a,z]=await Promise.all([request("/api/account/addresses"),request("/api/shipping-zones")]);setAddresses(a.addresses||[]);setZones(z.zones||[])};
 useEffect(()=>{void refresh().catch(error=>setMessage(error instanceof Error?error.message:"تعذر تحميل العناوين"))},[]);
 const save=async(event:React.FormEvent)=>{event.preventDefault();if(!editing)return;setBusy(true);setMessage("");try{const id="id" in editing?editing.id:0;await request(id?"/api/account/addresses/"+id:"/api/account/addresses",id?"PUT":"POST",editing);await refresh();setEditing(null);setMessage("تم حفظ عنوان الشحن")}catch(error){setMessage(error instanceof Error?error.message:"تعذر حفظ العنوان")}finally{setBusy(false)}};
 const remove=async(id:number)=>{if(!window.confirm("حذف عنوان الشحن؟"))return;setBusy(true);try{await request("/api/account/addresses/"+id,"DELETE");await refresh();setMessage("تم حذف العنوان")}catch(error){setMessage(error instanceof Error?error.message:"تعذر حذف العنوان")}finally{setBusy(false)}};
 return <section className="accountCard accountAddresses"><div className="accountSectionHead"><div><h2>عناوين الشحن</h2><p>يمكنك حفظ أكثر من عنوان واختيار عنوان افتراضي.</p></div><button type="button" onClick={()=>setEditing(empty(name,phone))}>＋ إضافة عنوان</button></div>
 {message&&<p className="addressMessage" role="status">{message}</p>}
 <div className="savedAddresses">{addresses.map(item=><article key={item.id} className={item.isDefault?"default":""}><div><b>{item.label}</b>{item.isDefault&&<small>افتراضي</small>}</div><strong>{item.recipientName}</strong><span>{item.phone}</span><span>{item.city} — {item.address}</span><em>{zones.find(zone=>zone.code===item.shippingZone)?.label||item.shippingZone}</em><div><button type="button" onClick={()=>setEditing(item)}>تعديل</button><button type="button" disabled={busy} onClick={()=>void remove(item.id)}>حذف</button></div></article>)}</div>
 {!addresses.length&&!editing&&<p>لا توجد عناوين محفوظة.</p>}
 {editing&&<form className="addressForm" onSubmit={save}><h3>{"id" in editing?"تعديل العنوان":"عنوان جديد"}</h3><label>اسم العنوان<input required maxLength={60} value={editing.label} onChange={e=>setEditing({...editing,label:e.target.value})} placeholder="المنزل أو العمل"/></label><label>اسم المستلم<input required value={editing.recipientName} onChange={e=>setEditing({...editing,recipientName:e.target.value})}/></label><label>رقم الهاتف<input required inputMode="tel" value={editing.phone} onChange={e=>setEditing({...editing,phone:e.target.value})}/></label><label>المدينة<input required value={editing.city} onChange={e=>setEditing({...editing,city:e.target.value})}/></label><label className="wide">العنوان بالتفصيل<input required value={editing.address} onChange={e=>setEditing({...editing,address:e.target.value})}/></label><label>منطقة الشحن<select value={editing.shippingZone} onChange={e=>setEditing({...editing,shippingZone:e.target.value})}>{zones.map(zone=><option key={zone.code} value={zone.code}>{zone.label} — {zone.price} ₪</option>)}</select></label><label className="defaultAddress"><input type="checkbox" checked={editing.isDefault} onChange={e=>setEditing({...editing,isDefault:e.target.checked})}/> اجعله العنوان الافتراضي</label><div className="addressActions"><button type="submit" disabled={busy}>{busy?"جارٍ الحفظ...":"حفظ العنوان"}</button><button type="button" onClick={()=>setEditing(null)}>إلغاء</button></div></form>}
 </section>;
}
