import { describe, expect, it } from 'vitest';

import type { WeatherSampleRequest } from './types';
import {
  buildOpenMeteoForecastRequest,
  FEET_TO_METERS,
  interpolateWindVectors,
  parseOpenMeteoForecast,
  selectPressureLevelsForAltitude,
  windFromDirectionToVector,
  windVectorToFromDirection,
} from './openMeteoForecast';

const request: WeatherSampleRequest = {
  fromId: 'A',
  toId: 'B',
  position: { latitude: 60.1234567, longitude: 10.7654321 },
  timeUtcMs: Date.UTC(2026, 7, 27, 12, 30),
  altitudeFtMsl: 500 / FEET_TO_METERS,
};
const metadata = {
  retrievedAtUtcMs: Date.UTC(2026, 7, 27, 11, 55),
};

describe('wind vector conversion and interpolation', () => {
  it('round-trips meteorological direction-from winds through vector components', () => {
    const wind = { directionFromTrueDeg: 90, speedKt: 25 };
    const vector = windFromDirectionToVector(wind);

    expect(vector.eastKt).toBeCloseTo(-25, 12);
    expect(vector.northKt).toBeCloseTo(0, 12);
    expect(windVectorToFromDirection(vector)).toEqual(
      expect.objectContaining({ speedKt: expect.closeTo(25, 12) }),
    );
    expect(windVectorToFromDirection(vector).directionFromTrueDeg).toBeCloseTo(
      90,
      12,
    );
  });

  it('interpolates across north without producing a southerly wind', () => {
    const result = interpolateWindVectors(
      { directionFromTrueDeg: 350, speedKt: 10 },
      { directionFromTrueDeg: 10, speedKt: 10 },
      0.5,
    );

    expect(result.directionFromTrueDeg).toBeCloseTo(0, 12);
    expect(result.speedKt).toBeCloseTo(9.84807753, 8);
  });

  it('represents equal opposing winds as calm', () => {
    expect(
      interpolateWindVectors(
        { directionFromTrueDeg: 90, speedKt: 10 },
        { directionFromTrueDeg: 270, speedKt: 10 },
        0.5,
      ),
    ).toEqual({ directionFromTrueDeg: 0, speedKt: 0 });
  });
});

describe('Open-Meteo request construction', () => {
  it('selects four pressure levels around the approximate requested altitude', () => {
    expect(
      selectPressureLevelsForAltitude(3000).map((level) => level.pressureHpa),
    ).toEqual([950, 925, 900, 850]);
  });

  it('requests UTC Unix data, knots, geopotential height, and bracketing hours', () => {
    const built = buildOpenMeteoForecastRequest([request]);
    const url = new URL(built.url);

    expect(url.origin + url.pathname).toBe(
      'https://api.open-meteo.com/v1/forecast',
    );
    expect(url.searchParams.get('latitude')).toBe('60.123457');
    expect(url.searchParams.get('longitude')).toBe('10.765432');
    expect(url.searchParams.get('wind_speed_unit')).toBe('kn');
    expect(url.searchParams.get('timeformat')).toBe('unixtime');
    expect(url.searchParams.get('timezone')).toBe('GMT');
    expect(url.searchParams.get('models')).toBe('ecmwf_ifs025');
    expect(url.searchParams.get('start_hour')).toBe('2026-08-27T12:00');
    expect(url.searchParams.get('end_hour')).toBe('2026-08-27T13:00');
    expect(url.searchParams.get('hourly')).toContain(
      'geopotential_height_950hPa',
    );
    expect(built.model).toBe('ecmwf_ifs025');
  });

  it('unions pressure levels when a batch contains several altitudes', () => {
    const built = buildOpenMeteoForecastRequest([
      request,
      { ...request, altitudeFtMsl: 10_000 },
    ]);

    expect(built.pressureLevels.length).toBeGreaterThan(4);
    expect(built.pressureLevels.map(({ pressureHpa }) => pressureHpa)).toContain(1000);
    expect(built.pressureLevels.map(({ pressureHpa }) => pressureHpa)).toContain(700);
  });
});

describe('Open-Meteo forecast interpolation', () => {
  const pressureLevels = [
    { pressureHpa: 1000, approximateAltitudeMeters: 0 },
    { pressureHpa: 900, approximateAltitudeMeters: 1000 },
  ];
  const response = {
    hourly: {
      time: [
        Date.UTC(2026, 7, 27, 12) / 1000,
        Date.UTC(2026, 7, 27, 13) / 1000,
      ],
      wind_speed_1000hPa: [10, 10],
      wind_direction_1000hPa: [350, 10],
      geopotential_height_1000hPa: [0, 0],
      wind_speed_900hPa: [20, 20],
      wind_direction_900hPa: [350, 10],
      geopotential_height_900hPa: [1000, 1000],
    },
  };

  it('interpolates vector components in time and actual geopotential height', () => {
    const [result] = parseOpenMeteoForecast(
      response,
      [request],
      pressureLevels,
      metadata,
    );

    expect(result).toMatchObject({
      fromId: 'A',
      toId: 'B',
      source: 'forecast',
      provider: 'open-meteo',
      model: 'ecmwf_ifs025',
      retrievedAtUtcMs: metadata.retrievedAtUtcMs,
      effectiveAltitudeMetersMsl: 500,
      altitudeClamped: false,
      pressureLevelRangeHpa: [1000, 900],
      geopotentialHeightRangeMetersMsl: [0, 1000],
    });
    expect(result?.wind.directionFromTrueDeg).toBeCloseTo(0, 12);
    expect(result?.wind.speedKt).toBeCloseTo(14.7721163, 7);
  });

  it('clamps to the nearest usable pressure level outside the returned heights', () => {
    const [result] = parseOpenMeteoForecast(
      response,
      [{ ...request, altitudeFtMsl: 2000 / FEET_TO_METERS }],
      pressureLevels,
      metadata,
    );

    expect(result?.altitudeClamped).toBe(true);
    expect(result?.effectiveAltitudeMetersMsl).toBe(1000);
    expect(result?.pressureLevelRangeHpa).toEqual([900, 900]);
    expect(result?.geopotentialHeightRangeMetersMsl).toEqual([1000, 1000]);
    expect(result?.wind.speedKt).toBeCloseTo(19.6961551, 7);
  });

  it('rejects a response with the wrong number of locations', () => {
    expect(() =>
      parseOpenMeteoForecast(
        [response, response],
        [request],
        pressureLevels,
        metadata,
      ),
    ).toThrow('returned 2 locations for 1 requests');
  });

  it('maps batched location responses back to route legs in request order', () => {
    const secondRequest: WeatherSampleRequest = {
      ...request,
      fromId: 'B',
      toId: 'C',
      position: { latitude: 61, longitude: 11 },
    };
    const results = parseOpenMeteoForecast(
      [response, response],
      [request, secondRequest],
      pressureLevels,
      metadata,
    );

    expect(results.map(({ fromId, toId, sampledPosition }) => ({
      fromId,
      toId,
      sampledPosition,
    }))).toEqual([
      { fromId: 'A', toId: 'B', sampledPosition: request.position },
      { fromId: 'B', toId: 'C', sampledPosition: secondRequest.position },
    ]);
  });

  it('rejects an invalid retrieval timestamp', () => {
    expect(() =>
      parseOpenMeteoForecast(response, [request], pressureLevels, {
        retrievedAtUtcMs: Number.NaN,
      }),
    ).toThrow('Forecast retrieval time must be a finite number');
  });
});
