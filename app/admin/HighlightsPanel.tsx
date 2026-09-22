"use client";
import {useEffect,useState} from "react";
import type {Highlight} from "../storefront-types";

type Props={upload:(file:File,options?:{maxSize?:number;quality?:number})=>Promise<string>};
const empty=():Highlight=>({id:0,title:"",coverUrl:"",images:[],sortOrder:0,active:true});
async function request(path:string,method="GET",body?:unknown){
 const response=await fetch(path,{method,cache:"no-store",headers:body?{"content-type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined});
 const data=await response.json() as {error?:string;ok?:boolean;enabled?:boolean;highlights?:Highlight[]};
 if(!response.ok)throw new Error(data.error||"فشلت العملية");
 return data;
}
export default function HighlightsPanel({upload}:Props){
 const [items,setItems]=useState<Highlight[]>([]);
 const [enabled,setEnabled]=useState(true);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const refresh=async()=>{const data=await request("/api/admin/highlights");setItems(data.highlights||[]);setEnabled(data.enabled!==false)};
 useEffect(()=>{refresh().catch(error=>setMessage(error instanceof Error?error.message:"تعذر تحميل الهايلايتس")).finally(()=>setLoading(false))},[]);
 const edit=(index:number,patch:Partial<Highlight>)=>setItems(current=>current.map((item,i)=>i===index?{...item,...patch}:item));
 const perform=async(action:()=>Promise<void>,success:string)=>{setBusy(true);setMessage("");try{await action();await refresh();setMessage(success)}catch(error){setMessage(error instanceof Error?error.message:"فشلت العملية")}finally{setBusy(false)}};
 const save=(item:Highlight)=>perform(async()=>{await request(item.id?"/api/admin/highlights/"+item.id:"/api/admin/highlights",item.id?"PUT":"POST",item)},"تم حفظ الهايلايت");
 const addImages=async(index:number,files:FileList|null)=>{if(!files?.length)return;setBusy(true);setMessage("");try{
  const item=items[index],selected=Array.from(files);
  if(item.images.length+selected.length>20)throw new Error("الحد الأقصى 20 صورة لكل هايلايت");
  if(selected.some(file=>!file.type.startsWith("image/")))throw new Error("الملفات يجب أن تكون صورًا");
  const urls:string[]=new Array(selected.length);
  let cursor=0;
  await Promise.all(Array.from({length:Math.min(3,selected.length)},async()=>{while(cursor<selected.length){const position=cursor++;urls[position]=await upload(selected[position],{maxSize:1200,quality:.72})}}));
  edit(index,{images:[...item.images,...urls],imageNumbers:[...(item.imageNumbers||[]),...urls.map(()=>"بعد الحفظ")],coverUrl:item.coverUrl||urls[0]});
  setMessage("تم رفع الصور؛ اضغط حفظ الهايلايت لتظهر في المتجر");
 }catch(error){setMessage(error instanceof Error?error.message:"فشل رفع الصور")}finally{setBusy(false)}};
 const uploadCover=async(index:number,file:File|null)=>{if(!file)return;setBusy(true);setMessage("");try{
  if(!file.type.startsWith("image/"))throw new Error("الغلاف يجب أن يكون صورة");
  const url=await upload(file,{maxSize:480,quality:.7});
  edit(index,{coverUrl:url});setMessage("تم رفع الغلاف؛ اضغط حفظ الهايلايت");
 }catch(error){setMessage(error instanceof Error?error.message:"فشل رفع الغلاف")}finally{setBusy(false)}};
 const remove=(item:Highlight,index:number)=>{if(!window.confirm("حذف الهايلايت من المتجر؟"))return;void perform(async()=>{if(item.id)await request("/api/admin/highlights/"+item.id,"DELETE");else setItems(current=>current.filter((_,i)=>i!==index))},"تم حذف الهايلايت")};
 const move=(index:number,direction:number)=>{const other=index+direction;if(other<0||other>=items.length)return;void perform(async()=>{
  const reordered=[...items];[reordered[index],reordered[other]]=[reordered[other],reordered[index]];
  for(let i=0;i<reordered.length;i++){if(reordered[i].id)await request("/api/admin/highlights/"+reordered[i].id,"PUT",{...reordered[i],sortOrder:i})}
 },"تم ترتيب الهايلايتس")};
 if(loading)return <div className="dataPanel">جاري تحميل الهايلايتس...</div>;
 return <div className="dataPanel highlightsAdmin"><div className="panelHead"><div><h3>هايلايتس المتجر</h3><small>تظهر تحت الأقسام على كل صفحات المتجر.</small></div><button type="button" disabled={busy||items.length>=30} onClick={()=>setItems(current=>[...current,{...empty(),sortOrder:current.length}])}>＋ إضافة هايلايت</button></div>
 {message&&<p className="adminMessage" role="status">{message}</p>}
 <label className="highlightGlobalToggle"><span><b>إظهار صف الهايلايتس بالكامل</b><small>يمكن إخفاؤه دون حذف الهايلايتس أو صورها.</small></span><input type="checkbox" checked={enabled} disabled={busy} onChange={event=>{const value=event.target.checked;void perform(async()=>{await request("/api/admin/highlights/visibility","PUT",{enabled:value})},value?"تم إظهار الهايلايتس":"تم إخفاء الهايلايتس")}}/></label>
 {!items.length&&<p>لا توجد هايلايتس. أضف أول واحدة ثم ارفع صورها.</p>}
 {items.map((item,index)=><section key={item.id||"new-"+index} className="highlightAdminCard">
  <div className="highlightAdminHead"><b>{item.title||"هايلايت جديدة"}</b><div><button type="button" disabled={busy||index===0} onClick={()=>move(index,-1)} aria-label="تقديم الهايلايت">↑</button><button type="button" disabled={busy||index===items.length-1} onClick={()=>move(index,1)} aria-label="تأخير الهايلايت">↓</button><button type="button" disabled={busy} onClick={()=>remove(item,index)}>حذف</button></div></div>
  <div className="highlightAdminFields"><label>العنوان تحت الدائرة<input maxLength={60} value={item.title} onChange={event=>edit(index,{title:event.target.value})} placeholder="مثلاً: هدايا المناسبات"/></label>
  <label className="highlightItemToggle">إظهار هذه الهايلايت <input type="checkbox" checked={item.active} disabled={busy} onChange={event=>{const active=event.target.checked;edit(index,{active});if(item.id)void perform(async()=>{await request("/api/admin/highlights/"+item.id,"PUT",{...item,active})},"تم تحديث حالة الهايلايت")}}/></label></div>
  <label className="highlightImageUpload">إضافة صور إلى الهايلايت <input type="file" accept="image/*" multiple disabled={busy} onChange={event=>{void addImages(index,event.target.files);event.target.value=""}}/></label>
  <div className="highlightCoverField"><label className="highlightImageUpload">رفع غلاف مستقل <input type="file" accept="image/*" disabled={busy} onChange={event=>{void uploadCover(index,event.target.files?.[0]||null);event.target.value=""}}/></label>{item.coverUrl&&<img src={item.coverUrl} alt="معاينة غلاف الهايلايت" loading="lazy"/>}<small>يمكنك أيضًا اختيار أي صورة من الصور أدناه لتكون الغلاف.</small></div>
  <div className="highlightAdminImages">{item.images.map((url,imageIndex)=><div key={url+"-"+imageIndex} className="highlightAdminImage"><img src={url} alt="" loading="lazy"/><b className="highlightImageNumber">{item.imageNumbers?.[imageIndex]||"بعد الحفظ"}</b><div>
   <button type="button" disabled={busy||item.coverUrl===url} onClick={()=>edit(index,{coverUrl:url})}>{item.coverUrl===url?"الغلاف الحالي":"اجعلها الغلاف"}</button>
   <button type="button" disabled={busy||imageIndex===0} aria-label="الصورة السابقة في الترتيب" onClick={()=>{const images=[...item.images],imageNumbers=[...(item.imageNumbers||[])];[images[imageIndex-1],images[imageIndex]]=[images[imageIndex],images[imageIndex-1]];[imageNumbers[imageIndex-1],imageNumbers[imageIndex]]=[imageNumbers[imageIndex],imageNumbers[imageIndex-1]];edit(index,{images,imageNumbers})}}>↑</button>
   <button type="button" disabled={busy||imageIndex===item.images.length-1} aria-label="الصورة التالية في الترتيب" onClick={()=>{const images=[...item.images],imageNumbers=[...(item.imageNumbers||[])];[images[imageIndex+1],images[imageIndex]]=[images[imageIndex],images[imageIndex+1]];[imageNumbers[imageIndex+1],imageNumbers[imageIndex]]=[imageNumbers[imageIndex],imageNumbers[imageIndex+1]];edit(index,{images,imageNumbers})}}>↓</button>
   <button type="button" disabled={busy} onClick={()=>{const images=item.images.filter((_,i)=>i!==imageIndex),imageNumbers=item.imageNumbers?.filter((_,i)=>i!==imageIndex);edit(index,{images,imageNumbers,coverUrl:item.coverUrl===url?images[0]||"":item.coverUrl})}}>إزالة</button>
  </div></div>)}</div>
  <button className="mainBtn" type="button" disabled={busy||!item.title.trim()||!item.images.length} onClick={()=>void save(item)}>{busy?"جارٍ الحفظ...":"حفظ الهايلايت وصورها"}</button>
 </section>)}
 </div>;
}
