// 1.10.2: groups order or cart items by the supplier they are imported from and works out the profit
// from the purchase prices stored in the store (variant cost, then product cost, then the supplier's price).
// Costs are today's stored prices: order items do not keep the cost they had when the order was placed.

export type SourcingInput={productId:number|null;variantId?:number|null;quantity:number;unitPrice:number;name?:string;variantName?:string;image?:string|null};
export type SourcingItem={productId:number|null;variantId:number|null;itemNumber:number|null;name:string;variantName:string;sku:string;image:string|null;quantity:number;unitPrice:number;lineTotal:number;unitCost:number|null;lineCost:number|null;profit:number|null;sourceProductId:string;sourceUrl:string};
export type SourcingGroup={supplierId:number|null;supplierName:string;phone:string;items:SourcingItem[];pieces:number;revenue:number;cost:number;profit:number;missingCost:number};
export type SourcingResult={groups:SourcingGroup[];totals:{revenue:number;costedRevenue:number;cost:number;profit:number;margin:number|null;missingCost:number;pieces:number}};

interface Statement{bind(...values:unknown[]):Statement;all<T>():Promise<{results:T[]}>}
interface Database{prepare(sql:string):Statement}

const toNumber=(value:unknown)=>{const n=Number(value);return Number.isFinite(n)?n:0};
const agorot=(value:unknown)=>{const n=Number(value);return Number.isFinite(n)&&n>0?n/100:null};
const round=(value:number)=>Math.round(value*100)/100;

export function parseSourcingItems(body:unknown):SourcingInput[]{
  const items=(body as {items?:unknown})?.items;
  if(!Array.isArray(items)||items.length>300)throw new Error("قائمة الأصناف غير صالحة");
  return items.map(raw=>{
    const item=raw as Record<string,unknown>;
    const productId=item.productId==null?null:Number(item.productId),variantId=item.variantId==null?null:Number(item.variantId);
    return {productId:Number.isSafeInteger(productId)?productId:null,variantId:Number.isSafeInteger(variantId)?variantId:null,
      quantity:Math.max(0,Math.min(100000,Math.round(toNumber(item.quantity)))),unitPrice:Math.max(0,toNumber(item.unitPrice)),
      name:String(item.name||"").slice(0,300),variantName:String(item.variantName||"").slice(0,300),image:item.image?String(item.image).slice(0,2000):null};
  });
}

const placeholders=(n:number)=>Array.from({length:n},()=>"?").join(",");

export async function readSourcing(db:Database,items:SourcingInput[]):Promise<SourcingResult>{
  const productIds=[...new Set(items.map(i=>i.productId).filter((id):id is number=>id!=null))];
  const variantIds=[...new Set(items.map(i=>i.variantId).filter((id):id is number=>id!=null))];
  type ProductRow={id:number;item_number:number;name:string;purchase_price_agorot:number|null};
  type VariantRow={id:number;product_id:number;sku:string|null;purchase_price_agorot:number|null};
  type SupplierRow={product_id:number;supplier_id:number;name:string;phone:string|null;source_product_id:string|null;source_url:string|null;supplier_price_agorot:number|null;preferred:number};
  const chunk=<T,>(list:T[],size=90)=>Array.from({length:Math.ceil(list.length/size)},(_,i)=>list.slice(i*size,i*size+size));
  const products=new Map<number,ProductRow>(),variants=new Map<number,VariantRow>(),suppliers=new Map<number,SupplierRow>();
  for(const ids of chunk(productIds)){
    const r=await db.prepare(`SELECT id,item_number,name,purchase_price_agorot FROM products WHERE id IN (${placeholders(ids.length)})`).bind(...ids).all<ProductRow>();
    r.results.forEach(row=>products.set(Number(row.id),row));
    const s=await db.prepare(`SELECT ps.product_id,ps.supplier_id,s.name,s.phone,ps.source_product_id,ps.source_url,ps.supplier_price_agorot,ps.preferred FROM product_suppliers ps JOIN suppliers s ON s.id=ps.supplier_id WHERE ps.product_id IN (${placeholders(ids.length)}) ORDER BY ps.preferred DESC,ps.id`).bind(...ids).all<SupplierRow>();
    s.results.forEach(row=>{if(!suppliers.has(Number(row.product_id)))suppliers.set(Number(row.product_id),row)});
  }
  for(const ids of chunk(variantIds)){
    const r=await db.prepare(`SELECT id,product_id,sku,purchase_price_agorot FROM product_variants WHERE id IN (${placeholders(ids.length)})`).bind(...ids).all<VariantRow>();
    r.results.forEach(row=>variants.set(Number(row.id),row));
  }
  const groups=new Map<string,SourcingGroup>();
  for(const input of items){
    const product=input.productId!=null?products.get(input.productId):undefined;
    const variant=input.variantId!=null?variants.get(input.variantId):undefined;
    const supplier=input.productId!=null?suppliers.get(input.productId):undefined;
    const unitCost=agorot(variant?.purchase_price_agorot)??agorot(product?.purchase_price_agorot)??agorot(supplier?.supplier_price_agorot);
    const lineTotal=round(input.unitPrice*input.quantity),lineCost=unitCost==null?null:round(unitCost*input.quantity);
    const item:SourcingItem={productId:input.productId,variantId:input.variantId??null,itemNumber:product?Number(product.item_number):null,
      name:input.name||product?.name||"صنف محذوف",variantName:input.variantName||"",sku:variant?.sku||"",image:input.image||null,
      quantity:input.quantity,unitPrice:input.unitPrice,lineTotal,unitCost,lineCost,profit:lineCost==null?null:round(lineTotal-lineCost),
      sourceProductId:supplier?.source_product_id||"",sourceUrl:/^https:\/\//.test(supplier?.source_url||"")?String(supplier?.source_url):""};
    const key=supplier?String(supplier.supplier_id):"none";
    const group=groups.get(key)||{supplierId:supplier?Number(supplier.supplier_id):null,supplierName:supplier?.name||"بدون مورد",phone:supplier?.phone||"",items:[],pieces:0,revenue:0,cost:0,profit:0,missingCost:0};
    group.items.push(item);group.pieces+=item.quantity;group.revenue=round(group.revenue+lineTotal);
    if(lineCost==null)group.missingCost++;else{group.cost=round(group.cost+lineCost);group.profit=round(group.profit+lineTotal-lineCost)}
    groups.set(key,group);
  }
  const list=[...groups.values()].sort((a,b)=>(a.supplierId==null?1:0)-(b.supplierId==null?1:0)||b.revenue-a.revenue);
  const revenue=round(list.reduce((s,g)=>s+g.revenue,0)),cost=round(list.reduce((s,g)=>s+g.cost,0)),profit=round(list.reduce((s,g)=>s+g.profit,0));
  const costedRevenue=round(list.reduce((s,g)=>s+g.items.reduce((t,i)=>t+(i.lineCost==null?0:i.lineTotal),0),0));
  return {groups:list,totals:{revenue,costedRevenue,cost,profit,margin:costedRevenue>0?Math.round(profit/costedRevenue*1000)/10:null,missingCost:list.reduce((s,g)=>s+g.missingCost,0),pieces:list.reduce((s,g)=>s+g.pieces,0)}};
}
