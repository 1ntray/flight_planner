const CHART_CACHE_PREFIX = 'flight-planner-avinor-icao-';
const CHART_CACHE_METADATA_PREFIX = 'flight-planner-avinor-icao-metadata-';
const MAX_CACHE_ENTRIES = 160;
const REVALIDATE_AFTER_MS = 24 * 60 * 60 * 1000;
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

function cacheNamesForEdition(edition) {
  return {
    chart: `${CHART_CACHE_PREFIX}${edition}`,
    metadata: `${CHART_CACHE_METADATA_PREFIX}${edition}`,
  };
}

async function deleteOtherEditions(currentCacheNames) {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames
      .filter(
        (cacheName) =>
          (cacheName.startsWith(CHART_CACHE_PREFIX) ||
            cacheName.startsWith(CHART_CACHE_METADATA_PREFIX)) &&
          cacheName !== currentCacheNames.chart &&
          cacheName !== currentCacheNames.metadata,
      )
      .map((cacheName) => caches.delete(cacheName)),
  );
}

async function trimCache(cache, metadataCache) {
  const requests = await cache.keys();
  const overflow = requests.length - MAX_CACHE_ENTRIES;
  if (overflow <= 0) return;

  await Promise.all(
    requests.slice(0, overflow).map(async (request) => {
      await cache.delete(request);
      await metadataCache.delete(request);
    }),
  );
}

async function cacheTileResponse(cache, metadataCache, request, response) {
  if (!(response.ok || response.type === 'opaque')) return;

  await cache.put(request, response.clone());
  await metadataCache.put(request, new Response(String(Date.now())));
  await trimCache(cache, metadataCache);
}

async function needsRevalidation(metadataCache, request) {
  const timestamp = await metadataCache.match(request);
  if (timestamp === undefined) return true;

  const lastValidatedAt = Number(await timestamp.text());
  return (
    !Number.isFinite(lastValidatedAt) ||
    Date.now() - lastValidatedAt >= REVALIDATE_AFTER_MS
  );
}

async function revalidateTile(cache, metadataCache, request) {
  try {
    // Avoid an HTTP-cache hit when refreshing an already cached chart tile.
    const response = await fetch(request, { cache: 'reload' });
    await cacheTileResponse(cache, metadataCache, request, response);
  } catch {
    // A temporary network failure must not make the already displayed tile fail.
  }
}

async function cachedChartTile(request, edition, lifecycle) {
  const cacheNames = cacheNamesForEdition(edition);
  let cache;
  let metadataCache;

  try {
    await deleteOtherEditions(cacheNames);
    cache = await caches.open(cacheNames.chart);
    metadataCache = await caches.open(cacheNames.metadata);
    const cached = await cache.match(request);
    if (cached !== undefined) {
      if (await needsRevalidation(metadataCache, request)) {
        lifecycle.revalidation = revalidateTile(cache, metadataCache, request);
      }
      return cached;
    }
  } catch {
    // Cache availability must never prevent the live chart from loading.
    return fetch(request);
  }

  const response = await fetch(request);
  try {
    // Cross-origin image responses are opaque because Avinor does not expose
    // CORS to localhost. Opaque responses are nevertheless safe to cache and
    // return to the original image request.
    await cacheTileResponse(cache, metadataCache, request, response);
  } catch {
    // Quota or storage failures fall back to the already-loaded response.
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const edition = chartEdition(new URL(event.request.url));
  if (edition === null) return;

  const lifecycle = { revalidation: undefined };
  const response = cachedChartTile(event.request, edition, lifecycle);
  event.respondWith(response);
  // waitUntil must be registered during the fetch event. The chained promise
  // lets a later cache lookup add a background revalidation without delaying
  // the cached response returned to Leaflet.
  event.waitUntil(response.then(() => lifecycle.revalidation).catch(() => {}));
});
