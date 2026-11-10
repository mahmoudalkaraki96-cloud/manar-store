import fs from 'node:fs/promises';
import path from 'node:path';
import {normalizeSnapshot} from './woo-normalize.mjs';
const HOST='tammouni-home.com';
const pause=()=>new Promise(r=>setTimeout(r,3000+Math.random()*2000));
function extractDom(){
 const root=document.querySelector('div.product[id^="product-"],article.product[id^="product-"]')||document.querySelector('form.cart')?.closest('.product');if(!root)throw Error('product_container_missing');
 const form=root.querySelector('form.variations_form'),summary=root.querySelector('.summary')||root;
 const text=n=>(n?.innerText||n?.textContent||'').replace(/\s+/g,' ').trim();
 const plain=html=>{const d=new DOMParser().parseFromString(html||'','text/html');return text(d.body)};
 const money=n=>{const t=text(n).replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).replace(/[^\d.,]/g,'').replace(/,/g,'');if(!/^\d+(\.\d{1,2})?$/.test(t))throw Error('price_not_exact');return Number(t)};
 const options=Array.from(form?.querySelectorAll('.variations select')||[]).map(select=>({name:select.name,label:text(root.querySelector('label[for="'+CSS.escape(select.id)+'"]'))||select.name,values:Array.from(select.options).filter(o=>o.value).map(o=>({value:o.value,text:text(o)}))}));
 let variations=form?JSON.parse(form.getAttribute('data-product_variations')||'false'):[];
 if(Array.isArray(variations))variations=variations.map(v=>({...v,descriptionText:plain(v.variation_description),dimensionsText:v.dimensions_html&&plain(v.dimensions_html)!=='غير محدد'?'الأبعاد: '+plain(v.dimensions_html):'',weightText:v.weight_html&&plain(v.weight_html)!=='غير محدد'?'الوزن: '+plain(v.weight_html):'',extraImages:Array.from(new DOMParser().parseFromString(v.gallery_images_html||'','text/html').querySelectorAll('img')).map(i=>i.getAttribute('data-large_image')||i.getAttribute('src')).filter(Boolean)}));
 const photos=Array.from(root.querySelectorAll('.woocommerce-product-gallery img')).map(img=>{const entries=(img.getAttribute('srcset')||'').split(',').map(x=>x.trim().split(/\s+/)).filter(x=>x.length===2).sort((a,b)=>parseInt(b[1])-parseInt(a[1]));return img.getAttribute('data-large_image')||entries[0]?.[0]||img.closest('a')?.href||img.src});
 const priceNode=summary.querySelector('p.price,.price'),current=priceNode?.querySelector('ins .woocommerce-Price-amount')||priceNode?.querySelector('.woocommerce-Price-amount'),regular=priceNode?.querySelector('del .woocommerce-Price-amount')||current;
 const categories=Array.from(document.querySelectorAll('.woocommerce-breadcrumb a[href*="/product-category/"]')).map(a=>({id:new URL(a.href).pathname,name:text(a)}));
 if(!categories.length){const a=root.querySelector('.posted_in a[href*="/product-category/"]');if(a)categories.push({id:new URL(a.href).pathname,name:text(a)})}
 const customFields=Array.from(root.querySelectorAll('form.cart textarea,form.cart input[type=text],form.cart input[type=email],form.cart input[type=file]')).map(n=>({label:text(root.querySelector('label[for="'+CSS.escape(n.id||'missing')+'"]'))||n.name,type:n.type||'textarea',required:n.required,maxLength:n.maxLength>0?n.maxLength:60,placeholder:n.placeholder||''}));
 const review=[];if(customFields.some(f=>!f.label||!['text','textarea'].includes(f.type))||customFields.length>5)review.push('unsupported_custom_fields');
 if(root.querySelector('.woocommerce-product-gallery iframe'))review.push('external_video_embed');
 return{url:location.href,id:form?.getAttribute('data-product_id')||root.querySelector('[name=add-to-cart]')?.value||root.id?.match(/^product-(\d+)$/)?.[1],name:text(root.querySelector('h1.product_title,h1')),hasVariations:Boolean(form),variations,options,images:photos,price:form?null:money(current),regularPrice:form?null:money(regular),available:!root.classList.contains('outofstock')&&!summary.querySelector('.stock.out-of-stock')&&Boolean(summary.querySelector('button.single_add_to_cart_button:not([disabled])')),description:text(root.querySelector('#tab-description')),notes:text(summary.querySelector('.woocommerce-product-details__short-description')),properties:Array.from(root.querySelectorAll('.woocommerce-product-attributes tr')).map(tr=>({label:text(tr.querySelector('th')),value:text(tr.querySelector('td'))})),customFields,videos:Array.from(root.querySelectorAll('.woocommerce-product-gallery video[src],.woocommerce-product-gallery video source[src]')).map(n=>n.src),minimum:Number(root.querySelector('input.qty')?.getAttribute('min')||1),categories,review};
}
export async function collectTammouni(page,dir,{fresh=false}={}){
 const folder=path.join(dir,'data'),checkpoint=path.join(folder,'checkpoint-'+HOST+'.json');await fs.mkdir(folder,{recursive:true});
 let state={schema:1,source:HOST,sourceName:'تمّوني هوم',startedAt:new Date().toISOString(),products:[],errors:[],urls:[],discovered:false,completed:false};
 if(!fresh){try{state=JSON.parse(await fs.readFile(checkpoint,'utf8'));if(state.schema!==1||state.source!==HOST)throw Error('Invalid checkpoint')}catch(e){if(e.code!=='ENOENT')throw e}}
 delete state.stopReason;const save=async()=>{await fs.writeFile(checkpoint+'.tmp',JSON.stringify(state,null,2),'utf8');await fs.rename(checkpoint+'.tmp',checkpoint)};let blocked=null;
 const onResponse=response=>{if([403,429].includes(response.status())&&new URL(response.url()).hostname===HOST&&['document','xhr','fetch'].includes(response.request().resourceType()))blocked='STOP_HTTP_'+response.status()};page.on('response',onResponse);
 const check=async()=>{if(blocked)throw Error(blocked);if(/Just a moment|Access denied|Attention Required/i.test(await page.title()))throw Error('STOP_CHALLENGE')};
 try{
  if(!state.discovered){
   await pause();const response=await page.goto('https://'+HOST+'/shop',{waitUntil:'domcontentloaded'});if(response&&[403,429].includes(response.status()))throw Error('STOP_HTTP_'+response.status());await check();
   await page.locator('main a.woocommerce-loop-product__link[href*="/product/"]').first().waitFor({state:'attached',timeout:35000});
   for(let count=0;count<2000;count++){
    await check();const links=await page.locator('main a[href*="/product/"]').evaluateAll(aa=>aa.map(a=>a.href));
    for(const link of links){const u=new URL(link);if(u.hostname===HOST&&/^\/product\/[^/]+\/?$/.test(u.pathname)){u.search='';u.hash='';if(!state.urls.includes(u.href))state.urls.push(u.href)}}await save();console.log('تمّوني: اكتشاف '+state.urls.length+' رابط منتج');
    const more=page.locator('#load-more-btn');if(!await more.count()||!await more.isVisible()||await more.getAttribute('data-has-more')==='0'){state.discovered=true;break}
    const before=await page.locator('main a[href*="/product/"]').count();await pause();await more.click();
    await page.waitForFunction(n=>document.querySelectorAll('main a[href*="/product/"]').length>n||document.querySelector('#load-more-btn')?.getAttribute('data-has-more')==='0'||document.querySelector('#load-more-btn')?.style.display==='none',before,{timeout:35000});
   }
   if(!state.discovered)throw Error('listing_not_complete');await save();
  }
  if(!state.urls.length)throw Error('no_product_urls');
  for(const url of state.urls){
   if(state.products.some(p=>p.sourceUrl===url)||state.errors.some(e=>e.url===url))continue;await pause();await check();
   try{
    const response=await page.goto(url,{waitUntil:'domcontentloaded'});await check();if(!response?.ok())throw Error('HTTP_'+response?.status());
    await page.locator('h1.product_title').waitFor({state:'attached',timeout:25000});const snapshot=await page.evaluate(extractDom),product=normalizeSnapshot(snapshot);state.products.push(product);
   }catch(e){if(/^STOP_/.test(e.message))throw e;state.errors.push({url,reason:e.message})}
   await save();console.log('تمّوني: '+state.products.length+' منتج، '+state.errors.length+' للمراجعة من '+state.urls.length);
  }
  state.completed=state.discovered&&state.products.length+state.errors.length===state.urls.length;
 }catch(e){state.stopReason=e.message;console.log('توقف آمن:',e.message)}finally{
  await save();page.off('response',onResponse);const output=path.join(folder,'rokon-'+HOST+'-'+new Date().toISOString().slice(0,10)+'.json');await fs.writeFile(output,JSON.stringify(state,null,2),'utf8');console.log('تم حفظ الملف:',output);
 }
}
