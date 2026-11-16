"use client";

import {useState,type ReactNode} from "react";

type Language = "EN" | "HE";

export default function TranslationFields({languages,status,children}:{
  languages: readonly Language[];
  status: (language: Language) => boolean;
  children: (language: Language) => ReactNode;
}) {
  const [selected,setSelected] = useState<Language>("EN");
  const language = languages.includes(selected) ? selected : languages[0];
  if (!language) return null;

  return <details className="adminTranslationFields">
    <summary>الترجمات · {languages.map(code=>code+(status(code)?" مكتملة":" ناقصة")).join(" · ")}</summary>
    <div role="group" aria-label="لغة الترجمة">
      {languages.map(code=><button type="button" key={code} aria-pressed={language===code} onClick={()=>setSelected(code)}>{code}</button>)}
    </div>
    {children(language)}
  </details>;
}
