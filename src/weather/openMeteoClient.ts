import {
  buildOpenMeteoForecastRequest,
  parseOpenMeteoForecast,
} from './openMeteoForecast';
import type { ForecastLegWind, WeatherSampleRequest } from './types';

const CACHE_LIFETIME_MS = 10 * 60 * 1000;
const MAX_LOCATIONS_PER_REQUEST = 40;

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
    const response = await fetch(forecastRequest.url, {
      headers: { Accept: 'application/json' },
      signal,
    });

    value = await response.json();
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
