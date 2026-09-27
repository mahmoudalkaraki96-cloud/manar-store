const VERSION="manar-store-admin-pwa-v1";
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
