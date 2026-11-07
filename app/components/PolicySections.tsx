"use client";
import {useStoreCopy} from "../use-store-copy";
import {useEffect,useState} from "react";
import {loadPolicies,policySections,type StorePolicies,type StorePolicyKey} from "../policy-types";

export default function PolicySections({mode="compact"}:{mode?:"compact"|"full"}){const copy=useStoreCopy();
 const [policies,setPolicies]=useState<StorePolicies|null>(null),[open,setOpen]=useState<StorePolicyKey|null>(mode==="full"?"receiving":null);
 useEffect(()=>{void loadPolicies().then(setPolicies).catch(()=>{})},[]);
 if(!policies)return <div className={mode==="full"?"policyLoading":"productPolicyStrip loading"}>جاري تحميل السياسات...</div>;
 if(mode==="full")return <div className="policyFullList">{policySections.map(section=><section id={section.key} className="policyFullSection" key={section.key}><div><span>{section.icon}</span><h2>{copy(section.title)}</h2></div><p>{policies[section.key]}</p></section>)}</div>;
 return <section className="productPolicies" aria-label={copy("سياسات المتجر")}><div className="productPolicyStrip">{policySections.map(section=><button type="button" key={section.key} className={open===section.key?"active":""} onClick={()=>setOpen(current=>current===section.key?null:section.key)}><span>{section.icon}</span>{copy(section.title)}</button>)}</div>{open&&<div className="productPolicyDetail"><p>{policies[open]}</p><a href="/policies/terms">{copy("عرض جميع السياسات")}</a></div>}</section>
}
