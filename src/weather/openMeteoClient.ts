import {
  buildOpenMeteoForecastRequest,
  parseOpenMeteoForecast,
} from './openMeteoForecast';
import type { ForecastLegWind, WeatherSampleRequest } from './types';

const CACHE_LIFETIME_MS = 10 * 60 * 1000;
const MAX_LOCATIONS_PER_REQUEST = 40;
export const OPEN_METEO_REQUEST_TIMEOUT_MS = 20_000;

interface ForecastCacheEntry {
  expiresAtUtcMs: number;
  retrievedAtUtcMs: number;
  value: unknown;
}

const forecastCache = new Map<string, ForecastCacheEntry>();

function getApiErrorReason(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;

  return record.error === true && typeof record.reason === 'string'
    ? record.reason
    : null;
}

async function fetchForecastJson(
  url: string,
  signal: AbortSignal,
): Promise<{ response: Response; value: unknown }> {
  if (signal.aborted) {
    throw new DOMException('Forecast request was aborted', 'AbortError');
  }

  const requestController = new AbortController();
  let timedOut = false;
  const forwardAbort = () => requestController.abort();
  signal.addEventListener('abort', forwardAbort, { once: true });
  const timeoutId = globalThis.setTimeout(() => {
    timedOut = true;
    requestController.abort();
  }, OPEN_METEO_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: requestController.signal,
    });
    const value: unknown = await response.json();
    return { response, value };
  } catch (error) {
    if (timedOut && !signal.aborted) {
      throw new Error(
        `Open-Meteo request timed out after ${OPEN_METEO_REQUEST_TIMEOUT_MS / 1000} seconds`,
      );
    }

    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
    signal.removeEventListener('abort', forwardAbort);
  }
}

async function fetchOpenMeteoWindBatch(
  requests: readonly WeatherSampleRequest[],
  signal: AbortSignal,
): Promise<ForecastLegWind[]> {
  if (requests.length === 0) {
    return [];
  }

  if (signal.aborted) {
    throw new DOMException('Forecast request was aborted', 'AbortError');
  }

  const forecastRequest = buildOpenMeteoForecastRequest(requests);
  const nowUtcMs = Date.now();
  const cached = forecastCache.get(forecastRequest.url);
  let retrievedAtUtcMs: number;
  let value: unknown;

  if (cached !== undefined && cached.expiresAtUtcMs > nowUtcMs) {
    retrievedAtUtcMs = cached.retrievedAtUtcMs;
    value = cached.value;
  } else {
    const fetched = await fetchForecastJson(forecastRequest.url, signal);
    const { response } = fetched;
    value = fetched.value;
    const apiErrorReason = getApiErrorReason(value);

    if (!response.ok || apiErrorReason !== null) {
      throw new Error(
        apiErrorReason ??
          `Open-Meteo request failed with HTTP ${response.status}`,
      );
    }

    retrievedAtUtcMs = Date.now();
    forecastCache.set(forecastRequest.url, {
      expiresAtUtcMs: retrievedAtUtcMs + CACHE_LIFETIME_MS,
      retrievedAtUtcMs,
      value,
    });
  }

  if (signal.aborted) {
    throw new DOMException('Forecast request was aborted', 'AbortError');
  }

  return parseOpenMeteoForecast(
    value,
    requests,
    forecastRequest.pressureLevels,
    { retrievedAtUtcMs },
  );
}

export async function fetchOpenMeteoLegWinds(
  requests: readonly WeatherSampleRequest[],
  signal: AbortSignal,
): Promise<ForecastLegWind[]> {
  const batches: WeatherSampleRequest[][] = [];

  for (let index = 0; index < requests.length; index += MAX_LOCATIONS_PER_REQUEST) {
    batches.push(requests.slice(index, index + MAX_LOCATIONS_PER_REQUEST));
  }

  const results = await Promise.all(
    batches.map((batch) => fetchOpenMeteoWindBatch(batch, signal)),
  );

  return results.flat();
}
