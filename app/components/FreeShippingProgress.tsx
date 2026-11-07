"use client";
import {useStoreCopy} from "../use-store-copy";
import {shippingQuote} from "../../shared/shipping";
import type {StoreSettings} from "../storefront-types";
export default function FreeShippingProgress({subtotal,settings}:{subtotal:number;settings:StoreSettings}){
 const copy=useStoreCopy();
 const quote=shippingQuote(Math.round(subtotal*100),0,settings);
 if(!quote.enabled)return null;
 return <div className="freeShippingProgress" role="status"><strong>{quote.qualified?copy("طلبك مؤهل للتوصيل المجاني"):"باقي "+new Intl.NumberFormat("en-US",{maximumFractionDigits:2}).format(quote.remainingAgorot/100)+" ₪ للتوصيل المجاني"}</strong><progress aria-label={copy("التقدم نحو التوصيل المجاني")} max={settings.freeShippingThreshold} value={Math.min(subtotal,settings.freeShippingThreshold)}/></div>;
}
