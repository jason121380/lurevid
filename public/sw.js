const CACHE_VERSION = "v3";
const STATIC_CACHE = `lurevid-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `lurevid-runtime-${CACHE_VERSION}`;
const PRECACHE_ASSETS = ["/offline.html", "/favicon-v2.png", "/app-icon-v2.png", "/logo.svg"];
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  const keep = new Set([STATIC_CACHE, RUNTIME_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !keep.has(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// 讓頁面可以送 SKIP_WAITING 立即套用新版 SW（搭配 PwaRegister 的更新提示）。
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

function isImmutableAsset(url) {
  // Next.js 的 /_next/static 帶 content hash，永遠 immutable，可安全 cache-first。
  return url.pathname.startsWith("/_next/static/");
}

function isCacheableStatic(url) {
  return /\.(?:png|jpg|jpeg|webp|gif|svg|ico|woff2?|ttf|otf|css|js|json|webmanifest)$/i.test(url.pathname);
}

// 導覽（HTML）：network-first，離線時回 cache 再回 offline 頁。避免部署後拿到舊 HTML。
async function handleNavigation(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || (await caches.match(OFFLINE_URL)) || Response.error();
  }
}

// 不可變資產：cache-first；背景補快取。
async function handleImmutable(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

// 一般同源靜態檔：stale-while-revalidate，先回快取、背景更新。
async function handleStatic(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || network;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // API / Next data / RSC 一律走網路，不快取。
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_next/data/")) return;
  if (url.searchParams.has("_rsc")) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }
  if (isImmutableAsset(url)) {
    event.respondWith(handleImmutable(request));
    return;
  }
  if (isCacheableStatic(url)) {
    event.respondWith(handleStatic(request));
  }
});
