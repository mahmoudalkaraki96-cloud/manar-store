const VERSION="store-admin-pwa-v3";
const OFFLINE_CACHE=VERSION+"-offline";
const STATIC_CACHE=VERSION+"-static";
const OFFLINE_URL="/admin-offline.html";

self.addEventListener("install",event=>{
 event.waitUntil(caches.open(OFFLINE_CACHE).then(cache=>cache.add(OFFLINE_URL)));
 self.skipWaiting();
});

self.addEventListener("activate",event=>{
 event.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(key=>!key.startsWith(VERSION)).map(key=>caches.delete(key))))
   .then(()=>self.clients.claim())
 );
});

self.addEventListener("fetch",event=>{
 const request=event.request;
 if(request.method!=="GET")return;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin||url.pathname.startsWith("/api/"))return;
 if(request.mode==="navigate"){
  event.respondWith(fetch(request).catch(()=>caches.match(OFFLINE_URL)));
  return;
 }
 const cacheable=url.pathname.startsWith("/_next/static/")||/\.(?:css|js|woff2?|png|jpe?g|webp|svg|gif)$/i.test(url.pathname);
 if(!cacheable)return;
 event.respondWith(caches.match(request).then(cached=>{
  const network=fetch(request).then(response=>{
   if(response.ok)caches.open(STATIC_CACHE).then(cache=>cache.put(request,response.clone()));
   return response;
  }).catch(()=>cached);
  return cached||network;
 }));
});


self.addEventListener("push",event=>{
 let payload={};try{payload=event.data?event.data.json():{}}catch{}
 event.waitUntil(self.registration.showNotification(payload.title||"المتجر",{body:payload.body||"لديك تحديث جديد",icon:"/store-icon.svg",badge:"/store-icon.svg",tag:payload.tag||"store-update",data:{url:payload.url||"/"}}));
});
self.addEventListener("notificationclick",event=>{
 event.notification.close();let target=new URL(event.notification.data?.url||"/",self.location.origin);
 if(target.origin!==self.location.origin)target=new URL("/",self.location.origin);
 event.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(async clients=>{const existing=clients.find(client=>new URL(client.url).origin===self.location.origin);if(existing){await existing.navigate(target.href);return existing.focus()}return self.clients.openWindow(target.href)}));
});
