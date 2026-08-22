"use client";
import {useEffect,useState} from "react";
import {categoryData,products as seed,Product,Variant} from "../catalog";
type Slide={id:number;image:string;mobileImage?:string;focus:"center"|"right"|"left";linkType:"product"|"category"|"offers"|"none";target:string;active:boolean};
type Settings={name:string;logo:string;logoImage:string;primary:string;accent:string;bg:string;whatsapp:string;facebook:string;instagram:string;tiktok:string;slider:boolean;sliderInterval:number;slides:Slide[];popup:boolean;offers:boolean;bests:boolean;ratings:boolean;categoryBlocks:boolean};
const defaultSlides:Slide[]=[{id:1,image:"https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1600&q=82",focus:"center",linkType:"category",target:"giveaways",active:true},{id:2,image:"https://images.unsplash.com/photo-1513883049090-d0b7439799bf?auto=format&fit=crop&w=1600&q=82",focus:"center",linkType:"category",target:"wrapping",active:true},{id:3,image:"https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=1600&q=82",focus:"center",linkType:"category",target:"gifts",active:true}];
const defaults:Settings={name:"Manar Store",logo:"MANAR",logoImage:"",primary:"#b85f7d",accent:"#d7a46d",bg:"#fff8fb",whatsapp:"",facebook:"",instagram:"",tiktok:"",slider:true,sliderInterval:4500,slides:defaultSlides,popup:true,offers:true,bests:true,ratings:true,categoryBlocks:true};
const emptyProduct:Product={id:0,name:"",category:categoryData[0].name,price:0,icon:"✦",color:"#e7e2d8",description:"",views:0,orders:0,rating:5,variants:[]};
const modules=["نظرة عامة","الطلبات","المنتجات","الأقسام","المتغيرات والمخزون","المشتريات والموردون","الزبائن","العروض والمحتوى","التقييمات","المستخدمون والصلاحيات","التقارير","الإعدادات","سجل العمليات"];
const readFile=(file:File,done:(v:string)=>void)=>{const r=new FileReader();r.onload=()=>{const img=new Image();img.onload=()=>{const max=1200,scale=Math.min(1,max/Math.max(img.width,img.height)),canvas=document.createElement("canvas");canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext("2d")?.drawImage(img,0,0,canvas.width,canvas.height);done(canvas.toDataURL("image/webp",.76))};img.src=String(r.result)};r.readAsDataURL(file)};
export default function Admin(){
 const [tab,setTab]=useState("نظرة عامة"),[settings,setSettings]=useState(defaults),[items,setItems]=useState<Product[]>(seed),[editing,setEditing]=useState<Product|null>(null),[saved,setSaved]=useState(false);
 useEffect(()=>{try{const a=localStorage.getItem("manar_settings"),b=localStorage.getItem("manar_products");if(a)setSettings({...defaults,...JSON.parse(a)});if(b){const saved:Product[]=JSON.parse(b),list=[...saved,...seed.filter(p=>!saved.some(x=>x.id===p.id))];setItems(list.map((x:Product)=>({...x,image:x.image||seed.find(y=>y.id===x.id)?.image,variantName:x.variantName||seed.find(y=>y.id===x.id)?.variantName,variantDisplay:x.variantDisplay||seed.find(y=>y.id===x.id)?.variantDisplay})))}}catch{}},[]);
 const persistItems=(next:Product[])=>{setItems(next);localStorage.setItem("manar_products",JSON.stringify(next))};
 const saveProduct=()=>{if(!editing||!editing.name.trim()||editing.price<0)return;const id=editing.id||Math.max(1000,...items.map(x=>x.id))+1;const ready={...editing,id};persistItems(items.some(x=>x.id===id)?items.map(x=>x.id===id?ready:x):[ready,...items]);setEditing(null)};
 const remove=(id:number)=>{if(confirm("حذف الصنف؟"))persistItems(items.filter(x=>x.id!==id))};
 const saveSettings=()=>{localStorage.setItem("manar_settings",JSON.stringify(settings));setSaved(true);setTimeout(()=>setSaved(false),1600)};
 const reset=()=>{setSettings(defaults);localStorage.setItem("manar_settings",JSON.stringify(defaults))};
 const addVariant=()=>setEditing(p=>p?({...p,variants:[...(p.variants||[]),{name:"خيار جديد",sku:"SKU-"+Date.now(),displayType:"text",stock:0}]}):p);
 const updateVariant=(i:number,k:keyof Variant,v:string|number)=>setEditing(p=>p?({...p,variants:(p.variants||[]).map((x,n)=>n===i?({...x,[k]:v}):x)}):p);
 const updateSlide=(i:number,patch:Partial<Slide>)=>setSettings(s=>({...s,slides:s.slides.map((x,n)=>n===i?{...x,...patch}:x)}));
 const moveSlide=(i:number,dir:-1|1)=>setSettings(s=>{const n=[...s.slides],to=i+dir;if(to<0||to>=n.length)return s;[n[i],n[to]]=[n[to],n[i]];return {...s,slides:n}});
 return <main className="adminShell" style={{"--green":settings.primary,"--gold":settings.accent} as React.CSSProperties}>
  <aside className="adminSide">
<a className="brand" href="/">{settings.logoImage?<img src={settings.logoImage} alt="الشعار"/>:<b>{settings.logo}</b>}<small>ADMIN</small>
</a>{modules.map(x=>
<button key={x} className={tab===x?"active":""} onClick={()=>setTab(x)}>{x}</button>)}</aside>
  <section className="adminMain">
<div className="adminTop">
<div>
<small>إدارة المتجر</small>
<h1>{tab}</h1>
</div>
<a href="/">فتح المتجر ←</a>
</div>
  {tab==="نظرة عامة"&&<>
<div className="stats">
<div>
<small>الطلبات اليوم</small>
<b>18</b>
</div>
<div>
<small>المبيعات</small>
<b>3,420 ₪</b>
</div>
<div>
<small>الأصناف</small>
<b>{items.length}</b>
</div>
<div>
<small>المتغيرات</small>
<b>{items.reduce((n,p)=>n+(p.variants?.length||0),0)}</b>
</div>
</div>
<div className="adminCards">
<div>
<h3>طلبات حديثة</h3>{["ORD-000128","ORD-000127","ORD-000126"].map((x,i)=>
<p key={x}>
<b>{x}</b>
<span>{220+i*85} ₪</span>
<em>قيد التجهيز</em>
</p>)}</div>
<div>
<h3>اختصارات</h3>
<button onClick={()=>{setTab("المنتجات");setEditing({...emptyProduct})}}>إضافة صنف</button>
<button onClick={()=>setTab("الإعدادات")}>تخصيص المتجر</button>
</div>
</div>
</>}
  {tab==="المنتجات"&&<div className="dataPanel">
<div className="panelHead">
<h3>الأصناف ({items.length})</h3>
<button onClick={()=>setEditing({...emptyProduct,variants:[]})}>＋ صنف جديد</button>
</div>
<div className="adminSearch">
<input placeholder="ابحث باسم أو رقم الصنف..."/>
</div>
<table>
<thead>
<tr>
<th>الصورة</th>
<th>الرقم</th>
<th>الصنف</th>
<th>القسم</th>
<th>البيع</th>
<th>الجملة</th>
<th>المتغيرات</th>
<th>
</th>
</tr>
</thead>
<tbody>{items.map(p=>
<tr key={p.id}>
<td>{p.image?<img className="tableImage" src={p.image}/>:<i className="tableIcon" style={{background:p.color}}>{p.icon}</i>}</td>
<td>#{p.id}</td>
<td>{p.name}</td>
<td>{p.category}</td>
<td>{p.price} ₪</td>
<td>{p.wholesale==null?"—":p.wholesale+" ₪"}</td>
<td>{p.variants?.length||0}</td>
<td>
<button className="editBtn" onClick={()=>setEditing({...p,variants:(p.variants||[]).map(v=>({...v}))})}>تعديل</button>
<button className="deleteBtn" onClick={()=>remove(p.id)}>حذف</button>
</td>
</tr>)}</tbody>
</table>
</div>}
  {tab==="الأقسام"&&<div className="dataPanel">
<div className="panelHead">
<h3>الأقسام</h3>
<button>＋ قسم جديد</button>
</div>
<div className="categoryAdmin">{categoryData.map(c=>
<div key={c.slug}>
<i>{c.icon}</i>
<b>{c.name}</b>
<small>{c.subs.join(" • ")||"بدون أقسام فرعية"}</small>
<button>تعديل</button>
</div>)}</div>
</div>}
  {tab==="الإعدادات"&&<div className="settingsGrid">
<div className="dataPanel">
<h3>هوية المتجر</h3>
<label>اسم المتجر<input value={settings.name} onChange={e=>setSettings({...settings,name:e.target.value})}/>
</label>
<label>نص الشعار<input value={settings.logo} onChange={e=>setSettings({...settings,logo:e.target.value})}/>
</label>
<label className="uploadBox">رفع صورة الشعار<input type="file" accept="image/*" onChange={e=>e.target.files?.[0]&&readFile(e.target.files[0],logoImage=>setSettings({...settings,logoImage}))}/>{settings.logoImage&&<img src={settings.logoImage}/>}</label>
<div className="colors">
<label>الرئيسي<input type="color" value={settings.primary} onChange={e=>setSettings({...settings,primary:e.target.value})}/>
<input value={settings.primary} onChange={e=>setSettings({...settings,primary:e.target.value})}/>
</label>
<label>المساعد<input type="color" value={settings.accent} onChange={e=>setSettings({...settings,accent:e.target.value})}/>
<input value={settings.accent} onChange={e=>setSettings({...settings,accent:e.target.value})}/>
</label>
<label>الخلفية<input type="color" value={settings.bg} onChange={e=>setSettings({...settings,bg:e.target.value})}/>
<input value={settings.bg} onChange={e=>setSettings({...settings,bg:e.target.value})}/>
</label>
</div>
<h3>روابط التواصل</h3>{(["whatsapp","facebook","instagram","tiktok"] as const).map(k=>
<label key={k}>{k}<input value={settings[k]} onChange={e=>setSettings({...settings,[k]:e.target.value})}/>
</label>)}</div>
<div className="dataPanel">
<h3>محتوى الرئيسية</h3>{(["slider","popup","offers","bests","ratings","categoryBlocks"] as const).map(k=>
<label className="roleLine" key={k}>
<span>{{slider:"السلايدر",popup:"النافذة المنبثقة",offers:"العروض",bests:"الأكثر طلباً",ratings:"الأعلى تقييماً",categoryBlocks:"أقسام الصفحة"}[k]}</span>
<input type="checkbox" checked={settings[k]} onChange={e=>setSettings({...settings,[k]:e.target.checked})}/>
</label>)}
<div className="sliderAdmin">
<div className="sliderAdminHead"><div><h3>إدارة السلايدر</h3><small>الصورة الأساسية إجبارية، وصورة الهاتف اختيارية.</small></div><button onClick={()=>setSettings({...settings,slides:[...settings.slides,{id:Date.now(),image:"",focus:"center",linkType:"none",target:"",active:true}]})}>＋ سلايد</button></div>
<label className="sliderSpeed">مدة الانتقال التلقائي<select value={settings.sliderInterval} onChange={e=>setSettings({...settings,sliderInterval:+e.target.value})}><option value={3000}>3 ثوانٍ</option><option value={4500}>4.5 ثوانٍ</option><option value={6000}>6 ثوانٍ</option><option value={8000}>8 ثوانٍ</option></select></label>
{settings.slides.map((x,i)=><div className="slideEditor" key={x.id}>
 <div className="slideEditorTop"><b>سلايد {i+1}</b><label>فعّال <input type="checkbox" checked={x.active} onChange={e=>updateSlide(i,{active:e.target.checked})}/></label><span><button onClick={()=>moveSlide(i,-1)}>↑</button><button onClick={()=>moveSlide(i,1)}>↓</button><button className="deleteBtn" onClick={()=>setSettings({...settings,slides:settings.slides.filter((_,n)=>n!==i)})}>حذف</button></span></div>
 <div className="slideFields"><label className="uploadBox">الصورة الأساسية<input type="file" accept="image/*" onChange={e=>e.target.files?.[0]&&readFile(e.target.files[0],image=>updateSlide(i,{image}))}/>{x.image&&<img src={x.image}/>}</label><label className="uploadBox">صورة الهاتف — اختياري<input type="file" accept="image/*" onChange={e=>e.target.files?.[0]&&readFile(e.target.files[0],mobileImage=>updateSlide(i,{mobileImage}))}/>{x.mobileImage&&<img src={x.mobileImage}/>}</label>
 <label>نقطة التركيز<select value={x.focus} onChange={e=>updateSlide(i,{focus:e.target.value as Slide["focus"]})}><option value="center">المنتصف</option><option value="right">اليمين</option><option value="left">اليسار</option></select></label>
 <label>عند الضغط<select value={x.linkType} onChange={e=>updateSlide(i,{linkType:e.target.value as Slide["linkType"],target:e.target.value==="offers"?"offers":""})}><option value="product">فتح منتج</option><option value="category">فتح قسم</option><option value="offers">فتح العروض</option><option value="none">بدون رابط</option></select></label>
 {x.linkType==="product"&&<label>رقم المنتج<input type="number" value={x.target} onChange={e=>updateSlide(i,{target:e.target.value})}/></label>}{x.linkType==="category"&&<label>القسم<select value={x.target} onChange={e=>updateSlide(i,{target:e.target.value})}><option value="">اختر القسم</option>{categoryData.filter(c=>c.slug!=="offers").map(c=><option value={c.slug} key={c.slug}>{c.name}</option>)}</select></label>}
 </div></div>)}
</div>
<div className="storePreview" style={{background:settings.bg,borderColor:settings.accent}}>{settings.logoImage?<img src={settings.logoImage}/>:<b style={{color:settings.primary}}>{settings.logo}</b>}<span style={{background:settings.primary}}>زر المتجر</span>
</div>
<button className="saveBtn" onClick={saveSettings}>{saved?"تم الحفظ ✓":"حفظ الإعدادات"}</button>
<button className="resetBtn" onClick={reset}>استعادة التصميم الافتراضي</button>
</div>
</div>}
  {tab==="المستخدمون والصلاحيات"&&<div className="dataPanel">{["مدير النظام","موظف الطلبات","موظف المخزون","التسويق","زبون جملة"].map(x=>
<label className="roleLine" key={x}>
<span>{x}</span>
<input type="checkbox" defaultChecked/>
</label>)}</div>}
  {!["نظرة عامة","المنتجات","الأقسام","الإعدادات","المستخدمون والصلاحيات"].includes(tab)&&<div className="dataPanel emptyModule">
<span>▦</span>
<h2>{tab}</h2>
<button>إضافة سجل جديد</button>
</div>}
  </section>
  {editing&&<div className="overlay">
<div className="productEditor">
<div className="editorHead">
<h2>{editing.id?"تعديل الصنف":"إضافة صنف"}</h2>
<button onClick={()=>setEditing(null)}>×</button>
</div>
<div className="editorGrid">
<label>اسم الصنف<input value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})}/>
</label>
<label>القسم<select value={editing.category} onChange={e=>setEditing({...editing,category:e.target.value})}>{categoryData.map(c=>
<option key={c.slug}>{c.name}</option>)}</select>
</label>
<label>القسم الفرعي<select value={editing.subcategory||""} onChange={e=>setEditing({...editing,subcategory:e.target.value||undefined})}><option value="">بدون — منتج مباشر في القسم</option>{(categoryData.find(c=>c.name===editing.category)?.subs||[]).map(s=><option key={s}>{s}</option>)}</select>
</label>
<label>سعر البيع<input type="number" value={editing.price} onChange={e=>setEditing({...editing,price:+e.target.value})}/>
</label>
<label>سعر الجملة<input type="number" value={editing.wholesale??""} onChange={e=>setEditing({...editing,wholesale:e.target.value===""?undefined:+e.target.value})}/>
</label>
<label>السعر القديم<input type="number" value={editing.oldPrice??""} onChange={e=>setEditing({...editing,oldPrice:e.target.value===""?undefined:+e.target.value})}/>
</label>
<label>رمز/أيقونة<input value={editing.icon} onChange={e=>setEditing({...editing,icon:e.target.value})}/>
</label>
<label>لون خلفية الصورة<input type="color" value={editing.color} onChange={e=>setEditing({...editing,color:e.target.value})}/>
</label>
<label className="uploadBox">صورة الصنف — تضغط تلقائياً<input type="file" accept="image/*" onChange={e=>e.target.files?.[0]&&readFile(e.target.files[0],image=>setEditing({...editing,image}))}/>{editing.image&&<img src={editing.image}/>}</label>
<label>رابط فيديو المنتج<input value={editing.video||""} placeholder="YouTube أو MP4" onChange={e=>setEditing({...editing,video:e.target.value})}/>
</label>
<label className="wide">الوصف<textarea value={editing.description} onChange={e=>setEditing({...editing,description:e.target.value})}/>
</label>
<label className="wide">كلمات البحث الداخلية<textarea value={editing.keywords||""} placeholder="مثال: طقم سفرة، صحون بورسلان، عروس، 24 قطعة" onChange={e=>setEditing({...editing,keywords:e.target.value})}/>
</label>
<label className="wide seoField">عنوان SEO<input value={editing.seoTitle||""} maxLength={65} placeholder={editing.name||"عنوان صفحة المنتج في جوجل"} onChange={e=>setEditing({...editing,seoTitle:e.target.value})}/><small>{(editing.seoTitle||"").length}/65</small>
</label>
<label className="wide seoField">وصف SEO<textarea value={editing.seoDescription||""} maxLength={165} placeholder="وصف مختصر وجذاب للمنتج يظهر في نتائج البحث" onChange={e=>setEditing({...editing,seoDescription:e.target.value})}/><small>{(editing.seoDescription||"").length}/165</small>
</label>
<label className="wide">وصف الصورة لمحركات البحث<input value={editing.imageAlt||""} placeholder={editing.name} onChange={e=>setEditing({...editing,imageAlt:e.target.value})}/>
</label>
<label>اسم المتغير<input value={editing.variantName||""} placeholder="مثال: الحجم أو اللون" onChange={e=>setEditing({...editing,variantName:e.target.value})}/>
</label>
</div>
<div className="variantsHead">
<h3>{editing.variantName||"خيارات الصنف"}</h3>
<button onClick={addVariant}>＋ إضافة لون/متغير</button>
</div>
<div className="variantEditor">{(editing.variants||[]).map((v,i)=>
<div key={i}>
<input value={v.name} onChange={e=>updateVariant(i,"name",e.target.value)} placeholder="اللون"/>
<input value={v.sku} onChange={e=>updateVariant(i,"sku",e.target.value)} placeholder="رقم المتغير"/>
<select value={v.displayType||(editing.variantDisplay==="color"?"color":"text")} onChange={e=>updateVariant(i,"displayType",e.target.value)}><option value="text">نص</option><option value="color">لون</option></select>
{(v.displayType||(editing.variantDisplay==="color"?"color":"text"))==="color"&&<input type="color" value={v.color||"#d9d9d9"} onChange={e=>updateVariant(i,"color",e.target.value)}/>} 
<input type="number" value={v.stock} onChange={e=>updateVariant(i,"stock",+e.target.value)} placeholder="المخزون"/>
<input type="number" value={v.price??""} onChange={e=>updateVariant(i,"price",+e.target.value)} placeholder="سعر البيع"/>
<input type="number" value={v.wholesale??""} onChange={e=>updateVariant(i,"wholesale",+e.target.value)} placeholder="الجملة"/>
<label className="variantUpload">صورة<input type="file" accept="image/*" onChange={e=>e.target.files?.[0]&&readFile(e.target.files[0],image=>updateVariant(i,"image",image))}/>{v.image&&<img src={v.image}/>}</label>
<button onClick={()=>setEditing({...editing,variants:editing.variants?.filter((_,n)=>n!==i)})}>حذف</button>
</div>)}</div>
<div className="editorActions">
<button onClick={()=>setEditing(null)}>إلغاء</button>
<button className="saveBtn" onClick={saveProduct}>حفظ الصنف</button>
</div>
</div>
</div>}
 </main>
}
