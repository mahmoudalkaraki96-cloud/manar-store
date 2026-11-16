"use client";
import {createContext, useContext, useEffect, useMemo, useState, type ReactNode} from "react";
import {usePathname} from "next/navigation";
import {useStoreSettings} from "./use-store-settings";
import {bootstrapLanguages, defaultLanguage, enabledLanguages, languageTag, readStoreLanguages, sourceLanguage, type LanguageCode, type StoreLanguage, type TextDirection} from "../shared/store-languages";

export type Language = LanguageCode;
const STORAGE_KEY = "storefront-language";
// The admin dashboard interface is Arabic-only by decision (plan 1.8.x); only the storefront is multilingual.
const ADMIN_INTERFACE = {code: "AR", dir: "rtl" as TextDirection};

type LanguageState = {
 language: Language;
 dir: TextDirection;
 languages: Language[];
 languageList: StoreLanguage[];
 sourceCode: Language;
 choose: (language: Language) => void;
};
const LanguageContext = createContext<LanguageState>({
 language: bootstrapLanguages[0].code,
 dir: bootstrapLanguages[0].dir,
 languages: [bootstrapLanguages[0].code],
 languageList: bootstrapLanguages,
 sourceCode: bootstrapLanguages[0].code,
 choose: () => {},
});

/** Language list the worker embedded in the page, so the first client render already knows the store's setup. */
function embeddedLanguages(): StoreLanguage[] | null {
 if (typeof document === "undefined") return null;
 try {
  const node = document.getElementById("storefront-languages");
  return node?.textContent ? readStoreLanguages(JSON.parse(node.textContent).languages) : null;
 } catch { return null; }
}

export function StoreLanguageProvider({children}: {children: ReactNode}) {
 const settings = useStoreSettings();
 const pathname = usePathname() || "/";
 const [embedded, setEmbedded] = useState<StoreLanguage[] | null>(null);
 const [preferred, setPreferred] = useState<Language | null>(null);
 const all = useMemo(() => settings.languages && settings.languages !== bootstrapLanguages ? readStoreLanguages(settings.languages) : (embedded || bootstrapLanguages), [settings.languages, embedded]);
 const list = useMemo(() => enabledLanguages(all), [all]);
 const fallback = defaultLanguage(all), source = sourceLanguage(all);
 const admin = pathname.startsWith("/admin");
 const active = list.find(item => item.code === preferred) || fallback;
 const language = admin ? ADMIN_INTERFACE.code : active.code;
 const dir = admin ? ADMIN_INTERFACE.dir : active.dir;

 useEffect(() => {
  setEmbedded(embeddedLanguages());
  try { setPreferred(localStorage.getItem(STORAGE_KEY)); } catch {}
 }, []);
 useEffect(() => {
  document.documentElement.lang = languageTag(language);
  document.documentElement.dir = dir;
 }, [language, dir]);

 function choose(value: Language) {
  if (!list.some(item => item.code === value)) return;
  setPreferred(value);
  try { localStorage.setItem(STORAGE_KEY, value); } catch {}
 }
 const value: LanguageState = {language, dir, languages: list.map(item => item.code), languageList: list, sourceCode: source.code, choose};
 return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

/**
 * `t(ar, en, he)` is the 1.7.x interface-text helper, kept until 1.8.1 moves interface texts into settings.
 * For any other configured language it falls back to the store's source content language, then to Arabic.
 */
export function useStoreLanguage() {
 const context = useContext(LanguageContext);
 const t = (ar: string, en: string, he: string) => {
  const known: Record<string, string> = {AR: ar, EN: en, HE: he};
  return known[context.language] ?? known[context.sourceCode] ?? ar;
 };
 return {...context, t};
}
