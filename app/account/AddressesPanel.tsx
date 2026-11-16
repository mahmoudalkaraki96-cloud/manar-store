"use client";
import {useStoreLanguage,uiText} from "../store-language";
import {useEffect,useState} from "react";

type Zone={translations?:Partial<Record<string,string>>;code:string;label:string;price:number;active:boolean};
type Address={id:number;label:string;recipientName:string;phone:string;city:string;address:string;shippingZone:string;isDefault:boolean};
const empty=(name="",phone=""):Omit<Address,"id">=>({label:uiText("address.home"),recipientName:name,phone,city:"",address:"",shippingZone:"west_bank",isDefault:false});
async function request(path:string,method="GET",body?:unknown){
 const response=await fetch(path,{method,cache:"no-store",credentials:"same-origin",headers:body?{"content-type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined});
 const data=await response.json() as {error?:string;ok?:boolean;addresses?:Address[];zones?:Zone[]};
 if(!response.ok)throw new Error(data.error||uiText("error.operation_failed"));return data;
}
export default function AddressesPanel({name,phone}:{name:string;phone:string}){
 const {t,language}=useStoreLanguage();
 const [addresses,setAddresses]=useState<Address[]>([]),[zones,setZones]=useState<Zone[]>([]),[editing,setEditing]=useState<(Address|Omit<Address,"id">)|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const refresh=async()=>{const [a,z]=await Promise.all([request("/api/account/addresses"),request("/api/shipping-zones")]);setAddresses(a.addresses||[]);setZones(z.zones||[])};
 useEffect(()=>{void refresh().catch(error=>setMessage(error instanceof Error?error.message:t("address.load_failed")))},[]);
 const save=async(event:React.FormEvent)=>{event.preventDefault();if(!editing)return;setBusy(true);setMessage("");try{const id="id" in editing?editing.id:0;await request(id?"/api/account/addresses/"+id:"/api/account/addresses",id?"PUT":"POST",editing);await refresh();setEditing(null);setMessage(t("address.saved"))}catch(error){setMessage(error instanceof Error?error.message:t("address.save_failed"))}finally{setBusy(false)}};
 const remove=async(id:number)=>{if(!window.confirm(t("address.delete_confirm")))return;setBusy(true);try{await request("/api/account/addresses/"+id,"DELETE");await refresh();setMessage(t("address.deleted"))}catch(error){setMessage(error instanceof Error?error.message:t("address.delete_failed"))}finally{setBusy(false)}};
 return <section className="accountCard accountAddresses"><div className="accountSectionHead"><div><h2>{t("address.title")}</h2><p>{t("address.intro")}</p></div><button type="button" onClick={()=>setEditing(empty(name,phone))}>{t("address.add")}</button></div>
 {message&&<p className="addressMessage" role="status">{message}</p>}
 <div className="savedAddresses">{addresses.map(item=><article key={item.id} className={item.isDefault?"default":""}><div><b>{item.label}</b>{item.isDefault&&<small>{t("address.default_badge")}</small>}</div><strong>{item.recipientName}</strong><span>{item.phone}</span><span>{item.city} — {item.address}</span><em>{zones.find(zone=>zone.code===item.shippingZone)?.label||item.shippingZone}</em><div><button type="button" onClick={()=>setEditing(item)}>{t("common.edit")}</button><button type="button" disabled={busy} onClick={()=>void remove(item.id)}>{t("common.delete")}</button></div></article>)}</div>
 {!addresses.length&&!editing&&<p>{t("address.empty")}</p>}
 {editing&&<form className="addressForm" onSubmit={save}><h3>{"id" in editing?t("address.edit_title"):t("address.new_title")}</h3><label>{t("address.label")}<input required maxLength={60} value={editing.label} onChange={e=>setEditing({...editing,label:e.target.value})} placeholder={t("address.label_placeholder")}/></label><label>{t("address.recipient")}<input required value={editing.recipientName} onChange={e=>setEditing({...editing,recipientName:e.target.value})}/></label><label>{t("common.phone")}<input required inputMode="tel" value={editing.phone} onChange={e=>setEditing({...editing,phone:e.target.value})}/></label><label>{t("common.city")}<input required value={editing.city} onChange={e=>setEditing({...editing,city:e.target.value})}/></label><label className="wide">{t("address.details")}<input required value={editing.address} onChange={e=>setEditing({...editing,address:e.target.value})}/></label><label>{t("address.zone")}<select value={editing.shippingZone} onChange={e=>setEditing({...editing,shippingZone:e.target.value})}>{zones.map(zone=><option key={zone.code} value={zone.code}>{zone.translations?.[language]||zone.label} — {zone.price} ₪</option>)}</select></label><label className="defaultAddress"><input type="checkbox" checked={editing.isDefault} onChange={e=>setEditing({...editing,isDefault:e.target.checked})}/> {t("address.make_default")}</label><div className="addressActions"><button type="submit" disabled={busy}>{busy?t("common.saving"):t("address.save")}</button><button type="button" onClick={()=>setEditing(null)}>{t("common.cancel")}</button></div></form>}
 </section>;
}
