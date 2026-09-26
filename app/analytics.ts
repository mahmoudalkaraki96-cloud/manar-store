"use client";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export type AnalyticsItem = {
  item_id: string;
  item_name?: string;
  item_variant?: string;
  item_category?: string;
  price?: number;
  quantity?: number;
};

export function trackEcommerce(event: "view_item" | "add_to_cart" | "begin_checkout" | "purchase", parameters: Record<string, unknown>) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", event, parameters);
}
