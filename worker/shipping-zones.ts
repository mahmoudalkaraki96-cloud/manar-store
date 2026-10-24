interface Statement {bind(...values:unknown[]):Statement}
interface Database {prepare(sql:string):Statement;batch(statements:Statement[]):Promise<unknown>}
export class ShippingZoneError extends Error {}
export function validateShippingZones(value:unknown){
 if(!Array.isArray(value)||!value.length||value.length>100)throw new ShippingZoneError("عدد مناطق الشحن يجب أن يكون من 1 إلى 100");
 const codes=new Set<string>(),labels=new Set<string>();
 return value.map((item:unknown,index:number)=>{
  if(!item||typeof item!=="object")throw new ShippingZoneError("بيانات منطقة الشحن غير صحيحة");
  const zone=item as Record<string,unknown>,code=typeof zone.code==="string"?zone.code.trim():"",label=typeof zone.label==="string"?zone.label.trim():"";
  if(!/^[a-z][a-z0-9_]{1,63}$/.test(code)||codes.has(code))throw new ShippingZoneError("معرّف منطقة الشحن غير صحيح أو مكرر");
  if(!label||label.length>60||labels.has(label.toLocaleLowerCase()))throw new ShippingZoneError("اسم كل منطقة مطلوب ويجب ألا يتكرر أو يتجاوز 60 حرفاً");
  if((typeof zone.price!=="number"&&typeof zone.price!=="string")||String(zone.price).trim()==="")throw new ShippingZoneError("سعر الشحن غير صحيح");
  const price=Number(zone.price),agorot=Math.round(price*100);
  if(!Number.isFinite(price)||price<0||price>1000||Math.abs(price*100-agorot)>0.00001)throw new ShippingZoneError("سعر الشحن يجب أن يكون بين 0 و1000 شيكل وبمنزلتين عشريتين كحد أقصى");
  if(typeof zone.active!=="boolean")throw new ShippingZoneError("حالة منطقة الشحن غير صحيحة");
  codes.add(code);labels.add(label.toLocaleLowerCase());
  return {code,label,priceAgorot:agorot,active:zone.active,sortOrder:index};
 });
}
export async function persistShippingZones(db:Database,value:unknown){
 const zones=validateShippingZones(value),now=Date.now();
 // Stable codes preserve saved addresses; omitted zones are not deleted.
 await db.batch(zones.map(zone=>db.prepare("INSERT INTO shipping_zones(code,label,price_agorot,active,sort_order,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(code) DO UPDATE SET label=excluded.label,price_agorot=excluded.price_agorot,active=excluded.active,sort_order=excluded.sort_order,updated_at=excluded.updated_at").bind(zone.code,zone.label,zone.priceAgorot,zone.active?1:0,zone.sortOrder,now)));
}
