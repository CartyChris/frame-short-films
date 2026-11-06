/* Frame caches only public application files. Project/media/key storage stays in the editor's own stores. */
const CACHE = 'frame-public-shell-v5-simulation';
const PREFIX = 'frame-public-shell-';
const CORE = ['/index.html', '/film_core.wasm', '/runtime/frame-three.js', '/runtime/frame-motion.js', '/manifest.webmanifest', '/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png', '/icons/maskable-512.png', '/fonts/serif.ttf', '/fonts/italic.ttf', '/fonts/sans.ttf', '/fonts/Playfair-Display-LICENSE.txt', '/fonts/DM-Sans-LICENSE.txt'];
const OPTIONAL_REFERENCES = ['/examples/western-paper-film.html'];
const EXTENSIONS = /\.(?:js|mjs|css|wasm|woff2?|ttf|svg|png|ico|webmanifest)$/i;

function isPublicFile(url) {
  if (url.origin !== self.location.origin || url.search || url.hash) return false;
  const path = url.pathname;
  if (path.startsWith('/api/') || path === '/api') return false;
  if (CORE.includes(path)) return true;
  if (path.startsWith('/assets/') || path.startsWith('/runtime/') || path.startsWith('/icons/')) return EXTENSIONS.test(path);
  if (path.startsWith('/references/') || path.startsWith('/examples/')) return /\.(?:html|js|mjs|css|wasm|woff2?|ttf|svg|png)$/i.test(path);
  if (path.startsWith('/fonts/')) return /\.(?:woff2?|ttf|txt)$/i.test(path);
  return path === '/reference-film.html';
}
function mayCacheResponse(response, url) {
  if (!response.ok || response.type === 'opaque' || response.redirected) return false;
  if (/no-store|private/i.test(response.headers.get('cache-control') || '')) return false;
  const type = response.headers.get('content-type') || '';
  if (/\.(?:js|mjs)$/i.test(url.pathname)) return /(?:java|ecma)script/.test(type);
  if (/\.wasm$/i.test(url.pathname)) return type.includes('application/wasm');
  if (/\.css$/i.test(url.pathname)) return type.includes('text/css');
  if (/\.html$/i.test(url.pathname)) return type.includes('text/html');
  return !type.includes('text/html');
}
function referencedFiles(text, base) {
  const result = new Set();
  // Read quoted static URL strings, including Vite's static/dynamic import map. Never evaluate source.
  const urls = /["']([^"'\s<>]+\.(?:js|mjs|css|wasm|woff2?|ttf|svg|png|ico))["']/g;
  for (const match of text.matchAll(urls)) {
    try { const url = new URL(match[1], match[1].startsWith('assets/') ? self.location.origin + '/' : base); if (isPublicFile(url)) result.add(url.href); } catch { /* Non-URL source string. */ }
  }
  for (const match of text.matchAll(/url\(\s*([\"']?)([^\"'\)\s]+)\1\s*\)/g)) {
    try { const url = new URL(match[2], base); if (isPublicFile(url)) result.add(url.href); } catch {}
  }
  return result;
}
async function warmShell() {
  const cache = await caches.open(CACHE);
  const queue = CORE.map(path => new URL(path, self.location.origin).href);
  const seen = new Set();
  while (queue.length && seen.size < 160) {
    const address = queue.shift();
    if (seen.has(address)) continue;
    seen.add(address);
    const url = new URL(address);
    try {
      const response = await fetch(address, {cache:'reload', credentials:'omit'});
      if (!mayCacheResponse(response, url)) { if (url.pathname === '/index.html') throw new Error('Application shell unavailable'); continue; }
      if (/\.(?:html|js|mjs|css)$/i.test(url.pathname)) {
        const text = await response.clone().text();
        for (const dependency of referencedFiles(text, address)) if (!seen.has(dependency)) queue.push(dependency);
      }
      await cache.put(address, response);
    } catch (error) { if (url.pathname === '/index.html') throw error; }
  }
  for (const path of OPTIONAL_REFERENCES) {
    const url = new URL(path, self.location.origin);
    try {
      const response = await fetch(url, {cache:'reload', credentials:'omit'});
      if (mayCacheResponse(response,url)) {
        const source = await response.clone().text();
        await cache.put(url,response);
        for (const address of referencedFiles(source,url.href)) {
          const dependency = new URL(address);
          const asset = await fetch(address,{cache:'reload',credentials:'omit'});
          if (mayCacheResponse(asset,dependency)) await cache.put(address,asset);
        }
      }
    } catch { /* Optional examples may not be shipped in every build. */ }
  }
}
self.addEventListener('install', event => {
  event.waitUntil((async()=>{
    await warmShell();
    if (self.registration.active) {
      for (const client of await self.clients.matchAll({type:'window',includeUncontrolled:true})) client.postMessage({type:'FRAME_UPDATE_READY'});
    }
    // Deliberately no skipWaiting: a new worker waits for all current editor tabs to close.
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async()=>{
    for (const name of await caches.keys()) if (name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  // Never intercept API calls, any authenticated request, cross-origin traffic, or query-bearing URLs.
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.search || request.headers.has('authorization') || request.headers.has('x-api-key') || request.headers.has('x-goog-api-key') || request.headers.has('xi-api-key') || url.pathname.startsWith('/api/') || url.pathname === '/api') return;
  if (request.mode === 'navigate' && (url.pathname === '/' || url.pathname === '/index.html' || !isPublicFile(url))) {
    // Existing project routes may load the app offline. Media/download navigations remain ordinary network requests.
    if (url.pathname !== '/' && url.pathname !== '/index.html' && /\.[a-z0-9]{1,8}$/i.test(url.pathname)) return;
    event.respondWith((async()=>{
      try {
        const response = await fetch(request);
        if (response.ok && (response.headers.get('content-type') || '').includes('text/html')) {
          const index = new URL('/index.html',self.location.origin);
          if (mayCacheResponse(response,index)) await (await caches.open(CACHE)).put(index,response.clone());
          return response;
        }
        return (await caches.match('/index.html')) || response;
      } catch {
        return (await caches.match('/index.html')) || new Response('Open Frame once while online to install its offline editor.',{status:503,headers:{'content-type':'text/plain; charset=utf-8'}});
      }
    })());
    return;
  }
  if (!isPublicFile(url)) return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const cached=await cache.match(request);
    if (cached) return cached;
    const response=await fetch(request);
    if (mayCacheResponse(response,url)) await cache.put(request,response.clone());
    return response;
  })());
});
