/* My Finance PWA shell cache. Version changes ensure app-shell refresh on update. */
"use strict";
const CACHE="myfinance-shell-v5";
const SHELL=["./","./index.html","./manifest.webmanifest","./icon.svg"];
self.addEventListener("install",event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("myfinance-shell-")&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener("fetch",event=>{const req=event.request;if(req.method!=="GET"||new URL(req.url).origin!==self.location.origin)return;event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(c=>c.put(req,copy));}return response;}).catch(()=>caches.match("./index.html"))));});
