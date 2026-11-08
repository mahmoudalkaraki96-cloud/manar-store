"use client";
import {useEffect,useState} from "react";
import {securityFetch} from "./AdminAccess";
import {defaultTheme,type ThemeSettings} from "../../shared/store-theme";

type Option={id:string;label:string};
type ThemeResponse={theme:ThemeSettings;themes:Option[];radius:Option[]};

// Shown only to the platform admin; the server rejects everyone else as well.
export default function ThemePanel(){
 const [data,setData]=useState<ThemeResponse|null>(null),[theme,setTheme]=useState<ThemeSettings>(defaultTheme),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 useEffect(()=>{securityFetch("/api/admin/theme").then((body:ThemeResponse)=>{setData(body);setTheme(body.theme)}).catch(error=>setMessage(error instanceof Error?error.message:"تعذر تحميل الثيم"))},[]);
 const changed=Boolean(data)&&(theme.id!==data!.theme.id||theme.radius!==data!.theme.radius);
 const save=async()=>{setBusy(true);setMessage("");try{const body=await securityFetch("/api/admin/theme","PUT",theme) as {theme:ThemeSettings};setData(current=>current&&{...current,theme:body.theme});setTheme(body.theme);setMessage("تم حفظ الثيم؛ يظهر للزوار عند فتح الصفحة من جديد")}catch(error){setMessage(error instanceof Error?error.message:"تعذر حفظ الثيم")}finally{setBusy(false)}};
 return <div className="editorThemePanel">
  <div className="editorSectionHead"><h3>ثيم المتجر</h3><p>يظهر هذا القسم لمدير المنصة فقط، ولا يراه أصحاب المتاجر.</p></div>
  {!data?<p role="status">{message||"جاري تحميل الثيم…"}</p>:<><div className="editorFields">
   <label>الثيم<select value={theme.id} onChange={event=>setTheme({...theme,id:event.target.value as ThemeSettings["id"]})}>{data.themes.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
   <label>الزوايا<select value={theme.radius} onChange={event=>setTheme({...theme,radius:event.target.value as ThemeSettings["radius"]})}>{data.radius.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
  </div>
  <button type="button" className="primary" disabled={busy||!changed} onClick={()=>void save()}>{busy?"جاري الحفظ…":"حفظ الثيم"}</button>
  {message&&<p role="status">{message}</p>}</>}
 </div>;
}
