const CHART_CACHE_PREFIX = 'flight-planner-avinor-icao-';
const MAX_CACHE_ENTRIES = 160;
const AVINOR_SERVICE_HOST = 'avigis.avinor.no';
const AVINOR_EXPORT_PATH =
  '/agsmap/rest/services/ICAO_500000_ExB/MapServer/export';

self.addEventListener('install', () => {
  void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function chartEdition(url) {
  if (
    url.hostname !== AVINOR_SERVICE_HOST ||
    url.pathname !== AVINOR_EXPORT_PATH
  ) {
    return null;
  }

  return url.searchParams.get('fpCacheEdition');
}

async function deleteOtherEditions(currentCacheName) {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames
      .filter(
        (cacheName) =>
          cacheName.startsWith(CHART_CACHE_PREFIX) &&
          cacheName !== currentCacheName,
      )
      .map((cacheName) => caches.delete(cacheName)),
  );
}

async function trimCache(cache) {
  const requests = await cache.keys();
  const overflow = requests.length - MAX_CACHE_ENTRIES;
  if (overflow <= 0) return;

  await Promise.all(
    requests.slice(0, overflow).map((request) => cache.delete(request)),
  );
}

async function cachedChartTile(request, edition) {
  const cacheName = `${CHART_CACHE_PREFIX}${edition}`;
  let cache;

  try {
    await deleteOtherEditions(cacheName);
    cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached !== undefined) return cached;
  } catch {
    // Cache availability must never prevent the live chart from loading.
    return fetch(request);
  }

  const response = await fetch(request);
  // Cross-origin image responses are opaque because Avinor does not expose
  // CORS to localhost. Opaque responses are nevertheless safe to cache and
  // return to the original image request.
  if (response.ok || response.type === 'opaque') {
    try {
      await cache.put(request, response.clone());
      await trimCache(cache);
    } catch {
      // Quota or storage failures fall back to the already-loaded response.
    }
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const edition = chartEdition(new URL(event.request.url));
  if (edition === null) return;

  event.respondWith(cachedChartTile(event.request, edition));
});
