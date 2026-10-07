"use client";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    __manarPixelPath?: string;
  }
}

export type AnalyticsItem = {
  item_id: string;
  meta_content_id?: string;
  item_name?: string;
  item_variant?: string;
  item_category?: string;
  price?: number;
  quantity?: number;
};

export function trackPageView(pathname: string) {
  if (typeof window === "undefined" || typeof window.fbq !== "function" || window.__manarPixelPath === pathname) return;
  window.__manarPixelPath = pathname;
  window.fbq("track", "PageView");
}

export function trackEcommerce(event: "view_item" | "add_to_cart" | "begin_checkout" | "purchase" | "share", parameters: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const items = (Array.isArray(parameters.items) ? parameters.items : []) as AnalyticsItem[];
  if (typeof window.gtag === "function") {
    window.gtag("event", event, {...parameters, ...(Array.isArray(parameters.items) ? {
      items: items.map(({meta_content_id, ...item}) => item)
    } : {})});
  }
  if (typeof window.fbq !== "function" || event === "share") return;
  const names = {view_item: "ViewContent", add_to_cart: "AddToCart", begin_checkout: "InitiateCheckout", purchase: "Purchase"} as const;
  const contents = items.map(item => ({
    id: String(item.meta_content_id || item.item_id),
    quantity: Number(item.quantity) || 1,
    ...(typeof item.price === "number" ? {item_price: item.price} : {})
  }));
  // Only product and order metrics are sent; never customer contact or notes.
  const payload = {
    content_type: "product",
    content_ids: contents.map(item => item.id),
    contents,
    currency: String(parameters.currency || "ILS"),
    value: Number(parameters.value) || 0,
    num_items: contents.reduce((sum, item) => sum + item.quantity, 0),
    ...(items.length === 1 && items[0].item_name ? {content_name: items[0].item_name} : {})
  };
  if (event === "purchase" && parameters.transaction_id) {
    window.fbq("track", names[event], payload, {eventID: "order:" + String(parameters.transaction_id)});
  } else {
    window.fbq("track", names[event], payload);
  }
}
