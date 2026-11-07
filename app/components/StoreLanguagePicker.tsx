"use client";

import { useEffect, useState } from "react";
import { selectStoreLanguage, resolveStoreLanguage,enabledStoreLanguages, type StoreLanguage } from "../store-language";
import {loadStorefront} from "../storefront-types";

const labels = { ar: "لغة المتجر", en: "Store language", he: "שפת החנות" };
const choices = [
  { code: "ar", label: "العربية" },
  { code: "he", label: "עברית" },
  { code: "en", label: "English" },
] as const;

export default function StoreLanguagePicker() {
  const [language, setLanguage] = useState<StoreLanguage>("ar");
  const [enabled,setEnabled]=useState<StoreLanguage[]>(["ar"]);
  useEffect(() => {
    let alive=true;
    void loadStorefront().then(async data=>{const selected=await resolveStoreLanguage();if(!alive)return;
    setEnabled(enabledStoreLanguages(data.settings));
    setLanguage(selected);
    document.documentElement.lang = selected;
    document.documentElement.dir = selected === "en" ? "ltr" : "rtl";
    }).catch(()=>{});
    return () => {
      alive=false;
      document.documentElement.lang = "ar";
      document.documentElement.dir = "rtl";
    };
  }, []);
  if(enabled.length===1)return null;
  return (
    <div className="storeLanguagePicker" role="group" aria-label={labels[language]} dir="ltr">
      {choices.filter(choice=>enabled.includes(choice.code)).map(({code,label}) => (
        <button key={code} type="button" aria-label={label} aria-pressed={language === code}
          title={label} onClick={() => { if (language !== code) selectStoreLanguage(code); }}>
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
