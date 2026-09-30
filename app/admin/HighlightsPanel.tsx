"use client";
import {useEffect,useMemo,useState} from "react";
import type {Highlight} from "../storefront-types";

type Props={upload:(file:File,options?:{maxSize?:number;quality?:number})=>Promise<string>};
const isVideo=(url:string)=>/\.(mp4|webm)(?:\?|$)/i.test(url);
const empty=():Highlight=>({id:0,title:"",coverUrl:"",images:[],sortOrder:0,active:true});
const MAX_HIGHLIGHTS=100,MAX_MEDIA=200,MAX_VIDEO_BYTES=50_000_000;
type ImportReport={title:string;total:number;uploaded:number;reused:number;status:"تم"|"تخطي"|"فشل";error?:string};
const directoryPickerProps={"webkitdirectory":"","directory":""} as Record<string,string>;
const fileKey=(root:string,file:File)=>root+"|"+file.webkitRelativePath+"|"+file.size+"|"+file.lastModified;
const supportedFile=(file:File)=>file.type.startsWith("image/")||["video/mp4","video/webm"].includes(file.type);
async function request(path:string,method="GET",body?:unknown){
 const controller=new AbortController(),timeout=window.setTimeout(()=>controller.abort(),20000);
 try{
  const response=await fetch(path,{method,cache:"no-store",signal:controller.signal,headers:body?{"content-type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined});
  const data=await response.json() as {error?:string;ok?:boolean;enabled?:boolean;intervalMs?:number;highlights?:Highlight[]};
  if(!response.ok)throw new Error(data.error||"فشلت العملية");
  return data;
 }catch(error){
  if(error instanceof DOMException&&error.name==="AbortError")throw new Error("انتهت مهلة الطلب. حاول مرة أخرى");
  throw error;
 }finally{window.clearTimeout(timeout)}
}
export default function HighlightsPanel({upload}:Props){
 const [items,setItems]=useState<Highlight[]>([]);
 const [enabled,setEnabled]=useState(true);
 const [intervalMs,setIntervalMs]=useState(5000);
 const [loading,setLoading]=useState(true);
 const [busyAction,setBusyAction]=useState<string|null>(null);
 const busy=busyAction!==null;
 const [message,setMessage]=useState("");
 const [importProgress,setImportProgress]=useState({done:0,total:0,current:""});
 const [importReport,setImportReport]=useState<ImportReport[]>([]);
 const [importing,setImporting]=useState(false);
 const reportSummary=useMemo(()=>({done:importReport.filter(row=>row.status==="تم").length,failed:importReport.filter(row=>row.status==="فشل").length,skipped:importReport.filter(row=>row.status==="تخطي").length}),[importReport]);
 const refresh=async()=>{const data=await request("/api/admin/highlights");setItems(data.highlights||[]);setEnabled(data.enabled!==false);setIntervalMs(data.intervalMs||5000)};
 useEffect(()=>{refresh().catch(error=>setMessage(error instanceof Error?error.message:"تعذر تحميل الهايلايتس")).finally(()=>setLoading(false))},[]);
 const edit=(index:number,patch:Partial<Highlight>)=>setItems(current=>current.map((item,i)=>i===index?{...item,...patch}:item));
 const perform=async(action:()=>Promise<void>,success:string,actionKey="global",refreshAfter=true)=>{setBusyAction(actionKey);setMessage("");try{await action();if(refreshAfter)await refresh();setMessage(success)}catch(error){setMessage(error instanceof Error?error.message:"فشلت العملية")}finally{setBusyAction(null)}};
 const save=(item:Highlight,index:number)=>perform(async()=>{if(!item.coverUrl||isVideo(item.coverUrl))throw new Error("ارفع غلافًا بصورة أو اختر صورة من الهايلايت");await request(item.id?"/api/admin/highlights/"+item.id:"/api/admin/highlights",item.id?"PUT":"POST",item)},"تم حفظ الهايلايت","save-"+(item.id||index));
 const addImages=async(index:number,files:FileList|File[]|null)=>{if(!files?.length)return;setBusyAction("upload-images-"+index);setMessage("");try{
  const item=items[index],selected=Array.from(files);
  if(item.images.length+selected.length>MAX_MEDIA)throw new Error("الحد الأقصى "+MAX_MEDIA+" صورة أو فيديو لكل هايلايت");
  if(selected.some(file=>!file.type.startsWith("image/")&&!["video/mp4","video/webm"].includes(file.type)))throw new Error("يدعم الهايلايت الصور وفيديو MP4 أو WebM فقط");
  if(selected.some(file=>file.type.startsWith("video/")&&file.size>MAX_VIDEO_BYTES))throw new Error("حجم كل فيديو يجب ألا يتجاوز 50MB");
  const urls:string[]=new Array(selected.length);
  let cursor=0;
  await Promise.all(Array.from({length:Math.min(3,selected.length)},async()=>{while(cursor<selected.length){const position=cursor++;urls[position]=await upload(selected[position],{maxSize:1200,quality:.72})}}));
  edit(index,{images:[...item.images,...urls],imageNumbers:[...(item.imageNumbers||[]),...urls.map(()=>"بعد الحفظ")],coverUrl:item.coverUrl||urls.find(url=>!isVideo(url))||""});
  setMessage("تم رفع الملفات؛ اضغط حفظ الهايلايت لتظهر في المتجر");
 }catch(error){setMessage(error instanceof Error?error.message:"فشل رفع الصور")}finally{setBusyAction(null)}};
 const importFolders=async(files:FileList|null)=>{
  if(!files?.length||importing)return;
  const all=Array.from(files).filter(supportedFile),paths=all.map(file=>file.webkitRelativePath.split("/").filter(Boolean)),root=paths[0]?.[0]||"highlights";
  const groups=new Map<string,File[]>();
  all.forEach((file,index)=>{const parts=paths[index];if(parts.length<3)return;const title=parts[1].trim().slice(0,60);if(!title)return;groups.set(title,[...(groups.get(title)||[]),file])});
  if(!groups.size){setMessage("اختر المجلد الرئيسي الذي يحتوي بداخله مجلدًا مستقلًا لكل هايلايت");return}
  if(groups.size>MAX_HIGHLIGHTS){setMessage("عدد المجلدات يتجاوز "+MAX_HIGHLIGHTS+" هايلايت");return}
  const oversized=[...groups].find(([,group])=>group.length>MAX_MEDIA);
  if(oversized){setMessage("مجلد «"+oversized[0]+"» يحتوي أكثر من "+MAX_MEDIA+" ملف");return}
  const badVideo=all.find(file=>file.type.startsWith("video/")&&file.size>MAX_VIDEO_BYTES);
  if(badVideo){setMessage("الفيديو «"+badVideo.name+"» أكبر من 50MB");return}
  if(!window.confirm("سيتم إنشاء أو تحديث "+groups.size+" هايلايت ورفع "+all.length+" ملف. أبقِ الصفحة مفتوحة حتى اكتمال التقرير. هل نبدأ؟"))return;
  setImporting(true);setBusyAction("bulk-import");setMessage("");setImportReport([]);setImportProgress({done:0,total:all.length,current:""});
  const cacheName="manar-highlight-folder-import-v1",cache=JSON.parse(localStorage.getItem(cacheName)||"{}") as Record<string,string>;
  const rows:ImportReport[]=[];let completed=0;
  try{
   const existingData=await request("/api/admin/highlights"),existing=existingData.highlights||[];
   for(const [title,unsorted] of groups){
    const filesInGroup=[...unsorted].sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:"base"})||a.lastModified-b.lastModified);
    const imageFiles=filesInGroup.filter(file=>file.type.startsWith("image/"));
    if(!imageFiles.length){rows.push({title,total:filesInGroup.length,uploaded:0,reused:0,status:"فشل",error:"لا توجد صورة تصلح غلافًا"});setImportReport([...rows]);completed+=filesInGroup.length;continue}
    setImportProgress({done:completed,total:all.length,current:title});
    try{
     const urls:string[]=new Array(filesInGroup.length);let cursor=0,uploaded=0,reused=0;
     await Promise.all(Array.from({length:Math.min(3,filesInGroup.length)},async()=>{while(cursor<filesInGroup.length){const position=cursor++,file=filesInGroup[position],key=fileKey(root,file),saved=cache[key];if(saved){urls[position]=saved;reused++}else{urls[position]=await upload(file,{maxSize:1200,quality:.72});cache[key]=urls[position];localStorage.setItem(cacheName,JSON.stringify(cache));uploaded++}completed++;setImportProgress({done:completed,total:all.length,current:title})}}));
     const prior=existing.find(item=>item.title.trim()===title),merged=prior?[...prior.images,...urls.filter(url=>!prior.images.includes(url))]:urls;
     if(merged.length>MAX_MEDIA)throw new Error("المجموع بعد الدمج يتجاوز "+MAX_MEDIA+" ملف");
     const coverNamed=filesInGroup.findIndex(file=>file.type.startsWith("image/")&&/^cover(?:\.|[-_ ])/i.test(file.name)),newCover=urls[coverNamed>=0?coverNamed:filesInGroup.findIndex(file=>file.type.startsWith("image/"))];
     await request(prior?"/api/admin/highlights/"+prior.id:"/api/admin/highlights",prior?"PUT":"POST",{...(prior||empty()),title,images:merged,coverUrl:prior?.coverUrl||newCover,sortOrder:prior?.sortOrder??existing.length+rows.length,active:prior?.active!==false});
     rows.push({title,total:filesInGroup.length,uploaded,reused,status:"تم"});setImportReport([...rows]);
    }catch(error){rows.push({title,total:filesInGroup.length,uploaded:0,reused:0,status:"فشل",error:error instanceof Error?error.message:"فشل غير معروف"});setImportReport([...rows])}
   }
   await refresh();setMessage("اكتمل الاستيراد: "+rows.filter(row=>row.status==="تم").length+" ناجح، "+rows.filter(row=>row.status==="فشل").length+" بحاجة للمراجعة");
  }finally{setImporting(false);setBusyAction(null);setImportProgress(current=>({...current,current:""}))}
 };
 const downloadReport=()=>{const lines=[["الهايلايت","عدد الملفات","رُفع الآن","استُكمل","الحالة","الملاحظة"],...importReport.map(row=>[row.title,row.total,row.uploaded,row.reused,row.status,row.error||""])];const csv="\uFEFF"+lines.map(row=>row.map(value=>'"'+String(value).replaceAll('"','""')+'"').join(",")).join("\n"),url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"})),link=document.createElement("a");link.href=url;link.download="highlight-import-report.csv";link.click();URL.revokeObjectURL(url)};
 const pastedImages=(event:React.ClipboardEvent<HTMLElement>)=>Array.from(event.clipboardData.items).filter(item=>item.type.startsWith("image/")).map(item=>item.getAsFile()).filter((file):file is File=>Boolean(file));
 const uploadCover=async(index:number,file:File|null)=>{if(!file)return;setBusyAction("upload-cover-"+index);setMessage("");try{
  if(!file.type.startsWith("image/"))throw new Error("الغلاف يجب أن يكون صورة");
  const url=await upload(file,{maxSize:480,quality:.7});
  edit(index,{coverUrl:url});setMessage("تم رفع الغلاف؛ اضغط حفظ الهايلايت");
 }catch(error){setMessage(error instanceof Error?error.message:"فشل رفع الغلاف")}finally{setBusyAction(null)}};
 const remove=(item:Highlight,index:number)=>{if(!window.confirm("حذف الهايلايت من المتجر؟"))return;void perform(async()=>{if(item.id)await request("/api/admin/highlights/"+item.id,"DELETE");setItems(current=>current.filter((candidate,i)=>item.id?candidate.id!==item.id:i!==index))},"تم حذف الهايلايت","delete-"+(item.id||index),false)};
 const move=(index:number,direction:number)=>{const other=index+direction;if(other<0||other>=items.length)return;void perform(async()=>{
  const reordered=[...items];[reordered[index],reordered[other]]=[reordered[other],reordered[index]];
  for(let i=0;i<reordered.length;i++){if(reordered[i].id)await request("/api/admin/highlights/"+reordered[i].id,"PUT",{...reordered[i],sortOrder:i})}
 },"تم ترتيب الهايلايتس")};
 if(loading)return <div className="dataPanel">جاري تحميل الهايلايتس...</div>;
 return <div className="dataPanel highlightsAdmin"><div className="panelHead"><div><h3>هايلايتس المتجر</h3><small>تظهر تحت الأقسام على كل صفحات المتجر.</small></div><button type="button" disabled={busy||items.length>=MAX_HIGHLIGHTS} onClick={()=>setItems(current=>[...current,{...empty(),sortOrder:current.length}])}>＋ إضافة هايلايت</button></div>
 {message&&<p className="adminMessage" role="status">{message}</p>}
 <section className="highlightBulkImport"><div><b>استيراد مجلدات الهايلايت دفعة واحدة</b><small>اختر المجلد الرئيسي؛ اسم كل مجلد داخله يصبح عنوان الهايلايت. تُضغط الصور إلى WebP، وتُرقّم تلقائيًا بعد الحفظ، ويمكن استكمال الرفع إذا انقطع.</small></div><label className="mainBtn">{importing?"جارٍ الاستيراد...":"اختيار المجلد وبدء الاستيراد"}<input type="file" multiple accept="image/*,video/mp4,video/webm" disabled={busy} {...directoryPickerProps} onChange={event=>{void importFolders(event.target.files);event.target.value=""}}/></label>
 {importing&&<div className="highlightImportProgress"><progress max={Math.max(1,importProgress.total)} value={importProgress.done}/><span>{importProgress.done} / {importProgress.total}{importProgress.current?" — "+importProgress.current:""}</span></div>}
 {!!importReport.length&&<div className="highlightImportReport"><p>النتيجة: {reportSummary.done} ناجح، {reportSummary.failed} فاشل، {reportSummary.skipped} متخطى.</p><button type="button" onClick={downloadReport}>تنزيل التقرير CSV</button><div>{importReport.map(row=><small key={row.title} className={row.status==="فشل"?"failed":""}>{row.title}: {row.status}{row.error?" — "+row.error:""}</small>)}</div></div>}
 </section>
 <label className="highlightGlobalToggle"><span><b>إظهار صف الهايلايتس بالكامل</b><small>يمكن إخفاؤه دون حذف الهايلايتس أو صورها.</small></span><input type="checkbox" checked={enabled} disabled={busy} onChange={event=>{const value=event.target.checked;void perform(async()=>{await request("/api/admin/highlights/visibility","PUT",{enabled:value})},value?"تم إظهار الهايلايتس":"تم إخفاء الهايلايتس")}}/></label>
 <div className="highlightDuration"><div><b>مدة عرض صور الهايلايت</b><small>تحدد سرعة امتلاء الخط للصور؛ الفيديو ينتقل عند انتهائه.</small></div><select aria-label="مدة عرض الصورة" value={intervalMs} disabled={busy} onChange={event=>{const value=Number(event.target.value);void perform(async()=>{await request("/api/admin/highlights/duration","PUT",{intervalMs:value})},"تم تحديث مدة الهايلايت")}}>{[2000,3000,4000,5000,6000,8000,10000,15000,20000].map(value=><option key={value} value={value}>{value/1000} ثوانٍ</option>)}</select></div>
 {!items.length&&<p>لا توجد هايلايتس. أضف أول واحدة ثم ارفع صورها أو فيديوهاتها.</p>}
 {items.map((item,index)=><section key={item.id||"new-"+index} className="highlightAdminCard">
  <div className="highlightAdminHead"><b>{item.title||"هايلايت جديدة"}</b><div><button type="button" disabled={busy||index===0} onClick={()=>move(index,-1)} aria-label="تقديم الهايلايت">↑</button><button type="button" disabled={busy||index===items.length-1} onClick={()=>move(index,1)} aria-label="تأخير الهايلايت">↓</button><button type="button" disabled={busy} onClick={()=>remove(item,index)}>{busyAction==="delete-"+(item.id||index)?"جارٍ الحذف...":"حذف"}</button></div></div>
  <div className="highlightAdminFields"><label>العنوان تحت الدائرة<input maxLength={60} value={item.title} onChange={event=>edit(index,{title:event.target.value})} placeholder="مثلاً: هدايا المناسبات"/></label>
  <label className="highlightItemToggle">إظهار هذه الهايلايت <input type="checkbox" checked={item.active} disabled={busy} onChange={event=>{const active=event.target.checked;edit(index,{active});if(item.id)void perform(async()=>{await request("/api/admin/highlights/"+item.id,"PUT",{...item,active})},"تم تحديث حالة الهايلايت")}}/></label></div>
  <label className="highlightImageUpload" tabIndex={0} onPaste={event=>{const files=pastedImages(event);if(files.length){event.preventDefault();void addImages(index,files)}}}>إضافة صور أو فيديوهات إلى الهايلايت (MP4 أو WebM، حتى 50MB للفيديو) — يمكن لصق الصور بـ Ctrl + V <input type="file" accept="image/*,video/mp4,video/webm" multiple disabled={busy} onChange={event=>{void addImages(index,event.target.files);event.target.value=""}}/></label>
  <div className="highlightCoverField"><label className="highlightImageUpload" tabIndex={0} onPaste={event=>{const file=pastedImages(event)[0];if(file){event.preventDefault();void uploadCover(index,file)}}}>رفع غلاف مستقل — يمكن لصقه بـ Ctrl + V <input type="file" accept="image/*" disabled={busy} onChange={event=>{void uploadCover(index,event.target.files?.[0]||null);event.target.value=""}}/></label>{item.coverUrl&&<img src={item.coverUrl} alt="معاينة غلاف الهايلايت" loading="lazy"/>}<small>يمكنك أيضًا اختيار أي صورة من الصور أدناه لتكون الغلاف.</small></div>
  <div className="highlightAdminImages">{item.images.map((url,imageIndex)=><div key={url+"-"+imageIndex} className="highlightAdminImage">{isVideo(url)?<span className="highlightAdminVideo">▶ فيديو</span>:<img src={url} alt="" loading="lazy"/>}<b className="highlightImageNumber">{item.imageNumbers?.[imageIndex]||"بعد الحفظ"}</b><div>
   {!isVideo(url)&&<button type="button" disabled={busy||item.coverUrl===url} onClick={()=>edit(index,{coverUrl:url})}>{item.coverUrl===url?"الغلاف الحالي":"اجعلها الغلاف"}</button>}
   <button type="button" disabled={busy||imageIndex===0} aria-label="الصورة السابقة في الترتيب" onClick={()=>{const images=[...item.images],imageNumbers=[...(item.imageNumbers||[])];[images[imageIndex-1],images[imageIndex]]=[images[imageIndex],images[imageIndex-1]];[imageNumbers[imageIndex-1],imageNumbers[imageIndex]]=[imageNumbers[imageIndex],imageNumbers[imageIndex-1]];edit(index,{images,imageNumbers})}}>↑</button>
   <button type="button" disabled={busy||imageIndex===item.images.length-1} aria-label="الصورة التالية في الترتيب" onClick={()=>{const images=[...item.images],imageNumbers=[...(item.imageNumbers||[])];[images[imageIndex+1],images[imageIndex]]=[images[imageIndex],images[imageIndex+1]];[imageNumbers[imageIndex+1],imageNumbers[imageIndex]]=[imageNumbers[imageIndex],imageNumbers[imageIndex+1]];edit(index,{images,imageNumbers})}}>↓</button>
   <button type="button" disabled={busy} onClick={()=>{const images=item.images.filter((_,i)=>i!==imageIndex),imageNumbers=item.imageNumbers?.filter((_,i)=>i!==imageIndex);edit(index,{images,imageNumbers,coverUrl:item.coverUrl===url?images.find(value=>!isVideo(value))||"":item.coverUrl})}}>إزالة</button>
  </div></div>)}</div>
  <button className="mainBtn" type="button" disabled={busy||!item.title.trim()||!item.images.length||!item.coverUrl||isVideo(item.coverUrl)} onClick={()=>void save(item,index)}>{busyAction==="save-"+(item.id||index)?"جارٍ الحفظ...":"حفظ الهايلايت وملفاته"}</button>
 </section>)}
 </div>;
}
