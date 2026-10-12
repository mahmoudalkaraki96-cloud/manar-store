"use client";
import {useState} from "react";
import type {CatalogResponse} from "../catalog-types";
import SettingsPanel from "./SettingsPanel";
import PopupPanel from "./PopupPanel";
export default function ContentPanel({catalog,upload}:{catalog:CatalogResponse;upload:(file:File)=>Promise<string>}){
 const [section,setSection]=useState("slider");
 return <div className="contentEditor"><div className="editorIntro"><div><span className="sectionEyebrow">العروض والمحتوى</span><h2>جهّز واجهة متجرك</h2><p>رتّب الصور الرئيسية أو جهّز عرضًا منبثقًا للزوار.</p></div></div><div className="editorTabs" role="tablist" aria-label="أقسام العروض والمحتوى"><button type="button" role="tab" id="content-slider-tab" aria-controls="content-slider-panel" aria-selected={section==="slider"} onClick={()=>setSection("slider")}>السلايدر الرئيسي</button><button type="button" role="tab" id="content-popup-tab" aria-controls="content-popup-panel" aria-selected={section==="popup"} onClick={()=>setSection("popup")}>العرض المنبثق</button></div><div role="tabpanel" id="content-slider-panel" aria-labelledby="content-slider-tab" hidden={section!=="slider"}><SettingsPanel catalog={catalog} section="slider" upload={upload}/></div><div role="tabpanel" id="content-popup-panel" aria-labelledby="content-popup-tab" hidden={section!=="popup"}><PopupPanel upload={upload}/></div></div>;
}
