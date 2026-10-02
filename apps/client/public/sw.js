const CACHE = 'manu-shell-v1';
self.addEventListener('install', event => {event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['/','/icon.svg','/manifest.webmanifest'])));self.skipWaiting();});
self.addEventListener('activate', event => {event.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))]));});
self.addEventListener('fetch', event => {
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
  event.respondWith(fetch(event.request).then(response=>{if(response.ok){const clone=response.clone();caches.open(CACHE).then(c=>c.put(event.request,clone));}return response;}).catch(async()=>await caches.match(event.request)||(event.request.mode==='navigate'?await caches.match('/'):Response.error())));
});
async function notify(payload){
  const url=typeof payload.url==='string'&&payload.url.startsWith('/app/manual/')?payload.url:'/app/notifications';
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  clients.forEach(client=>client.postMessage({type:'MANU_NOTIFICATION',payload:{...payload,url}}));
  if(self.Notification&&self.Notification.permission==='granted')await self.registration.showNotification(payload.title||'新しいマニュアルが届きました',{body:payload.body||'',icon:'/icon-192.png',data:{url},tag:payload.id||url});
}
self.addEventListener('push', event=>event.waitUntil(notify(event.data?.json()||{})));
self.addEventListener('message',event=>{if(event.data?.type==='MOCK_PUSH')event.waitUntil(notify(event.data.payload));});
self.addEventListener('notificationclick',event=>{event.notification.close();const url=new URL(event.notification.data?.url||'/app/notifications',self.location.origin);event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{if(url.origin!==self.location.origin)return;const client=clients[0];if(client){await client.navigate(url.href);await client.focus();}else await self.clients.openWindow(url.href);}));});
