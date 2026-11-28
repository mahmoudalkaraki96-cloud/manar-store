// 1.10.3: makes the missing thumbnails for every product and variant image of every store:
// - WebP 384 (cards, search, cart) and 1080 (product page fallback): the live store's /_media/thumbnail
//   route makes and saves them with its own codecs (no Cloudflare Images quota);
// - AVIF 1080 (product page on phones, the approved format there): made here with sharp at the store's
//   AVIF quality and uploaded to the store's R2 bucket under the key the route reads.
// It lists what is already stored first, so only missing copies are made. Safe to run any time.
import fs from "node:fs";
import {createRequire} from "node:module";

const STORES=[
  {id:"manar",name:"منار بارتي",db:"4afe4c16-e513-43ac-a397-26fa4141e5c9",bucket:"manar-store-media",origin:"https://manarstore.ps"},
  {id:"rokon",name:"ركن هوم ستور",db:"a5c50923-c7ec-4ede-95b3-d19b93914902",bucket:"rokon-store-media",origin:"https://www.rokon-home.com"},
  {id:"red-rose",name:"أزهار الوردة الحمراء",db:"c24a8891-859f-4451-84d8-9f00b415bc00",bucket:"tenant-red-rose-media",origin:"https://redroseps.com"},
];
// Must match the worker: thumbnailFormat() gives 1080 the "-q82" suffix, 384 none.
const WIDTHS=[{width:384,suffix:""},{width:1080,suffix:"-q82"}];
// Same as shared/image-sizes.ts: LARGE_AVIF_QUALITY 60, key suffix "-avif".
const AVIF={width:1080,prefix:"thumbnails/w1080-avif/",quality:60};
const AVIF_CONCURRENCY=Number(process.env.AVIF_CONCURRENCY||3);
const sharp=process.env.SHARP_DIR?createRequire(process.env.SHARP_DIR.replace(/\/?$/,"/"))("sharp"):null;
const CONCURRENCY=Number(process.env.CONCURRENCY||6);
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
if(!token||!account)throw new Error("CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required");
const only=(process.env.STORE||"all").trim();
const api=`https://api.cloudflare.com/client/v4/accounts/${account}`;

async function cf(path,init={}){
  for(let attempt=1;;attempt++){
    const response=await fetch(api+path,{...init,headers:{authorization:`Bearer ${token}`,"content-type":"application/json",...init.headers}});
    const body=await response.json().catch(()=>({}));
    if(response.ok&&body.success!==false)return body;
    if(attempt>=4||response.status<500&&response.status!==429)throw new Error(`${path}: ${response.status} ${JSON.stringify(body.errors||body).slice(0,300)}`);
    await new Promise(r=>setTimeout(r,attempt*2000));
  }
}

async function imageUrls(store){
  const body=await cf(`/d1/database/${store.db}/query`,{method:"POST",body:JSON.stringify({sql:"SELECT DISTINCT url FROM product_media WHERE media_type='image'"})});
  return (body.result?.[0]?.results||[]).map(row=>String(row.url||"")).filter(Boolean);
}

async function storedKeys(store,prefix){
  const keys=new Set();let cursor="";
  do{
    const query=new URLSearchParams({prefix,per_page:"1000"});if(cursor)query.set("cursor",cursor);
    const body=await cf(`/r2/buckets/${store.bucket}/objects?${query}`);
    for(const object of body.result||[])keys.add(object.key);
    cursor=body.result_info?.is_truncated?body.result_info.cursor:"";
  }while(cursor);
  return keys;
}

/** Same rule as the store: only our own /media/ uploads can be resized. Returns the route path and R2 key. */
function source(url){
  try{
    const path=new URL(url,"https://store.invalid").pathname;
    if(!path.startsWith("/media/")||path.startsWith("/media/thumbnails/")||/\.svg$/i.test(path))return null;
    return {path,key:decodeURIComponent(path.slice("/media/".length))};
  }catch{return null}
}
const thumbKey=(key,{width,suffix})=>`thumbnails/w${width}${suffix}/${key.replace(/\.[^.]+$/,"")}.webp`;

async function make(store,path,width){
  const url=`${store.origin}/_media/thumbnail?src=${encodeURIComponent(path)}&width=${width}`;
  for(let attempt=1;;attempt++){
    try{
      const response=await fetch(url,{headers:{"user-agent":"StoreThumbnailWarmer/1.0",accept:"image/webp,image/*"},redirect:"manual"});
      const type=response.headers.get("content-type")||"";await response.arrayBuffer();
      if(response.ok&&type.startsWith("image/webp"))return "made";
      if(response.ok)return "unsupported"; // the store served the original: a format the codecs cannot read
      if(response.status===404)return "missing";
      if(attempt>=3)return "failed:"+response.status;
    }catch(error){if(attempt>=3)return "failed:"+(error instanceof Error?error.message:"error")}
    await new Promise(r=>setTimeout(r,attempt*3000));
  }
}

async function pool(items,worker,size=CONCURRENCY){
  let next=0;
  await Promise.all(Array.from({length:Math.min(size,items.length)},async()=>{while(next<items.length)await worker(items[next++])}));
}

async function makeAvif(store,path,key){
  for(let attempt=1;;attempt++){
    try{
      const original=await fetch(store.origin+path,{headers:{"user-agent":"StoreThumbnailWarmer/1.0"}});
      if(original.status===404)return "missing";
      if(!original.ok)throw new Error("source "+original.status);
      const input=Buffer.from(await original.arrayBuffer());
      let output;
      try{output=await sharp(input,{failOn:"none"}).rotate().resize({width:AVIF.width,withoutEnlargement:true}).avif({quality:AVIF.quality,effort:4}).toBuffer()}catch{return "unsupported"}
      const put=await fetch(`${api}/r2/buckets/${store.bucket}/objects/${encodeURIComponent(key)}`,{method:"PUT",headers:{authorization:`Bearer ${token}`,"content-type":"image/avif"},body:output});
      if(!put.ok)throw new Error("upload "+put.status+" "+(await put.text()).slice(0,200));
      return "made";
    }catch(error){if(attempt>=3)return "failed:"+(error instanceof Error?error.message:"error");await new Promise(r=>setTimeout(r,attempt*3000))}
  }
}

const report=[];
for(const store of STORES.filter(s=>only==="all"||s.id===only)){
  const started=Date.now();
  const urls=await imageUrls(store);
  // If the bucket cannot be listed, every copy is requested; the store answers stored ones from R2 quickly.
  const stored=new Map();for(const w of WIDTHS){try{stored.set(w.width,await storedKeys(store,`thumbnails/w${w.width}${w.suffix}/`))}catch(error){console.log(`  ${store.id}: could not list stored w${w.width} copies (${error instanceof Error?error.message:error}); requesting all`);stored.set(w.width,new Set())}}
  let avifStored=new Set();
  if(sharp){try{avifStored=await storedKeys(store,AVIF.prefix)}catch(error){console.log(`  ${store.id}: could not list stored AVIF copies (${error instanceof Error?error.message:error}); making all`)}}
  const seen=new Set(),jobs=[],avifJobs=[];let ready=0,skipped=0;
  for(const url of urls){
    const s=source(url);if(!s||seen.has(s.key)){skipped++;continue}
    seen.add(s.key);
    for(const w of WIDTHS){if(stored.get(w.width).has(thumbKey(s.key,w)))ready++;else jobs.push({path:s.path,width:w.width})}
    if(sharp){const key=AVIF.prefix+s.key.replace(/\.[^.]+$/,"")+".avif";if(avifStored.has(key))ready++;else avifJobs.push({path:s.path,key})}
  }
  console.log(`${store.id}: ${seen.size} images, ${ready} copies ready, ${jobs.length} WebP and ${avifJobs.length} AVIF to make`);
  const counts={};let done=0;
  await pool(jobs,async job=>{
    const result=await make(store,job.path,job.width);
    counts[result]=(counts[result]||0)+1;
    if(result.startsWith("failed")&&(counts[result]||0)<=5)console.log(`  ${result} w${job.width} ${job.path}`);
    if(++done%500===0)console.log(`  ${store.id}: ${done}/${jobs.length} WebP`);
  });
  let avifDone=0;
  await pool(avifJobs,async job=>{
    const result=await makeAvif(store,job.path,job.key);
    const name=result==="made"?"avifMade":result.startsWith("failed")?"avif"+result:result;
    counts[name]=(counts[name]||0)+1;
    if(result.startsWith("failed")&&counts[name]<=5)console.log(`  AVIF ${result} ${job.path}`);
    if(++avifDone%500===0)console.log(`  ${store.id}: ${avifDone}/${avifJobs.length} AVIF`);
  },AVIF_CONCURRENCY);
  report.push({store:store.name,images:seen.size,ready,toMake:jobs.length+avifJobs.length,made:counts.made||0,avifMade:counts.avifMade||0,unsupported:counts.unsupported||0,missing:counts.missing||0,failed:Object.entries(counts).filter(([k])=>k.startsWith("failed")||k.startsWith("aviffailed")).reduce((s,[,v])=>s+v,0),skipped,minutes:Math.round((Date.now()-started)/600)/100});
  console.log(JSON.stringify(report.at(-1)));
}

const lines=["## الصور المصغّرة","","| المتجر | الصور | نسخ جاهزة من قبل | WebP انعملت | AVIF انعملت | صيغة غير مدعومة | الأصلية مش موجودة | فشلت | دقايق |","|---|---|---|---|---|---|---|---|---|",
  ...report.map(r=>`| ${r.store} | ${r.images} | ${r.ready} | ${r.made} | ${r.avifMade} | ${r.unsupported} | ${r.missing} | ${r.failed} | ${r.minutes} |`),"",
  "لكل صورة: WebP 384 (البطاقات والبحث والسلة)، WebP 1080 واحتياط، وAVIF 1080 لصفحة المنتج."];
if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,lines.join("\n")+"\n");
console.log(lines.join("\n"));
if(report.some(r=>r.failed>Math.max(20,r.toMake*0.05)))process.exitCode=1;
