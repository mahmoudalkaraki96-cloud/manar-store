"use client";

import {formatDate,formatMoney,validCurrency,type MoneySettings} from "../../shared/money";
import {enabledLanguages,languageTag,type StoreLanguage} from "../../shared/store-languages";

/** Numbering systems the browser can format (Latin first), from Intl itself rather than a fixed list. */
function numberingSystems(){
  const all=(Intl as unknown as {supportedValuesOf?:(key:string)=>string[]}).supportedValuesOf?.("numberingSystem")||["latn"];
  const decimal=all.filter(system=>{try{return /^\p{Nd}{10}$/u.test(new Intl.NumberFormat(`en-u-nu-${system}`,{useGrouping:false}).format(1234567890))}catch{return false}});
  return ["latn",...decimal.filter(system=>system!=="latn")];
}

// Suggestions only; any valid ISO 4217 code can be typed.
const COMMON = ["ILS","JOD","USD","EUR","EGP","SAR","AED","GBP","TRY"];

/** Currency, custom symbol and digit style for prices, numbers and dates, with a live preview per store language. */
export default function StoreMoneySettings({value,languages,onChange}:{value:Required<MoneySettings>;languages:StoreLanguage[];onChange:(next:{currency:string;currencySymbol:string;digits:string})=>void}){
  const currency=value.currency.toUpperCase(),valid=validCurrency(currency);
  return <fieldset className="editorWide adminLanguages">
    <legend>العملة وتنسيق الأرقام</legend>
    <p className="adminHint">تُعرض الأسعار والأرقام والتواريخ في المتجر حسب لغة الزائر وبهذه الإعدادات.</p>
    <label>رمز العملة (ISO)
      <input dir="ltr" list="store-currency-codes" maxLength={3} value={currency} aria-invalid={!valid} onChange={event=>onChange({...value,currency:event.target.value.toUpperCase().replace(/[^A-Z]/g,"")})}/>
      <datalist id="store-currency-codes">{COMMON.map(code=><option key={code} value={code}/>)}</datalist>
    </label>
    <label>رمز مخصص (اختياري)
      <input dir="auto" maxLength={8} placeholder="مثال: شيكل" value={value.currencySymbol} onChange={event=>onChange({...value,currencySymbol:event.target.value})}/>
    </label>
    <label>الأرقام
      <select value={value.digits} onChange={event=>onChange({...value,digits:event.target.value})}>
        {numberingSystems().map(system=><option key={system} value={system}>{new Intl.NumberFormat(`en-u-nu-${system}`).format(1234567890)} · {system}</option>)}
      </select>
    </label>
    {valid?<ul className="adminHint">{enabledLanguages(languages).map(language=><li key={language.code} dir={language.dir}><b>{language.code}</b> · {formatMoney(1234.5,value,languageTag(language.code))} · {formatDate(Date.UTC(2026,10,16),languageTag(language.code),value.digits)}</li>)}</ul>
      :<p className="adminLanguagesError" role="alert">رمز العملة غير صالح. استخدم رمزاً من 3 أحرف مثل ILS أو JOD أو USD.</p>}
  </fieldset>;
}
