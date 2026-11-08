
export const themesStyle=`
.storeThemeSection{margin-top:24px;padding-top:20px;border-top:1px solid var(--line,#dce6e6)}
.storeThemeForm{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0}
.storeThemeForm label{display:flex;flex-direction:column;gap:7px;min-width:0}
.storeThemeForm select{width:100%;min-width:0;box-sizing:border-box;font-size:16px;min-height:42px;padding:8px 10px;border:1px solid #cbd5dc;border-radius:8px;background:#fff}
.storeThemeForm .full{grid-column:1/-1}
.storeThemeMessage{white-space:normal;overflow-wrap:anywhere;margin:10px 0}
@media(max-width:600px){.storeThemeForm{grid-template-columns:minmax(0,1fr)}}
`;
export const themesScript=String.raw`
async function loadStoreTheme(store){
 const previous=$('storeThemeSection');if(previous)previous.remove();
 const section=el('section',null,'storeThemeSection');section.id='storeThemeSection';section.append(el('h3','ثيم المتجر'),el('p','يتغيّر شكل المتجر للزوار بعد تنفيذ المشغّل، دون نشر نسخة جديدة.','muted'));$('detailBody').append(section);
 const hint=el('div','جاري تحميل الثيم…','muted');section.append(hint);
 try{const data=await api('/api/stores/'+store.id+'/theme');if(selected!==store.id||!section.isConnected)return;hint.remove();
 const notice=el('div',null,'storeThemeMessage');notice.setAttribute('role','status');section.append(notice);
 const themeName=id=>(data.themes.find(t=>t.id===id)||{}).label||id,radiusName=id=>(data.radius.find(r=>r.id===id)||{}).label||id;
 section.append(el('div',data.applied?'آخر ثيم طبّقته المنصة: '+themeName(data.applied.id)+' — الزوايا: '+radiusName(data.applied.radius):'لم تغيّر المنصة ثيم هذا المتجر بعد؛ يعمل بالثيم المحفوظ فيه (الأساسي افتراضيًا).','muted'));
 const job=data.jobs[0],inProgress=job&&['queued','running'].includes(job.status);
 const stageNames={queued:'بانتظار المشغّل',running:'جاري تطبيق الثيم'};
 const errorNames={theme_request_expired:'انتهت مهلة الطلب؛ اختر الثيم من جديد.',runner_interrupted:'توقّف المشغّل أثناء التنفيذ؛ يحتاج مراجعة.',resource_identity_mismatch:'موارد المتجر تحتاج مراجعة.',store_resources_changed:'تغيّرت موارد المتجر بعد الطلب.',store_profile_missing:'قاعدة المتجر لا تحتوي إعدادات الثيم؛ انشر نسخة أحدث.',store_profile_invalid:'إعدادات المتجر الحالية غير صالحة؛ تحتاج مراجعة.',theme_change_not_verified:'لم يتأكد المشغّل من حفظ الثيم.',build_trigger_failed:'تعذر تشغيل المشغّل؛ أعد تشغيله.'};
 if(inProgress)section.append(el('div',stageNames[job.status]+': '+themeName(job.theme.id)+' — '+radiusName(job.theme.radius),'notice'));
 if(job?.status==='failed'||job?.error_code)section.append(el('div',errorNames[job.error_code]||'تعذر تغيير الثيم؛ راجع سجل الحركات.','notice error'));
 if(job?.status==='queued'&&job.error_code==='build_trigger_failed'){const wake=el('button','إعادة تشغيل المشغّل','btn small');wake.type='button';wake.onclick=async()=>{wake.disabled=true;try{await api('/api/stores/'+store.id+'/theme/retry-dispatch','POST',{});void loadStoreTheme(store)}catch(e){notice.textContent=e.message;wake.disabled=false}};section.append(wake)}
 if(!data.ready)section.append(el('p','المتجر غير مربوط بالمنصة بشكل كامل بعد.','notice'));
 else if(!data.allowed.length)section.append(el('p',data.reason,'notice'));
 else if(!inProgress){
  const form=el('form',null,'storeThemeForm');let requestKey=crypto.randomUUID();
  const select=(label,options,value)=>{const lab=el('label',label),input=el('select');for(const option of options){const o=el('option',option.label);o.value=option.id;input.append(o)}input.value=value;lab.append(input);form.append(lab);return input};
  const current=data.applied||{id:data.allowed[0],radius:'standard'};
  const theme=select('الثيم',data.themes.filter(t=>data.allowed.includes(t.id)),current.id),radius=select('الزوايا',data.radius,current.radius);
  const button=el('button','تطبيق على المتجر','btn primary full');button.type='submit';form.append(button);
  form.onsubmit=async event=>{event.preventDefault();if(!confirm('تطبيق ثيم '+themeName(theme.value)+' على '+store.nameAr+'؟'))return;button.disabled=true;notice.textContent='جاري حفظ الطلب…';try{await api('/api/stores/'+store.id+'/theme','POST',{id:theme.value,radius:radius.value,requestKey});requestKey=crypto.randomUUID();notice.textContent='تم حفظ الطلب. انتظر اكتمال التنفيذ.';void loadStoreTheme(store)}catch(e){notice.textContent=e.message;button.disabled=false}};
  section.append(form);
 }
 if(inProgress){const poll=()=>{if(selected!==store.id||!$('details').open||!section.isConnected)return;if(document.hidden){setTimeout(poll,5000);return}void loadStoreTheme(store)};setTimeout(poll,5000)}
 }catch(e){hint.textContent=e.message}
}
`;
