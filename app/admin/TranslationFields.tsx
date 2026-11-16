"use client";

import {useState,type ReactNode} from "react";
import type {StoreLanguage,TextDirection} from "../../shared/store-languages";

/** Translation inputs for every store language that needs one (from the store's language settings). */
export default function TranslationFields({languages,status,children}:{
  languages: readonly StoreLanguage[];
  status: (language: string) => boolean;
  children: (language: string, dir: TextDirection) => ReactNode;
}) {
  const [selected,setSelected] = useState<string>("");
  const language = languages.find(item=>item.code===selected) || languages[0];
  if (!language) return null;

  return <details className="adminTranslationFields">
    <summary>الترجمات · {languages.map(item=>item.code+(status(item.code)?" مكتملة":" ناقصة")).join(" · ")}</summary>
    <div role="group" aria-label="لغة الترجمة">
      {languages.map(item=><button type="button" key={item.code} title={item.name} aria-pressed={language.code===item.code} onClick={()=>setSelected(item.code)}>{item.code}</button>)}
    </div>
    {children(language.code,language.dir)}
  </details>;
}
