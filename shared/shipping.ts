export type ShippingPolicy={freeShippingEnabled?:boolean;freeShippingThreshold?:number};
export function shippingQuote(subtotalAgorot:number,zoneAgorot:number,policy:ShippingPolicy){
 const threshold=Math.round(Number(policy.freeShippingThreshold)*100);
 const enabled=policy.freeShippingEnabled===true&&Number.isSafeInteger(threshold)&&threshold>0;
 const qualified=enabled&&Number.isSafeInteger(subtotalAgorot)&&subtotalAgorot>=threshold;
 return {shippingAgorot:qualified?0:zoneAgorot,enabled,qualified,remainingAgorot:enabled?Math.max(0,threshold-subtotalAgorot):0};
}
