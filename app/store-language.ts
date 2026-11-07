import {cachedStoreSettings,loadStorefront} from "./storefront-types";
export type StoreLanguage = "ar" | "he" | "en";
const preferenceKey = "manar-store-language";

function valid(value: string | null): value is StoreLanguage {
  return value === "ar" || value === "he" || value === "en";
}

export function enabledStoreLanguages(settings:{englishEnabled?:boolean;hebrewEnabled?:boolean}):StoreLanguage[]{
  return ["ar",...(settings.hebrewEnabled===true?["he" as const]:[]),...(settings.englishEnabled===true?["en" as const]:[])];
}

export function storeLanguage(): StoreLanguage {
  if (typeof window === "undefined" || window.location.pathname.startsWith("/admin")) return "ar";
  const requested = new URLSearchParams(window.location.search).get("lang");
  const enabled=enabledStoreLanguages(cachedStoreSettings());
  if (valid(requested)) return enabled.includes(requested)?requested:"ar";
  try {
    const saved = window.localStorage.getItem(preferenceKey);
    if (valid(saved)&&enabled.includes(saved)) return saved;
  } catch { /* A private browser can disable storage. */ }
  return "ar";
}

export async function resolveStoreLanguage():Promise<StoreLanguage>{
  if(typeof window==="undefined"||window.location.pathname.startsWith("/admin"))return "ar";
  try{await loadStorefront()}catch{return "ar"}
  return storeLanguage();
}

export function selectStoreLanguage(language: StoreLanguage) {
  if(!enabledStoreLanguages(cachedStoreSettings()).includes(language))return;
  try { window.localStorage.setItem(preferenceKey, language); } catch { /* URL still applies. */ }
  const url = new URL(window.location.href);
  url.searchParams.set("lang", language);
  window.location.assign(url.toString());
}
