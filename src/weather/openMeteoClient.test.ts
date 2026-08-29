import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchOpenMeteoLegWinds,
  OPEN_METEO_REQUEST_TIMEOUT_MS,
} from './openMeteoClient';
import {
  buildOpenMeteoForecastRequest,
  FEET_TO_METERS,
} from './openMeteoForecast';
import type { WeatherSampleRequest } from './types';

const request: WeatherSampleRequest = {
  fromId: 'cache-a',
  toId: 'cache-b',
  position: { latitude: 60.987654, longitude: 10.123456 },
  timeUtcMs: Date.UTC(2026, 7, 27, 12),
  altitudeFtMsl: 500 / FEET_TO_METERS,
};

function createResponse() {
  const pressureLevels = buildOpenMeteoForecastRequest([request]).pressureLevels;
  const hourly: Record<string, number[]> = {
    time: [request.timeUtcMs / 1000],
  };

  for (const { pressureHpa, approximateAltitudeMeters } of pressureLevels) {
    hourly[`wind_speed_${pressureHpa}hPa`] = [10];
    hourly[`wind_direction_${pressureHpa}hPa`] = [270];
    hourly[`geopotential_height_${pressureHpa}hPa`] = [
      approximateAltitudeMeters,
    ];
  }

  return { hourly };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Open-Meteo client provenance', () => {
  it('retains the original retrieval time when reusing a cached response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => createResponse(),
    });
    const nowMock = vi.spyOn(Date, 'now').mockReturnValue(2_000);
    const signal = new AbortController().signal;
    vi.stubGlobal('fetch', fetchMock);

    const first = await fetchOpenMeteoLegWinds([request], signal);
    nowMock.mockReturnValue(5_000);
    const second = await fetchOpenMeteoLegWinds([request], signal);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      'models=ecmwf_ifs025',
    );
    expect(first[0]?.retrievedAtUtcMs).toBe(2_000);
    expect(second[0]?.retrievedAtUtcMs).toBe(2_000);
  });

  it('surfaces the provider reason when Open-Meteo rejects a request', async () => {
    const rejectedRequest: WeatherSampleRequest = {
      ...request,
      position: { latitude: 61.123456, longitude: 11.123456 },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({
        error: true,
        reason: 'Daily API request limit exceeded. Please try again tomorrow.',
      }),
    }));

    await expect(
      fetchOpenMeteoLegWinds(
        [rejectedRequest],
        new AbortController().signal,
      ),
    ).rejects.toThrow('Daily API request limit exceeded');
  });

  it('times out a forecast request that never completes', async () => {
    vi.useFakeTimers();
    const stalledRequest: WeatherSampleRequest = {
      ...request,
      position: { latitude: 62.123456, longitude: 12.123456 },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string | URL | Request, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          const requestSignal = init?.signal;
          requestSignal?.addEventListener(
            'abort',
            () => reject(requestSignal.reason),
            { once: true },
          );
        }),
      ),
    );

    const result = fetchOpenMeteoLegWinds(
      [stalledRequest],
      new AbortController().signal,
    );
    const expectation = expect(result).rejects.toThrow(
      'Open-Meteo request timed out after 20 seconds',
    );

    await vi.advanceTimersByTimeAsync(OPEN_METEO_REQUEST_TIMEOUT_MS);
    await expectation;
  });
});
