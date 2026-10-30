export type StoreProfile = {publicOrigin:string;googleAnalyticsId:string;googleAnalyticsEnabled:boolean;metaPixelId:string;metaPixelEnabled:boolean};
export const emptyProfile:StoreProfile={publicOrigin:'',googleAnalyticsId:'',googleAnalyticsEnabled:false,metaPixelId:'',metaPixelEnabled:false};
export function normalizeStoreProfile(value:unknown):StoreProfile{
 const row=value&&typeof value==='object'?value as Record<string,unknown>:{};
 let publicOrigin='';try{const url=new URL(String(row.publicOrigin||''));if(url.protocol==='https:'&&!url.username&&!url.password&&url.pathname==='/'&&!url.search&&!url.hash)publicOrigin=url.origin}catch{}
 const googleAnalyticsId=String(row.googleAnalyticsId||'').trim().toUpperCase(),metaPixelId=String(row.metaPixelId||'').trim();
 return {publicOrigin,googleAnalyticsId:/^G-[A-Z0-9]{4,32}$/.test(googleAnalyticsId)?googleAnalyticsId:'',googleAnalyticsEnabled:row.googleAnalyticsEnabled===true,metaPixelId:/^\d{5,30}$/.test(metaPixelId)?metaPixelId:'',metaPixelEnabled:row.metaPixelEnabled===true};
}
export function validateStoreProfile(value:unknown):StoreProfile{
 const row=value as Record<string,unknown>,profile=normalizeStoreProfile(row);
 for(const key of ['publicOrigin','googleAnalyticsId','metaPixelId'] as const)if(String(row[key]||'').trim()&&!profile[key])throw new Error('قيمة غير صالحة في إعداد '+key);
 if(profile.googleAnalyticsEnabled&&!profile.googleAnalyticsId)throw new Error('أدخل معرّف Google Analytics قبل تفعيله');
 if(profile.metaPixelEnabled&&!profile.metaPixelId)throw new Error('أدخل رقم Meta Pixel قبل تفعيله');
 if((profile.googleAnalyticsEnabled||profile.metaPixelEnabled)&&!profile.publicOrigin)throw new Error('حدّد رابط المتجر الرئيسي قبل تفعيل التتبع');
 return profile;
}
export function trackingAllowed(profile:StoreProfile,url:URL){return Boolean(profile.publicOrigin)&&url.origin===profile.publicOrigin;}
export function googleAnalyticsHead(profile:StoreProfile,url:URL){
 if(!trackingAllowed(profile,url)||!profile.googleAnalyticsEnabled||!profile.googleAnalyticsId)return '';
 const id=profile.googleAnalyticsId;
 return '<script async src="https://www.googletagmanager.com/gtag/js?id='+id+'"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("js",new Date());gtag("config","'+id+'");</script>';
}
