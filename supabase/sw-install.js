// Only public installation artwork is cached. Account and attendance requests use the network.
const CACHE='choiron-install-artwork-v1';
self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{
 const u=new URL(e.request.url),base=new URL(self.registration.scope);
 if(e.request.method!=='GET'||u.origin!==base.origin)return;
 const path=u.pathname.slice(base.pathname.length);
 if(!u.pathname.startsWith(base.pathname)||!(/^(manifest-(admin|member)\.webmanifest|assets\/app-(admin|member)-(192|512)\.png)$/.test(path)))return;
 e.respondWith(caches.open(CACHE).then(c=>c.match(u.origin+u.pathname)).then(r=>r||fetch(e.request)));
});
