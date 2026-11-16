"use client";

import {useEffect,useMemo,useState} from "react";
import type {StoreLanguage} from "../../shared/store-languages";

type TextRow={key:string;defaults:Record<string,string>};
type Payload={languages:StoreLanguage[];keys:TextRow[];texts:Record<string,Record<string,string>>};

/** Owner editor for every storefront interface text, per store language. Empty = use the default text. */
export default function UiTextsPanel(){
  const [data,setData]=useState<Payload|null>(null),[language,setLanguage]=useState(""),[query,setQuery]=useState(""),[onlyMissing,setOnlyMissing]=useState(false);
  const [draft,setDraft]=useState<Record<string,string>>({}),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
  const load=async()=>{const response=await fetch("/api/admin/ui-texts",{cache:"no-store"});const body=await response.json() as Payload&{error?:string};if(!response.ok)throw new Error(body.error||"تعذر تحميل النصوص");setData(body);setDraft({})};
  useEffect(()=>{load().catch(error=>setMessage(error instanceof Error?error.message:"تعذر تحميل النصوص"))},[]);
  const languages=data?.languages||[],active=languages.find(item=>item.code===language)||languages.find(item=>item.isSource)||languages[0];
  const source=languages.find(item=>item.isSource)||languages[0];
  const current=(key:string)=>active?(draft[key]??data?.texts[active.code]?.[key]??""):"";
  const rows=useMemo(()=>{
    if(!data||!active)return [];
    const term=query.trim().toLowerCase();
    return data.keys.filter(row=>{
      const own=data.texts[active.code]?.[row.key]||"",fallback=row.defaults[active.code]||"";
      if(onlyMissing&&(own||fallback))return false;
      return !term||[row.key,own,fallback,source?row.defaults[source.code]:""].some(value=>String(value||"").toLowerCase().includes(term));
    });
  },[data,active,query,onlyMissing,source]);
  const changed=Object.keys(draft).filter(key=>active&&draft[key]!==(data?.texts[active.code]?.[key]??""));
  const save=async()=>{
    if(!active||!changed.length)return;
    setBusy(true);setMessage("");
    try{
      const response=await fetch("/api/admin/ui-texts",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({texts:{[active.code]:Object.fromEntries(changed.map(key=>[key,draft[key]]))}})});
      const body=await response.json() as Payload&{error?:string};
      if(!response.ok)throw new Error(body.error||"تعذر حفظ النصوص");
      setData(body);setDraft({});setMessage(`تم حفظ ${changed.length} نص`);
    }catch(error){setMessage(error instanceof Error?error.message:"تعذر حفظ النصوص")}finally{setBusy(false)}
  };
  const missingCount=data&&active?data.keys.filter(row=>!data.texts[active.code]?.[row.key]&&!row.defaults[active.code]).length:0;

  return <section className="adminCard uiTextsPanel">
    <div className="uiTextsHead">
      <div><h2>نصوص الواجهة</h2><p className="adminHint">كل نص يظهر للزبون في المتجر. اترك الحقل فارغاً لاستخدام النص الافتراضي. اللغات تُدار من «الإعدادات».</p></div>
      <button type="button" disabled={busy||!changed.length} onClick={()=>void save()}>{busy?"جارٍ الحفظ...":`حفظ (${changed.length})`}</button>
    </div>
    {message&&<p className="uiTextsMessage" role="status">{message}</p>}
    {data&&<>
      <div className="uiTextsTools">
        <div role="group" aria-label="اللغة">{languages.map(item=><button type="button" key={item.code} aria-pressed={active?.code===item.code} onClick={()=>{if(changed.length&&!window.confirm("لديك تعديلات غير محفوظة. تجاهلها؟"))return;setDraft({});setLanguage(item.code)}}>{item.code} · {item.name}{item.enabled?"":" (غير مفعّلة)"}</button>)}</div>
        <input type="search" placeholder="ابحث بالمفتاح أو النص..." value={query} onChange={event=>setQuery(event.target.value)}/>
        <label><input type="checkbox" checked={onlyMissing} onChange={event=>setOnlyMissing(event.target.checked)}/> الناقصة فقط ({missingCount})</label>
      </div>
      <div className="uiTextsScroll"><table className="uiTextsTable">
        <thead><tr><th>المفتاح</th>{source&&active&&source.code!==active.code&&<th>{source.name}</th>}<th>النص الافتراضي</th><th>نص المتجر ({active?.code})</th><th></th></tr></thead>
        <tbody>{rows.slice(0,400).map(row=><tr key={row.key}>
          <td dir="ltr"><code>{row.key}</code></td>
          {source&&active&&source.code!==active.code&&<td dir={source.dir}>{data.texts[source.code]?.[row.key]||row.defaults[source.code]}</td>}
          <td dir={active?.dir}>{row.defaults[active?.code||""]||<em>— لا يوجد —</em>}</td>
          <td><textarea dir={active?.dir} rows={1} maxLength={2000} value={current(row.key)} placeholder={row.defaults[active?.code||""]||""} onChange={event=>setDraft(prev=>({...prev,[row.key]:event.target.value}))}/></td>
          <td>{current(row.key)&&<button type="button" className="secondary" onClick={()=>setDraft(prev=>({...prev,[row.key]:""}))}>افتراضي</button>}</td>
        </tr>)}</tbody>
      </table></div>
      {rows.length>400&&<p className="adminHint">يظهر أول 400 نتيجة من {rows.length}. استخدم البحث لتضييق النتائج.</p>}
    </>}
  </section>;
}
