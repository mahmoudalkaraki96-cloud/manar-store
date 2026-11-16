import {useStoreLanguage} from "../store-language";
import {shippingQuote} from "../../shared/shipping";
import type {StoreSettings} from "../storefront-types";
export default function FreeShippingProgress({subtotal,settings}:{subtotal:number;settings:StoreSettings}){const {t}=useStoreLanguage();
 const quote=shippingQuote(Math.round(subtotal*100),0,settings);
 if(!quote.enabled)return null;
 return <div className="freeShippingProgress" role="status"><strong>{quote.qualified?t("shipping.free_qualified"):t("shipping.free_remaining_prefix")+new Intl.NumberFormat("en-US",{maximumFractionDigits:2}).format(quote.remainingAgorot/100)+t("shipping.free_remaining_suffix")}</strong><progress aria-label={t("shipping.free_progress")} max={settings.freeShippingThreshold} value={Math.min(subtotal,settings.freeShippingThreshold)}/></div>;
}
