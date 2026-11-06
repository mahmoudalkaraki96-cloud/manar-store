export type StoreLanguage = "ar" | "he" | "en";
const preferenceKey = "manar-store-language";

function valid(value: string | null): value is StoreLanguage {
  return value === "ar" || value === "he" || value === "en";
}

export function storeLanguage(): StoreLanguage {
  if (typeof window === "undefined" || window.location.pathname.startsWith("/admin")) return "ar";
  const requested = new URLSearchParams(window.location.search).get("lang");
  if (valid(requested)) return requested;
  try {
    const saved = window.localStorage.getItem(preferenceKey);
    if (valid(saved)) return saved;
  } catch { /* A private browser can disable storage. */ }
  return "ar";
}

export function selectStoreLanguage(language: StoreLanguage) {
  try { window.localStorage.setItem(preferenceKey, language); } catch { /* URL still applies. */ }
  const url = new URL(window.location.href);
  url.searchParams.set("lang", language);
  window.location.assign(url.toString());
}
