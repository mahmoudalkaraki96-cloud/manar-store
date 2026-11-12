import type {D1Database} from "./index";
import {priceDiscounts, type DiscountLine, type DiscountRule} from "../shared/discounts";

type Row = {id:number; label:string; code:string|null; config:string; enabled:number; used:number; saved:number; sales:number};

export async function discountRules(db:D1Database) {
  const {results} = await db.prepare(
    "SELECT r.*, COALESCE(d.used,0) used, COALESCE(d.saved,0) saved, COALESCE(d.sales,0) sales FROM discount_rules r LEFT JOIN (SELECT rule_id,COUNT(*) used,SUM(discount_agorot) saved,SUM(order_total_agorot) sales FROM discount_redemptions GROUP BY rule_id) d ON d.rule_id=r.id ORDER BY r.id"
  ).all<Row>();
  return results.map(({config,enabled,...row}) => ({...JSON.parse(config) as DiscountRule,...row,enabled:Boolean(enabled)}));
}

export async function saveDiscount(db:D1Database, body:Record<string,unknown>) {
  const label = String(body.label ?? "").trim().slice(0,100);
  const code = String(body.code ?? "").trim().toUpperCase() || null;
  const integer = (value:unknown, min:number, max:number) => {
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error("قيمة الخصم أو الحد غير صالحة");
    return n;
  };
  const ids = (value:unknown) => Array.isArray(value) ? [...new Set(value.map(id=>integer(id,1,2147483647)))].slice(0,200) : [];
  const kind = body.kind === "fixed" ? "fixed" : "percent";
  const startsAt = body.startsAt ? integer(body.startsAt,1,8640000000000000) : null;
  const endsAt = body.endsAt ? integer(body.endsAt,1,8640000000000000) : null;
  if (!label || (code && !/^[A-Z0-9_-]{2,32}$/.test(code)) || (startsAt && endsAt && startsAt>=endsAt)) throw new Error("تحقق من الاسم والكود وتواريخ العرض");
  const config = JSON.stringify({kind,amount:integer(body.amount,1,kind==="percent"?10000:100000000),
    minimumAgorot:integer(body.minimumAgorot ?? 0,0,100000000),productIds:ids(body.productIds),
    categoryIds:ids(body.categoryIds),startsAt,endsAt,stack:body.stack===true,limit:code&&body.limit?integer(body.limit,1,10000000):null});
  if (body.id) {
    const id = integer(body.id,1,2147483647);
    await db.prepare("UPDATE discount_rules SET label=?, config=?, enabled=? WHERE id=?").bind(label,config,body.enabled===false?0:1,id).run();
  } else {
    await db.prepare("INSERT INTO discount_rules(label,code,config,enabled) VALUES(?,?,?,?)").bind(label,code,config,body.enabled===false?0:1).run();
  }
}

export async function cartDiscount(db:D1Database, items:unknown, code:unknown, validated?:{unit:number;categoryId:number|null}[]) {
  if (!Array.isArray(items) || !items.length || items.length>100) throw new Error("السلة فارغة أو تتجاوز الحد");
  const categories = (await db.prepare("SELECT id,parent_id FROM categories").all<{id:number;parent_id:number|null}>()).results;
  const parents = new Map(categories.map(row=>[row.id,row.parent_id]));
  const lines:DiscountLine[] = [];
  for (const [index,item] of items.entries()) {
    const id=Number(item?.productId), variant=Number(item?.variantId)||null, quantity=Number(item?.qty);
    if (!Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(quantity)||quantity<1||quantity>99) throw new Error("صنف أو كمية غير صالحة");
    const trusted=validated?.[index];
    const row=trusted ? {category_id:trusted.categoryId,price:trusted.unit} : await db.prepare("SELECT p.category_id, COALESCE(v.price_agorot,p.price_agorot) price FROM products p LEFT JOIN product_variants v ON v.id=? AND v.product_id=p.id AND v.active=1 WHERE p.id=? AND p.active=1 AND p.deleted_at IS NULL AND (? IS NULL OR v.id IS NOT NULL)").bind(variant,id,variant).first<{category_id:number|null;price:number}>();
    if (!row) throw new Error("أحد الأصناف لم يعد متاحاً");
    const categoryIds:number[]=[];
    let category=row.category_id;
    while (category && !categoryIds.includes(category)) {
      categoryIds.push(category);
      category=parents.get(category) ?? null;
    }
    lines.push({productId:id,categoryIds,unitAgorot:row.price,quantity});
  }
  return priceDiscounts(lines,await discountRules(db),typeof code==="string"?code.slice(0,64):"",Date.now());
}
