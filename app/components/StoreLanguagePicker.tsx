"use client";

import { useEffect, useState } from "react";
import { selectStoreLanguage, storeLanguage, type StoreLanguage } from "../store-language";

const labels = { ar: "لغة المتجر", en: "Store language", he: "שפת החנות" };

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
    <select aria-label={labels[language]} value={language} onChange={event => {
      const next = event.currentTarget.value;
      if (next === "ar" || next === "he" || next === "en") selectStoreLanguage(next);
    }}>
      <option value="ar" lang="ar">العربية</option>
      <option value="he" lang="he">עברית</option>
      <option value="en" lang="en">English</option>
    </select>
  );
}
