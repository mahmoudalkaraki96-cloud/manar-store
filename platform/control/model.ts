export type StoreDraft={id:string;nameAr:string;nameEn:string;ownerEmail:string|null;customDomain:string|null};
export function storeDraft(body:Record<string,unknown>):StoreDraft{
 const id=String(body.id||'').trim().toLowerCase(),nameAr=String(body.nameAr||'').trim(),nameEn=String(body.nameEn||'').trim();
 const ownerEmail=String(body.ownerEmail||'').trim().toLowerCase()||null,customDomain=String(body.customDomain||'').trim().toLowerCase()||null;
 if(!/^[a-z][a-z0-9-]{2,30}$/.test(id)||id.endsWith('-')||id.includes('--'))throw new Error('الرابط المختصر يجب أن يحتوي على 3 إلى 31 حرفًا إنجليزيًا صغيرًا أو أرقام وشرطة.');
 if(!nameAr||nameAr.length>100||nameEn.length>100)throw new Error('أدخل اسم المتجر بحد أقصى 100 حرف.');
 if(ownerEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail))throw new Error('البريد الإلكتروني غير صالح.');
 if(customDomain&&(!/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(customDomain)||customDomain.endsWith('.workers.dev')))throw new Error('أدخل دومينًا خاصًا فقط، بدون https أو مسار.');
 return {id,nameAr,nameEn,ownerEmail,customDomain};
}
export function resourceNames(id:string){
 if(!/^[a-z][a-z0-9-]{2,30}$/.test(id))throw new Error('Invalid store id');
 return {databaseName:'tenant-'+id+'-db',mediaBucket:'tenant-'+id+'-media',storefrontWorker:'tenant-'+id+'-store',adminWorker:'tenant-'+id+'-admin'};
}
export function publicRecord(row:Record<string,unknown>){
 let resources:Record<string,unknown>={};try{resources=JSON.parse(String(row.resources_json||'{}'))}catch{}
 return {id:row.id,nameAr:row.name_ar,nameEn:row.name_en,ownerEmail:row.owner_email,customDomain:row.custom_domain,status:row.status,resources,appVersion:row.app_version,appRevision:row.app_revision,managementMode:row.management_mode,createdAt:row.created_at,updatedAt:row.updated_at};
}
