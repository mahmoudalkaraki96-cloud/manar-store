export type Row=Record<string,unknown>;
export type Variant={version:string;revision:string;artifactKey:string;sha256:string;surfaces:string[]};
export type Certification={track:string;worker:string;databaseId:string;mediaBucket:string};
export type Manifest={schemaVersion:number;variants:Record<string,Variant>;certifications:Record<string,Certification>};
export class PublishingError extends Error{status:number;constructor(message:string,status=400){super(message);this.status=status}}
export function parseManifest(value:string):Manifest{
 let manifest:Manifest;try{manifest=JSON.parse(value)}catch{throw new PublishingError('بيانات الإصدار غير صالحة.',409)}
 if(!manifest||manifest.schemaVersion!==1||!manifest.variants||!manifest.certifications)throw new PublishingError('صيغة الإصدار غير مدعومة.',409);
 for(const [track,v]of Object.entries(manifest.variants)){
  if(!v||!/^[a-z][a-z0-9-]{1,30}$/.test(track)||!/^\d+\.\d+\.\d+$/.test(v.version)||!/^[a-f0-9]{40}$/.test(v.revision)||!/^[a-f0-9]{64}$/.test(v.sha256)||!/^releases\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+\.tar\.gz$/.test(v.artifactKey)||v.artifactKey.split('/').some(p=>p==='..'||p==='.')||JSON.stringify(v.surfaces)!=='["storefront"]')throw new PublishingError('الإصدار لم يُعتمد لهذا النوع من النشر.',409);
 }
 return manifest;
}
export function selection(body:Row){
 const releaseId=String(body.releaseId||''),selector=String(body.selector||'');
 if(!/^[a-zA-Z0-9._-]{3,80}$/.test(releaseId)||!['selected','all'].includes(selector))throw new PublishingError('اختر إصدارًا وطريقة تحديد المتاجر.');
 const storeIds=Array.isArray(body.storeIds)?[...new Set(body.storeIds.map(String))].sort():[];
 if(selector==='selected'&&(!storeIds.length||storeIds.length>100||storeIds.some(id=>!/^[a-z][a-z0-9-]{2,30}$/.test(id))))throw new PublishingError('حدد متجرًا واحدًا على الأقل.');
 if(body.forceRedeploy!==undefined&&typeof body.forceRedeploy!=='boolean')throw new PublishingError('خيار إعادة النشر غير صالح.');
 return {releaseId,selector:selector as 'all'|'selected',storeIds,forceRedeploy:body.forceRedeploy===true};
}
export function buildReleasePlan(release:Row,stores:Row[],input:ReturnType<typeof selection>){
 if(release.status!=='ready'||release.id!==input.releaseId)throw new PublishingError('الإصدار غير جاهز للنشر.',409);
 const manifest=parseManifest(String(release.manifest_json));
 const selected=input.selector==='all'?[...stores]:stores.filter(s=>input.storeIds.includes(String(s.id)));
 if(!selected.length||selected.length>100||(input.selector==='selected'&&selected.length!==input.storeIds.length))throw new PublishingError('قائمة المتاجر تغيّرت؛ راجع الاختيار.');
 const targets=selected.sort((a,b)=>String(a.id).localeCompare(String(b.id))).map(store=>{
  const id=String(store.id),cert=manifest.certifications[id];let resources:Row={};try{resources=JSON.parse(String(store.resources_json||'{}'))}catch{}
  let blockedReason=store.status!=='active'?'المتجر غير جاهز للنشر.':!cert?'هذا المتجر لم يُفحص مع الإصدار المختار.':'';
  const variant=cert?manifest.variants[cert.track]:undefined;
  if(cert&&(!variant||resources.storefrontWorker!==cert.worker||resources.databaseId!==cert.databaseId||resources.mediaBucket!==cert.mediaBucket))blockedReason='موارد المتجر تغيّرت بعد اعتماد الإصدار؛ يلزم إعادة الفحص.';
  if(variant&&/^\d+\.\d+\.\d+$/.test(String(store.app_version||''))){const currentParts=String(store.app_version).split('.').map(Number),nextParts=variant.version.split('.').map(Number);for(let i=0;i<3;i++){if(currentParts[i]===nextParts[i])continue;if(currentParts[i]>nextParts[i])blockedReason='نسخة المتجر الحالية أحدث من هذا الإصدار.';break}}
  const current=Boolean(variant&&store.app_version===variant.version&&store.app_revision===variant.revision);
  return {storeId:id,name:String(store.name_ar),currentVersion:String(store.app_version||'غير مسجل'),version:variant?.version||'',revision:variant?.revision||'',track:cert?.track||'',surfaces:['storefront'],blockedReason,alreadyCurrent:current,willDeploy:!blockedReason&&(!current||input.forceRedeploy),snapshot:{worker:String(resources.storefrontWorker||''),databaseId:String(resources.databaseId||''),databaseName:String(resources.databaseName||''),mediaBucket:String(resources.mediaBucket||''),storefrontUrl:String(resources.storefrontUrl||''),currentVersion:store.app_version,currentRevision:store.app_revision}};
 });
 return {releaseId:input.releaseId,title:String(release.title),selector:input.selector,forceRedeploy:input.forceRedeploy,targets,blocked:targets.some(t=>Boolean(t.blockedReason)),deployCount:targets.filter(t=>t.willDeploy).length};
}
export async function planHash(plan:ReturnType<typeof buildReleasePlan>,manifestJson=''){
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({plan,manifest:manifestJson})));
 return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
}
export function publicRelease(row:Row){const manifest=parseManifest(String(row.manifest_json));return {id:row.id,title:row.title,notes:row.notes,status:row.status,createdAt:row.created_at,variants:Object.entries(manifest.variants).map(([track,v])=>({track,version:v.version,revision:v.revision,surfaces:v.surfaces}))}}
