"use client";

import {MAX_STORE_LANGUAGES,StoreLanguageError,normalizeLanguageCode,validateStoreLanguages,type StoreLanguage} from "../../shared/store-languages";

/** Edits the store's language list (stored per store in store_languages). Saved with the rest of the settings. */
export default function StoreLanguagesEditor({value,onChange}:{value:StoreLanguage[];onChange:(next:StoreLanguage[])=>void}){
  const rows=value.map((item,index)=>({...item,sortOrder:index}));
  const update=(next:StoreLanguage[])=>onChange(next.map((item,index)=>({...item,sortOrder:index})));
  const edit=(index:number,patch:Partial<StoreLanguage>)=>update(rows.map((item,i)=>i===index?{...item,...patch}:item));
  const only=(index:number,key:"isDefault"|"isSource")=>update(rows.map((item,i)=>({...item,[key]:i===index,...(i===index?{enabled:true}:{})})));
  const move=(index:number,step:number)=>{const target=index+step;if(target<0||target>=rows.length)return;const next=[...rows];[next[index],next[target]]=[next[target],next[index]];update(next)};
  const remove=(index:number)=>update(rows.filter((_,i)=>i!==index));
  const add=()=>update([...rows,{code:"",name:"",dir:"ltr",enabled:false,isDefault:false,isSource:false,sortOrder:rows.length}]);
  let problem="";
  try{validateStoreLanguages(rows)}catch(error){problem=error instanceof StoreLanguageError?error.message:"قائمة اللغات غير صالحة"}

  return <fieldset className="editorWide adminLanguages">
    <legend>لغات واجهة المتجر</legend>
    <p className="adminHint">اللغة الافتراضية تظهر للزائر أول مرة. لغة المحتوى الأساسية هي لغة أسماء المنتجات والأقسام كما تكتبها في المحرر؛ باقي اللغات المفعّلة تظهر لها حقول ترجمة.</p>
    <div className="adminLanguagesScroll">
      <table className="adminLanguagesTable">
        <thead><tr><th>الرمز</th><th>الاسم</th><th>الاتجاه</th><th>مفعّلة</th><th>افتراضية</th><th>المحتوى الأساسي</th><th>الترتيب</th><th></th></tr></thead>
        <tbody>{rows.map((item,index)=><tr key={index}>
          <td><input aria-label="رمز اللغة" dir="ltr" maxLength={8} placeholder="FR" value={item.code} onChange={event=>edit(index,{code:normalizeLanguageCode(event.target.value)})}/></td>
          <td><input aria-label="اسم اللغة" dir="auto" maxLength={40} placeholder="Français" value={item.name} onChange={event=>edit(index,{name:event.target.value})}/></td>
          <td><select aria-label="اتجاه الكتابة" value={item.dir} onChange={event=>edit(index,{dir:event.target.value==="rtl"?"rtl":"ltr"})}><option value="rtl">من اليمين لليسار</option><option value="ltr">من اليسار لليمين</option></select></td>
          <td><input type="checkbox" aria-label="مفعّلة" checked={item.enabled} disabled={item.isDefault||item.isSource} onChange={event=>edit(index,{enabled:event.target.checked})}/></td>
          <td><input type="radio" name="store-language-default" aria-label="افتراضية" checked={item.isDefault} onChange={()=>only(index,"isDefault")}/></td>
          <td><input type="radio" name="store-language-source" aria-label="لغة المحتوى الأساسية" checked={item.isSource} onChange={()=>only(index,"isSource")}/></td>
          <td className="adminLanguagesOrder"><button type="button" aria-label="أعلى" disabled={index===0} onClick={()=>move(index,-1)}>▲</button><button type="button" aria-label="أسفل" disabled={index===rows.length-1} onClick={()=>move(index,1)}>▼</button></td>
          <td><button type="button" className="danger" disabled={item.isDefault||item.isSource} onClick={()=>remove(index)}>حذف</button></td>
        </tr>)}</tbody>
      </table>
    </div>
    <button type="button" disabled={rows.length>=MAX_STORE_LANGUAGES} onClick={add}>+ إضافة لغة</button>
    {problem&&<p className="adminLanguagesError" role="alert">{problem}</p>}
  </fieldset>;
}
