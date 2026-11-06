"use client";

import { useEffect, useState } from "react";
import { selectStoreLanguage, storeLanguage, type StoreLanguage } from "../store-language";

const labels = { ar: "لغة المتجر", en: "Store language", he: "שפת החנות" };
const choices = [
  { code: "ar", label: "العربية" },
  { code: "he", label: "עברית" },
  { code: "en", label: "English" },
] as const;

export default function StoreLanguagePicker() {
  const [language, setLanguage] = useState<StoreLanguage>("ar");
  useEffect(() => {
    const selected = storeLanguage();
    setLanguage(selected);
    document.documentElement.lang = selected;
    document.documentElement.dir = selected === "en" ? "ltr" : "rtl";
    return () => {
      document.documentElement.lang = "ar";
      document.documentElement.dir = "rtl";
    };
  }, []);
  return (
    <div className="storeLanguagePicker" role="group" aria-label={labels[language]} dir="ltr">
      {choices.map(({code,label}) => (
        <button key={code} type="button" aria-label={label} aria-pressed={language === code}
          title={label} onClick={() => { if (language !== code) selectStoreLanguage(code); }}>
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
