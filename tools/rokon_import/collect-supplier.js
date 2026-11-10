/* Run in the supplier tab AFTER signing in. GET requests only; no cookies/passwords exported. */
(async()=>{
 'use strict';
 const SOURCES={'alsultan-co.com':'السلطان','albazar.ps':'البازار'},host=location.hostname.replace(/^www\./,'');
 if(!SOURCES[host])throw Error('شغّل الملف في موقع السلطان أو البازار فقط');
 if(window.rokonCollectorRunning)throw Error('الجمع شغال بالفعل');
 const requiresLogin=host==='alsultan-co.com';
 if(requiresLogin&&!document.querySelector('a[href*="account=logOut"]'))throw Error('سجّل دخول حساب الجملة أولًا؛ لم يتم تأكيد الدخول');
 window.rokonCollectorRunning=true;
 const key='rokon-import-v1:'+host,old=localStorage.getItem(key),state=old?JSON.parse(old):{schema:1,source:host,sourceName:SOURCES[host],startedAt:new Date().toISOString(),products:[],errors:[],pages:[],queue:['/?app=product.all'],ids:[]};
 delete state.stopReason;
 const panel=document.createElement('div');Object.assign(panel.style,{position:'fixed',bottom:'12px',left:'12px',zIndex:'2147483647',background:'white',color:'#222',border:'2px solid #b85f7d',padding:'12px',maxWidth:'350px',font:'15px sans-serif',direction:'rtl'});
 const status=document.createElement('p'),stop=document.createElement('button');stop.textContent='إيقاف وحفظ الملف';panel.append(status,stop);document.body.append(panel);let stopped=false;stop.onclick=()=>{stopped=true;status.textContent='جاري حفظ ما تم جمعه...'};
 const persist=()=>{const data=JSON.stringify(state);localStorage.setItem(key,data);if(window.rokonSaveCheckpoint)void window.rokonSaveCheckpoint(data).catch(()=>console.warn('تعذر حفظ checkpoint على القرص؛ احتفظ بملف التنزيل'))};
 const delay=()=>new Promise(resolve=>setTimeout(resolve,3000+Math.random()*2000));
 const text=n=>(n?.textContent||'').replace(/\s+/g,' ').trim();
 const digits=s=>String(s).replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).replace(/[۰-۹]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)));
 const money=s=>{const t=digits(s).replace(/₪|شيكل|\s|,/g,'');if(!/^\d+(\.\d{1,2})?$/.test(t))throw Error('price_not_exact');return Math.round(Number(t)*100)};
 const url=raw=>{if(!raw)return null;const u=new URL(raw,location.origin);return u.protocol==='https:'&&u.hostname.replace(/^www\./,'')===host?u.href:null};
 const images=nodes=>[...new Set(Array.from(nodes).map(n=>url(n.getAttribute('src'))).filter(Boolean))];
 function price(node){if(!node)throw Error('missing_price');const clone=node.cloneNode(true),del=clone.querySelector('del');const before=del?money(text(del)):null;clone.querySelectorAll('del').forEach(n=>n.remove());return{now:money(text(clone)),before}}
 function call(input,name){const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),m=(input.getAttribute('onclick')||'').match(new RegExp(escaped+'\\(\\s*[\x27\x22]([^\x27\x22]*)[\x27\x22]\\s*,\\s*[\x27\x22]([^\x27\x22]*)[\x27\x22]'));return m?m.slice(1):null}
 async function get(path,authenticated=true){await delay();if(stopped)throw Error('stopped');const response=await fetch(new URL(path,location.origin),{credentials:authenticated?'same-origin':'omit',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(35000)});if([403,429].includes(response.status))throw Error('STOP_HTTP_'+response.status);if(!response.ok)throw Error('HTTP_'+response.status);const html=await response.text();if(/cf-chl-|captcha|access denied|too many requests/i.test(html))throw Error('STOP_CHALLENGE');const doc=new DOMParser().parseFromString(html,'text/html');if(requiresLogin&&authenticated&&!doc.querySelector('a[href*="account=logOut"]'))throw Error('STOP_LOGIN_EXPIRED');return doc}
 function extract(auth,pub,id){
  const root=auth.querySelector('#this-is-product'),pr=pub.querySelector('#this-is-product');if(!root||!pr)throw Error('product_container_missing');
  const name=text(root.querySelector('h1'));if(!name||name!==text(pr.querySelector('h1')))throw Error('product_identity_mismatch');
  const details=auth.querySelector('.product-body');if(details&&!new RegExp('رقم المنتج\\s*'+id+'(?!\\d)').test(text(details)))throw Error('source_number_mismatch');
  const radios=Array.from(root.querySelectorAll('input[type=radio]')),variants=[],owned=new Set(),review=[];
  const photoFor=input=>{const label=root.querySelector('label[for="'+CSS.escape(input.id)+'"]'),own=images(label?.querySelectorAll('img')||[]);return own};
  for(const input of radios){
   const cost=call(input,'changePrice');if(!cost){if(!radios.some(n=>n.id.startsWith(input.id+'s')))throw Error('unsupported_variant_control');continue}
   const other=pr.querySelector('#'+CSS.escape(input.id)),retail=other&&call(other,'changePrice');if(!other||other.value!==input.value||!retail)throw Error('variant_price_pair_missing');
   const parent=/^(c\d+)s\d+$/.exec(input.id),color=parent?root.querySelector('#'+parent[1]):null;
   const label=[color?.value,input.value].filter(Boolean).join(' / ');let media=photoFor(input);if(!media.length&&color)media=photoFor(color);
   const carousel=(input.getAttribute('onclick')||'').match(/liveImageTocarousel\(['"]([^'"]+)['"]\)/),matched=carousel&&root.querySelector('img[id="'+CSS.escape(carousel[1])+'"]');if(matched)media=[...new Set([url(matched.getAttribute('src')),...media].filter(Boolean))];
   media.forEach(u=>owned.add(u));
   variants.push({sourceKey:input.id,name:label,color:color?.value||(input.name==='color'?input.value:null),size:input.name==='size'?input.value:null,purchaseAgorot:money(cost[0]),saleBeforeAgorot:retail[1]?money(retail[1]):money(retail[0]),available:!input.disabled&&!color?.disabled&&Boolean(root.querySelector('#addToCart')),images:media,notes:[call(input,'showInfo')?.[1],color&&call(color,'showInfo')?.[1]].filter(Boolean).join('\n')});
  }
  if(radios.length&&!variants.length)throw Error('variant_structure_not_understood');
  const primary=variants.length?{now:Math.min(...variants.filter(v=>v.available).map(v=>v.purchaseAgorot))}:price(root.querySelector('#price,.price')),publicPrice=variants.length?{before:null,now:Math.min(...variants.filter(v=>v.available).map(v=>v.saleBeforeAgorot))}:price(pr.querySelector('#price,.price'));
  if(new Set(variants.map(v=>v.name)).size!==variants.length)throw Error('duplicate_variant_labels');
  const fields=Array.from(root.querySelectorAll('textarea,select,input')).filter(n=>['TEXTAREA','SELECT'].includes(n.tagName)||['text','email','file'].includes(n.type)).map(n=>{const label=text(n.closest('.property-wrapper')?.querySelector('.property-name'));return{label:label||n.name||'',type:n.tagName==='SELECT'?'select':n.type||'text',required:n.required,maxLength:n.maxLength>0?n.maxLength:60,placeholder:n.placeholder||'',options:n.tagName==='SELECT'?Array.from(n.options).map(o=>({value:o.value,text:text(o)})):undefined}});
  if(fields.some(f=>!f.label||!['text','textarea'].includes(f.type))||fields.length>5)review.push('unsupported_custom_fields');
  const min=Number(root.querySelector('#quantity')?.getAttribute('min')||1);if(min>1)review.push('minimum_quantity_'+min);
  const allImages=images(root.querySelectorAll('.carousel img'));images(auth.querySelectorAll('.product-content-additional-video-images img')).forEach(u=>{if(!allImages.includes(u))allImages.push(u)});
  const properties=Array.from(details?.querySelectorAll('.property-wrapper')||[]).map(n=>({label:text(n.querySelector('.property-name')),value:text(n.querySelector('.property-content'))}));
  const categories=Array.from(auth.querySelectorAll('.breadcrumb a[href]')).map(a=>({id:new URL(a.getAttribute('href'),location.origin).searchParams.get('app')?.match(/^product\.cat\.(\d+)$/)?.[1],name:text(a)})).filter(c=>c.id&&c.name);
  return{source:host,sourceId:String(id),sourceUrl:new URL('/?app=product.show.'+id,location.origin).href,name,categories,purchaseAgorot:primary.now,saleBeforeAgorot:publicPrice.before??publicPrice.now,available:variants.length?variants.some(v=>v.available):Boolean(root.querySelector('#addToCart'))&&!root.querySelector('#addToCart')?.disabled,variants,images:allImages.filter(u=>!owned.has(u)),allImages,description:text(details?.querySelector('.text-justify')),properties,notes:text(root.querySelector('.product-sub-title')),customFields:fields,videos:Array.from(auth.querySelectorAll('.product-content-additional-video-images video source,.product-content-additional-video-images video[src]')).map(n=>url(n.getAttribute('src'))).filter(Boolean),minimum:min,review,capturedAt:new Date().toISOString()};
 }
 function download(){const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='rokon-'+host+'-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),10000)}
 try{
  while(state.queue.length&&!stopped){const path=state.queue.shift();if(state.pages.includes(path))continue;status.textContent='اكتشاف صفحات '+SOURCES[host]+' — '+state.pages.length;let doc;try{doc=await get(path)}catch(e){state.queue.unshift(path);throw e}
   for(const a of doc.querySelectorAll('a[href]')){const u=new URL(a.getAttribute('href'),location.origin);if(u.origin!==location.origin)continue;const app=u.searchParams.get('app')||'',m=/^product\.show\.(\d+)$/.exec(app);if(m&&!state.ids.includes(m[1]))state.ids.push(m[1]);if(/^product\.all(?:\.\.\d+)?$/.test(app)){const next=u.pathname+u.search;if(!state.pages.includes(next)&&!state.queue.includes(next))state.queue.push(next)}}
   state.pages.push(path);persist();
  }
  for(const id of state.ids){if(stopped)break;if(state.products.some(p=>p.sourceId===id)||state.errors.some(e=>e.id===id))continue;status.textContent=SOURCES[host]+' — '+state.products.length+' منتج، '+state.errors.length+' للمراجعة، من '+state.ids.length;
   try{const path='/?app=product.show.'+id,auth=await get(path),pub=requiresLogin?await get(path,false):auth;state.products.push(extract(auth,pub,id))}catch(e){if(/^STOP_|stopped/.test(e.message))throw e;state.errors.push({id,reason:e.message})}persist();
  }
  state.completed=!stopped&&state.queue.length===0&&state.products.length+state.errors.length===state.ids.length;
 }catch(e){state.stopReason=e.message;console.warn('توقف آمن:',e.message)}finally{persist();download();window.rokonCollectorRunning=false;status.textContent='تم حفظ '+state.products.length+' منتج. '+(state.stopReason||'');stop.textContent='تنزيل الملف مرة أخرى';stop.onclick=download}
})();
