"use client";
import {useEffect,useState} from "react";
import {policySections,type StorePolicies,type StorePolicyKey} from "../policy-types";

export default function PoliciesPanel(){
 const [policies,setPolicies]=useState<StorePolicies|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const load=async()=>{const response=await fetch("/api/admin/policies",{cache:"no-store"}),body=await response.json() as {policies?:StorePolicies;error?:string};if(!response.ok||!body.policies)throw new Error(body.error||"تعذر تحميل السياسات");setPolicies(body.policies)};
 useEffect(()=>{void load().catch(error=>setMessage(error instanceof Error?error.message:"تعذر تحميل السياسات"))},[]);
 const save=async()=>{if(!policies)return;setBusy(true);setMessage("");try{const response=await fetch("/api/admin/policies",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify(policies)}),body=await response.json() as {policies?:StorePolicies;error?:string};if(!response.ok||!body.policies)throw new Error(body.error||"تعذر حفظ السياسات");setPolicies(body.policies);setMessage("تم حفظ السياسات ونشر نسخة جديدة رقم "+body.policies.version)}catch(error){setMessage(error instanceof Error?error.message:"تعذر حفظ السياسات")}finally{setBusy(false)}};
 if(!policies)return <div className="dataPanel">{message||"جاري تحميل السياسات..."}</div>;
 return <div className="dataPanel policiesAdmin"><div className="panelHead"><div><h3>سياسات المتجر</h3><small>النسخة الحالية: {policies.version} — كل حفظ ينشئ نسخة جديدة تسجل مع الطلبات التالية.</small></div><button className="mainBtn" disabled={busy} onClick={()=>void save()}>{busy?"جاري الحفظ...":"حفظ ونشر السياسات"}</button></div>{message&&<p className="adminMessage">{message}</p>}<div className="policiesAdminGrid">{policySections.map(section=><label key={section.key}><b>{section.icon} {section.title}</b><textarea value={policies[section.key]} onChange={event=>setPolicies(current=>current?{...current,[section.key as StorePolicyKey]:event.target.value}:current)}/></label>)}</div></div>
}
