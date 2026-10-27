// ─────────────────────────────────────────────────────────────────
//  {{APP_NAME}} — Service Worker (généré par tools/build.mjs depuis src/sw.js)
//  VERSION = empreinte du contenu publié : elle change d'elle-même à chaque
//  modification → invalide le cache de CETTE app uniquement
// ─────────────────────────────────────────────────────────────────
const PREFIX='st-{{APP_ID}}-';
const VERSION='{{VERSION}}';
const CACHE=PREFIX+'v'+VERSION;

// Liste produite au build à partir des fichiers réellement publiés
const PRECACHE={{PRECACHE}};

// ── Installation : tolérante (un fichier manquant ne bloque pas) ──
self.addEventListener('install',e=>{
  e.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await Promise.all(PRECACHE.map(u=>cache.add(u).catch(()=>{})));
    await self.skipWaiting();
  })());
});

// ── Activation : ne supprime que les anciens caches de cette app ──
self.addEventListener('activate',e=>{
  e.waitUntil((async()=>{
    const keys=await caches.keys();
    const olds=keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE);
    await Promise.all(olds.map(k=>caches.delete(k)));
    await self.clients.claim();
    if(olds.length){
      const clients=await self.clients.matchAll({type:'window'});
      clients.forEach(c=>c.postMessage({type:'SW_UPDATED',version:CACHE}));
    }
  })());
});

// ── Fetch ─────────────────────────────────────────────────────────
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return;

  // Navigations : network-first, repli sur le cache (index.html)
  if(req.mode==='navigate'){
    e.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      try{
        const res=await fetch(req);
        if(res.status===200)cache.put('./index.html',res.clone());
        return res;
      }catch(err){
        return (await cache.match(req))||(await cache.match('./index.html'))||(await cache.match('./'))
          ||new Response('Hors ligne — rechargez une fois connecté.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
      }
    })());
    return;
  }

  // Le reste : stale-while-revalidate
  e.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const cached=await cache.match(req);
    const network=fetch(req).then(res=>{
      if(res.status===200)cache.put(req,res.clone());
      return res;
    }).catch(()=>null);
    if(cached){e.waitUntil(network);return cached;}
    return (await network)||new Response('',{status:504});
  })());
});
