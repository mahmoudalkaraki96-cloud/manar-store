"use client";
import {createContext, useContext, useEffect, useState, type ReactNode} from "react";
import {usePathname} from "next/navigation";
import {useStoreSettings} from "./use-store-settings";

type Language = "AR" | "EN" | "HE";
const LanguageContext = createContext({
 language: "AR" as Language,
 languages: ["AR"] as Language[],
 choose: (_language: Language) => {},
});

export function StoreLanguageProvider({children}: {children: ReactNode}) {
 const settings = useStoreSettings();
 const pathname = usePathname();
 const [preferred, setPreferred] = useState<Language>("AR");
 const languages: Language[] = ["AR"];
 if (settings.englishEnabled) languages.push("EN");
 if (settings.hebrewEnabled) languages.push("HE");
 const language = !pathname.startsWith("/admin") && languages.includes(preferred) ? preferred : "AR";

 useEffect(() => {
  try {
   const saved = localStorage.getItem("storefront-language");
   if (saved === "EN" || saved === "HE") setPreferred(saved);
  } catch {}
 }, []);
 useEffect(() => {
  document.documentElement.lang = language.toLowerCase();
  document.documentElement.dir = language === "EN" ? "ltr" : "rtl";
 }, [language]);

 function choose(value: Language) {
  if (!languages.includes(value)) return;
  setPreferred(value);
  try { localStorage.setItem("storefront-language", value); } catch {}
 }
 return <LanguageContext.Provider value={{language, languages, choose}}>{children}</LanguageContext.Provider>;
}

export function useStoreLanguage() {
 const context = useContext(LanguageContext);
 return {...context, t: (ar: string, en: string, he: string) => ({AR: ar, EN: en, HE: he})[context.language]};
}
