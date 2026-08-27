import { describe, expect, it } from 'vitest';

import type { ForecastLegWind } from '../../weather';
import {
  FORECAST_SOURCE_LABEL,
  formatForecastRetrievalTime,
  formatForecastValidTimeRange,
  formatForecastWindDetails,
} from './weatherFormatting';

const forecast: ForecastLegWind = {
  fromId: 'A',
  toId: 'B',
  source: 'forecast',
  provider: 'open-meteo',
  model: 'ecmwf_ifs025',
  retrievedAtUtcMs: Date.UTC(2026, 7, 27, 11, 55),
  wind: { directionFromTrueDeg: 270, speedKt: 15 },
  sampledPosition: { latitude: 60, longitude: 10 },
  sampledTimeUtcMs: Date.UTC(2026, 7, 27, 12, 30),
  altitudeFtMsl: 5000,
  effectiveAltitudeMetersMsl: 1524,
  altitudeClamped: false,
  pressureLevelRangeHpa: [900, 850],
  geopotentialHeightRangeMetersMsl: [1010, 1510],
};

describe('forecast provenance formatting', () => {
  it('uses an explicit model and provider label', () => {
    expect(FORECAST_SOURCE_LABEL).toBe('ECMWF IFS 0.25° via Open-Meteo');
  });

  it('formats the valid-time range and latest retrieval time', () => {
    const laterForecast: ForecastLegWind = {
      ...forecast,
      sampledTimeUtcMs: Date.UTC(2026, 7, 27, 13, 45),
      retrievedAtUtcMs: Date.UTC(2026, 7, 27, 11, 57),
    };

    expect(formatForecastValidTimeRange([forecast, laterForecast])).toBe(
      '2026-08-27 12:30Z – 2026-08-27 13:45Z',
    );
    expect(formatForecastRetrievalTime([forecast, laterForecast])).toBe(
      '2026-08-27 11:57Z',
    );
  });

  it('describes vertical interpolation for a leg', () => {
    expect(formatForecastWindDetails(forecast)).toBe(
      'ECMWF IFS 0.25° via Open-Meteo; valid 2026-08-27 12:30Z; requested 5000 ft MSL, vertically interpolated using 900–850 hPa (1010–1510 m geopotential height); retrieved 2026-08-27 11:55Z',
    );
  });

  it('describes altitude clamping to one model level', () => {
    expect(
      formatForecastWindDetails({
        ...forecast,
        altitudeClamped: true,
        effectiveAltitudeMetersMsl: 1000,
        pressureLevelRangeHpa: [900, 900],
        geopotentialHeightRangeMetersMsl: [1000, 1000],
      }),
    ).toContain('clamped to 3281 ft MSL at 900 hPa');
  });

  it('uses an em dash for an empty forecast collection', () => {
    expect(formatForecastValidTimeRange([])).toBe('—');
    expect(formatForecastRetrievalTime([])).toBe('—');
  });
});
