export type DiscountRule = {
  id: number;
  code: string | null;
  kind: "percent" | "fixed";
  amount: number;
  productIds: number[];
  categoryIds: number[];
  minimumAgorot: number;
  startsAt: number | null;
  endsAt: number | null;
  enabled: boolean;
  stack: boolean;
  limit: number | null;
  used: number;
};

export type DiscountLine = {
  productId: number;
  categoryIds: number[];
  unitAgorot: number;
  quantity: number;
};

function matches(rule: DiscountRule, line: DiscountLine) {
  return (!rule.productIds.length && !rule.categoryIds.length)
    || rule.productIds.includes(line.productId)
    || line.categoryIds.some(id => rule.categoryIds.includes(id));
}

function savings(rule: DiscountRule, base: number) {
  return Math.min(base, rule.kind === "percent" ? Math.floor(base * rule.amount / 10000) : rule.amount);
}

export function priceDiscounts(lines: DiscountLine[], rules: DiscountRule[], code: string, now: number) {
  const subtotal = lines.reduce((sum, line) => sum + line.unitAgorot * line.quantity, 0);
  const eligible = rules.filter(rule => rule.enabled && subtotal >= rule.minimumAgorot
    && (rule.startsAt === null || now >= rule.startsAt)
    && (rule.endsAt === null || now < rule.endsAt)
    && (rule.limit === null || rule.used < rule.limit));
  const automatic = eligible.filter(rule => rule.code === null);
  const priced = lines.map(line => {
    const base = line.unitAgorot * line.quantity;
    const reduction = automatic.reduce((best, rule) => matches(rule, line)
      ? Math.max(best, savings(rule, line.unitAgorot) * line.quantity) : best, 0);
    return { line, base, reduction };
  });
  const automaticAgorot = priced.reduce((sum, item) => sum + item.reduction, 0);
  const normalized = code.trim().toUpperCase();
  const coupon = normalized ? eligible.find(rule => rule.code === normalized) : undefined;
  const couponBase = coupon ? priced.reduce((sum, item) => {
    if (!matches(coupon, item.line) || (!coupon.stack && item.reduction > 0)) return sum;
    return sum + item.base - item.reduction;
  }, 0) : 0;
  const couponAgorot = coupon ? savings(coupon, couponBase) : 0;
  return {
    subtotalAgorot: subtotal,
    automaticAgorot,
    couponAgorot,
    couponId: couponAgorot ? coupon?.id : undefined,
    invalidCode: Boolean(normalized && !couponAgorot),
    discountedSubtotalAgorot: subtotal - automaticAgorot - couponAgorot,
  };
}

export type CartDiscountQuote = Omit<ReturnType<typeof priceDiscounts>, "couponId">;
