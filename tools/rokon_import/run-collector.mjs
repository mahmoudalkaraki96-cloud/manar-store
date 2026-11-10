import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline/promises';
import {chromium} from 'playwright';
import {collectTammouni} from './tammouni-collector.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url)),arg=process.argv[2]||'sultan';
const sites={sultan:'https://alsultan-co.com/?account=login',bazar:'https://albazar.ps/',tammouni:'https://tammouni-home.com/'};
if(!sites[arg])throw Error('Choose sultan, bazar or tammouni');
const browser=await chromium.launch({channel:'chrome',headless:false}),context=await browser.newContext({acceptDownloads:true}),page=await context.newPage();
const rl=createInterface({input:process.stdin,output:process.stdout});
const host=new URL(sites[arg]).hostname,dataDir=path.join(dir,'data'),checkpoint=path.join(dataDir,'checkpoint-'+host+'.json');let writes=Promise.resolve();
await fs.mkdir(dataDir,{recursive:true});
if(arg!=='tammouni'&&!process.argv.includes('--fresh')){
 try{const value=await fs.readFile(checkpoint,'utf8'),saved=JSON.parse(value);if(saved.schema!==1||saved.source!==host)throw Error('Invalid checkpoint');await context.addInitScript(({host,value})=>{if(location.hostname===host)localStorage.setItem('rokon-import-v1:'+host,value)},{host,value})}catch(error){if(error.code!=='ENOENT')throw error}
}
await page.exposeFunction('rokonSaveCheckpoint',value=>{const parsed=JSON.parse(value);if(parsed.source!==host||parsed.schema!==1)throw Error('Wrong source checkpoint');writes=writes.then(async()=>{await fs.writeFile(checkpoint+'.tmp',value,'utf8');await fs.rename(checkpoint+'.tmp',checkpoint)});return writes});
try{
 if(arg==='tammouni'){
  console.log('تمّوني هوم بدون دخول — جمع المنتجات والخيارات مع تحميل المزيد تلقائيًا.');
  await collectTammouni(page,dir,{fresh:process.argv.includes('--fresh')});
 }else{
 await page.goto(sites[arg],{waitUntil:'domcontentloaded'});
 if(arg==='sultan'){
  console.log('سجل الدخول بنفسك في نافذة Chrome الجديدة. لا ترسل كلمة المرور لأحد.');
  await rl.question('بعد ظهور حسابك اضغط Enter هنا لبدء الجمع: ');
  if(!await page.locator('a[href*="account=logOut"]').count())throw Error('لم يتم تأكيد الدخول؛ لم تبدأ أي عملية جمع');
 }else console.log('البازار بدون تسجيل دخول — يبدأ جمع الأسعار العامة الآن.');
 const download=page.waitForEvent('download',{timeout:0});
 const source=await fs.readFile(path.join(dir,'collect-supplier.js'),'utf8');
 // This code runs locally in the authenticated supplier tab; no session export.
 const running=page.evaluate(source);
 const file=await Promise.race([download,running.then(()=>{throw Error('لم يتم إنشاء تنزيل؛ راجع صفحة الجمع')})]);const output=path.join(dir,'data',file.suggestedFilename());await file.saveAs(output);await running;await writes;
 console.log('تم حفظ الملف:',output);
 console.log('إذا توقف بسبب 403/429 انتظر انتهاء الحظر قبل إعادة التشغيل.');
 }
}finally{await writes.catch(()=>{});rl.close();await browser.close()}
