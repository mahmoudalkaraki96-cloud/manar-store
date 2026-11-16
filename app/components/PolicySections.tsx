"use client";
import {useStoreLanguage} from "../store-language";
import {useEffect,useState} from "react";
import {loadPolicies,policySections,type StorePolicies,type StorePolicyKey} from "../policy-types";

export default function PolicySections({mode="compact"}:{mode?:"compact"|"full"}){
 const {t,language}=useStoreLanguage();
 const titles={receiving:t("accepting_orders"),shipping:t("delivery"),cancellation:t("order_cancellation"),exchange:t("exchanges_and_inspection")};
 const [policies,setPolicies]=useState<StorePolicies|null>(null),[open,setOpen]=useState<StorePolicyKey|null>(mode==="full"?"receiving":null);
 useEffect(()=>{void loadPolicies().then(setPolicies).catch(()=>{})},[]);
 if(!policies)return <div className={mode==="full"?"policyLoading":"productPolicyStrip loading"}>{t("loading_policies")}</div>;
 if(mode==="full")return <div className="policyFullList">{policySections.map(section=><section id={section.key} className="policyFullSection" key={section.key}><div><span>{section.icon}</span><h2>{titles[section.key]}</h2></div><p>{policies.translations?.[language]?.[section.key]||policies[section.key]}</p></section>)}</div>;
 return <section className="productPolicies" aria-label={t("store_policies")}><div className="productPolicyStrip">{policySections.map(section=><button type="button" key={section.key} className={open===section.key?"active":""} onClick={()=>setOpen(current=>current===section.key?null:section.key)}><span>{section.icon}</span>{titles[section.key]}</button>)}</div>{open&&<div className="productPolicyDetail"><p>{policies.translations?.[language]?.[open]||policies[open]}</p><a href="/policies/terms">{t("view_all_policies")}</a></div>}</section>
}
