
export const accountsStyle=`
.storeAccountSection{margin-top:24px;padding-top:20px;border-top:1px solid var(--line,#dce6e6)}
.storeAccountForm{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0}
.storeAccountForm label{display:flex;flex-direction:column;gap:7px;min-width:0}
.storeAccountForm input{width:100%;min-width:0;box-sizing:border-box;font-size:16px;min-height:42px;padding:10px;border:1px solid #cbd5dc;border-radius:8px}
.storeAccountForm .full{grid-column:1/-1}
.storeAccountCard{border:1px solid #dce6e6;border-radius:10px;padding:12px;margin:10px 0}
.storeAccountCard .actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}
.storeAccountMessage{white-space:normal;overflow-wrap:anywhere;margin:10px 0}
@media(max-width:600px){.storeAccountForm{grid-template-columns:minmax(0,1fr)}}
`;
export const accountsScript=String.raw`
async function loadStoreAccounts(store){
 const previous=$('storeAccountSection');if(previous)previous.remove();
 const section=el('section',null,'storeAccountSection');section.id='storeAccountSection';section.append(el('h3','حساب مدير المتجر'),el('p','حسابات تنشئها من المنصة، بصلاحيات كاملة داخل هذا المتجر فقط.','muted'));$('detailBody').append(section);
 const hint=el('div','جاري تحميل الحسابات…','muted');section.append(hint);
 try{const data=await api('/api/stores/'+store.id+'/admin-accounts');if(selected!==store.id||!section.isConnected)return;hint.remove();
 const notice=el('div',null,'storeAccountMessage');notice.setAttribute('role','status');section.append(notice);
 const formFor=(label,submit,account)=>{
  const form=el('form',null,'storeAccountForm');let requestKey=crypto.randomUUID();
  const field=(text,type,name)=>{const lab=el('label',text),input=el('input');input.type=type;input.name=name;input.required=true;input.autocomplete=name==='password'?'new-password':name==='email'?'email':'name';if(type==='password'){input.minLength=6;input.maxLength=128}if(type==='email'){input.maxLength=254;input.dir='ltr'}lab.append(input);form.append(lab);return input};
  let name,email;if(!account){name=field('اسم المدير','text','name');name.maxLength=100;email=field('البريد الإلكتروني','email','email')}
  const password=field('كلمة المرور — 6 خانات على الأقل','password','password');password.parentElement.classList.add('full');
  const help=el('small','حروف أو أرقام، لا يلزم تركيب معقّد. لا تنتهي عند أول دخول، ولا تُحفظ بشكل مقروء.','muted full');form.append(help);
  const button=el('button',label,'btn primary full');button.type='submit';form.append(button);form.onsubmit=async event=>{event.preventDefault();button.disabled=true;notice.textContent='جاري حفظ العملية…';try{await submit({name:name?.value,email:email?.value,password:password.value,requestKey});password.value='';notice.textContent='تم حفظ العملية. انتظر ظهور «جاهز للدخول».';requestKey=crypto.randomUUID();void loadStoreAccounts(store)}catch(e){notice.textContent=e.message}finally{button.disabled=false}};return form;
 };
 if(data.ready)section.append(formFor('إنشاء حساب مدير',body=>api('/api/stores/'+store.id+'/admin-accounts','POST',body)));
 else section.append(el('p','جهّز المتجر وانشره أولًا، ثم أضف حساب مديره.','notice'));
 const statusNames={active:'جاهز للدخول',disabled:'الحساب معطّل',pending:'بانتظار تجهيز الحساب',failed:'لم يكتمل تجهيز الحساب'};
 const errorNames={email_already_exists:'هذا البريد لديه حساب سابق في المتجر؛ لم نغيّره.',account_request_expired:'انتهت مهلة التجهيز؛ أعد المحاولة بكلمة مرور جديدة.',runner_interrupted:'توقّف المشغّل أثناء التنفيذ؛ يحتاج مراجعة.',resource_identity_mismatch:'موارد المتجر تحتاج مراجعة.',build_trigger_failed:'تعذر تشغيل التنفيذ؛ أعد تشغيل العملية.'};
 let pending=false;
 for(const account of data.accounts){
  const card=el('article',null,'storeAccountCard');card.append(el('b',account.name),el('div',account.email,'url'));const job=account.job,inProgress=job&&['queued','running'].includes(job.status);pending=pending||inProgress;
  card.append(el('div',inProgress?(job.status==='queued'?'بانتظار المشغّل':'جاري تجهيز الحساب'):statusNames[account.status]||account.status,'notice'));
  if(job?.status==='failed'||job?.error_code)card.append(el('div',errorNames[job.error_code]||'تعذر تنفيذ العملية؛ راجع سجل الحركات.','notice error'));
  const actions=el('div',null,'actions');card.append(actions);
  if(!inProgress&&['active','disabled'].includes(account.status)){
   const copy=el('button','نسخ رابط الدخول والبريد','btn small');copy.type='button';copy.onclick=async()=>{try{await navigator.clipboard.writeText('رابط لوحة المتجر: '+data.adminUrl+'/admin/login\nالبريد: '+account.email);toast('تم نسخ الرابط والبريد. أعطه كلمة المرور التي عيّنتها.')}catch{notice.textContent='رابط الدخول: '+data.adminUrl+'/admin/login — '+account.email}};actions.append(copy);
   if(data.adminUrl)actions.append(link('فتح تسجيل الدخول ↗',data.adminUrl+'/admin/login'));
   const reset=el('button','إعادة ضبط كلمة المرور','btn small');reset.type='button';reset.onclick=()=>{reset.disabled=true;card.append(formFor('حفظ كلمة المرور الجديدة',body=>api('/api/stores/'+store.id+'/admin-accounts/'+account.id+'/reset-password','POST',body),account))};actions.append(reset);
   const toggle=el('button',account.status==='active'?'تعطيل الحساب':'تفعيل الحساب','btn small');toggle.type='button';toggle.onclick=async()=>{if(!confirm((account.status==='active'?'تعطيل':'تفعيل')+' حساب '+account.email+' في '+store.nameAr+'؟'))return;toggle.disabled=true;try{await api('/api/stores/'+store.id+'/admin-accounts/'+account.id+'/'+(account.status==='active'?'disable':'enable'),'POST',{requestKey:crypto.randomUUID()});void loadStoreAccounts(store)}catch(e){notice.textContent=e.message;toggle.disabled=false}};actions.append(toggle);
  }
  if(!inProgress&&account.status==='failed'){
   const retry=el('button','إعادة إنشاء الحساب','btn small');retry.type='button';retry.onclick=()=>{retry.disabled=true;card.append(formFor('إعادة المحاولة بكلمة المرور الجديدة',body=>api('/api/stores/'+store.id+'/admin-accounts/'+account.id+'/retry-create','POST',body),account))};actions.append(retry);
  }
  if(job?.status==='queued'&&job.error_code==='build_trigger_failed'){const wake=el('button','إعادة تشغيل المشغّل','btn small');wake.type='button';wake.onclick=async()=>{wake.disabled=true;try{await api('/api/stores/'+store.id+'/admin-accounts/'+account.id+'/retry-dispatch','POST',{});void loadStoreAccounts(store)}catch(e){notice.textContent=e.message;wake.disabled=false}};actions.append(wake)}
  section.append(card);
 }
 if(!data.accounts.length)section.append(el('p','لا توجد حسابات أُنشئت من المنصة لهذا المتجر بعد. الحسابات السابقة تبقى كما هي.','muted'));
 if(pending){const poll=()=>{if(selected!==store.id||!$('details').open||!section.isConnected)return;if(document.hidden||section.contains(document.activeElement)&&document.activeElement.tagName==='INPUT'){setTimeout(poll,5000);return}void loadStoreAccounts(store)};setTimeout(poll,5000)}
 }catch(e){hint.textContent=e.message}
}
`;
