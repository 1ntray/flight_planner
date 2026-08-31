const CHART_TILE_CACHE_SERVICE_WORKER = 'avinor-chart-tile-cache-sw.js';

/** Registers a service worker that caches only edition-keyed Avinor tiles. */
export function registerChartTileCache(): void {
  if (!('serviceWorker' in navigator)) return;

  const baseUrl = import.meta.env.BASE_URL;
  void navigator.serviceWorker
    .register(`${baseUrl}${CHART_TILE_CACHE_SERVICE_WORKER}`, {
      scope: baseUrl,
    })
    .catch((error: unknown) => {
      console.warn('Avinor chart tile cache is unavailable.', error);
    });
}
