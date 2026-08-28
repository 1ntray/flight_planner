import { normalizeTrackDeg } from '../calculations';
import type { Wind } from '../domain';
import type { ForecastLegWind, WeatherSampleRequest } from './types';

export const FEET_TO_METERS = 0.3048;
export const OPEN_METEO_FORECAST_MODEL = 'ecmwf_ifs025' as const;
export const OPEN_METEO_FORECAST_MODEL_LABEL = 'ECMWF IFS 0.25°';
export const OPEN_METEO_FORECAST_PROVIDER = 'open-meteo' as const;
export const OPEN_METEO_FORECAST_PROVIDER_LABEL = 'Open-Meteo';

const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;
const SECONDS_PER_MILLISECOND = 1 / 1000;
const DEGREES_TO_RADIANS = Math.PI / 180;
const RADIANS_TO_DEGREES = 180 / Math.PI;
const CALM_WIND_EPSILON_KT = 1e-9;
const PRESSURE_LEVEL_COUNT = 4;

export interface OpenMeteoPressureLevel {
  pressureHpa: number;
  approximateAltitudeMeters: number;
}

export const OPEN_METEO_PRESSURE_LEVELS: readonly OpenMeteoPressureLevel[] = [
  { pressureHpa: 1000, approximateAltitudeMeters: 110 },
  { pressureHpa: 975, approximateAltitudeMeters: 320 },
  { pressureHpa: 950, approximateAltitudeMeters: 500 },
  { pressureHpa: 925, approximateAltitudeMeters: 800 },
  { pressureHpa: 900, approximateAltitudeMeters: 1000 },
  { pressureHpa: 850, approximateAltitudeMeters: 1500 },
  { pressureHpa: 800, approximateAltitudeMeters: 1900 },
  { pressureHpa: 700, approximateAltitudeMeters: 3000 },
  { pressureHpa: 600, approximateAltitudeMeters: 4200 },
  { pressureHpa: 500, approximateAltitudeMeters: 5600 },
  { pressureHpa: 400, approximateAltitudeMeters: 7200 },
  { pressureHpa: 300, approximateAltitudeMeters: 9200 },
  { pressureHpa: 250, approximateAltitudeMeters: 10400 },
  { pressureHpa: 200, approximateAltitudeMeters: 11800 },
  { pressureHpa: 150, approximateAltitudeMeters: 13600 },
  { pressureHpa: 100, approximateAltitudeMeters: 15800 },
  { pressureHpa: 70, approximateAltitudeMeters: 17700 },
  { pressureHpa: 50, approximateAltitudeMeters: 19300 },
  { pressureHpa: 30, approximateAltitudeMeters: 22000 },
];

export interface OpenMeteoForecastRequest {
  url: string;
  model: typeof OPEN_METEO_FORECAST_MODEL;
  pressureLevels: readonly OpenMeteoPressureLevel[];
}

export interface OpenMeteoForecastMetadata {
  retrievedAtUtcMs: number;
}

interface WindVector {
  eastKt: number;
  northKt: number;
}

interface LevelWindSample extends WindVector {
  heightMetersMsl: number;
  pressureHpa: number;
}

function requireFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be a finite number`);
  }
}

export function windFromDirectionToVector(wind: Wind): WindVector {
  requireFinite(wind.directionFromTrueDeg, 'Wind direction');
  requireFinite(wind.speedKt, 'Wind speed');

  if (wind.speedKt < 0) {
    throw new RangeError('Wind speed must not be negative');
  }

  const directionRad = wind.directionFromTrueDeg * DEGREES_TO_RADIANS;

  return {
    eastKt: -wind.speedKt * Math.sin(directionRad),
    northKt: -wind.speedKt * Math.cos(directionRad),
  };
}

export function windVectorToFromDirection(vector: WindVector): Wind {
  requireFinite(vector.eastKt, 'Eastward wind component');
  requireFinite(vector.northKt, 'Northward wind component');

  const speedKt = Math.hypot(vector.eastKt, vector.northKt);

  if (speedKt <= CALM_WIND_EPSILON_KT) {
    return { directionFromTrueDeg: 0, speedKt: 0 };
  }

  return {
    directionFromTrueDeg: normalizeTrackDeg(
      Math.atan2(-vector.eastKt, -vector.northKt) * RADIANS_TO_DEGREES,
    ),
    speedKt,
  };
}

export function interpolateWindVectors(
  first: Wind,
  second: Wind,
  fraction: number,
): Wind {
  requireFinite(fraction, 'Interpolation fraction');

  if (fraction < 0 || fraction > 1) {
    throw new RangeError('Interpolation fraction must be between zero and one');
  }

  const firstVector = windFromDirectionToVector(first);
  const secondVector = windFromDirectionToVector(second);

  return windVectorToFromDirection({
    eastKt: firstVector.eastKt +
      (secondVector.eastKt - firstVector.eastKt) * fraction,
    northKt: firstVector.northKt +
      (secondVector.northKt - firstVector.northKt) * fraction,
  });
}

export function selectPressureLevelsForAltitude(
  altitudeFtMsl: number,
): readonly OpenMeteoPressureLevel[] {
  requireFinite(altitudeFtMsl, 'Planned altitude');

  if (altitudeFtMsl < 0) {
    throw new RangeError('Planned altitude must not be negative');
  }

  const altitudeMetersMsl = altitudeFtMsl * FEET_TO_METERS;
  const firstHigherIndex = OPEN_METEO_PRESSURE_LEVELS.findIndex(
    (level) => level.approximateAltitudeMeters >= altitudeMetersMsl,
  );
  const lowerBracketIndex =
    firstHigherIndex === -1
      ? OPEN_METEO_PRESSURE_LEVELS.length - 1
      : Math.max(0, firstHigherIndex - 1);
  let startIndex = Math.max(0, lowerBracketIndex - 1);
  let endIndex = Math.min(
    OPEN_METEO_PRESSURE_LEVELS.length,
    startIndex + PRESSURE_LEVEL_COUNT,
  );

  startIndex = Math.max(0, endIndex - PRESSURE_LEVEL_COUNT);

  return OPEN_METEO_PRESSURE_LEVELS.slice(startIndex, endIndex);
}

function formatHourUtc(timestampUtcMs: number): string {
  return `${new Date(timestampUtcMs).toISOString().slice(0, 13)}:00`;
}

export function buildOpenMeteoForecastRequest(
  requests: readonly WeatherSampleRequest[],
): OpenMeteoForecastRequest {
  if (requests.length === 0) {
    throw new RangeError('At least one weather sample request is required');
  }

  for (const request of requests) {
    requireFinite(request.position.latitude, 'Weather latitude');
    requireFinite(request.position.longitude, 'Weather longitude');
    requireFinite(request.timeUtcMs, 'Weather sample time');
    requireFinite(request.altitudeFtMsl, 'Weather sampling altitude');
  }

  const selectedPressureValues = new Set(
    requests.flatMap((request) =>
      selectPressureLevelsForAltitude(request.altitudeFtMsl).map(
        ({ pressureHpa }) => pressureHpa,
      ),
    ),
  );
  const pressureLevels = OPEN_METEO_PRESSURE_LEVELS.filter(({ pressureHpa }) =>
    selectedPressureValues.has(pressureHpa),
  );
  const hourlyVariables = pressureLevels.flatMap(({ pressureHpa }) => [
    `wind_speed_${pressureHpa}hPa`,
    `wind_direction_${pressureHpa}hPa`,
    `geopotential_height_${pressureHpa}hPa`,
  ]);
  const sampleTimes = requests.map((request) => request.timeUtcMs);
  const startTimeUtcMs =
    Math.floor(Math.min(...sampleTimes) / MILLISECONDS_PER_HOUR) *
    MILLISECONDS_PER_HOUR;
  const endTimeUtcMs =
    Math.ceil(Math.max(...sampleTimes) / MILLISECONDS_PER_HOUR) *
    MILLISECONDS_PER_HOUR;
  const url = new URL('https://api.open-meteo.com/v1/forecast');

  url.searchParams.set(
    'latitude',
    requests.map((request) => request.position.latitude.toFixed(6)).join(','),
  );
  url.searchParams.set(
    'longitude',
    requests.map((request) => request.position.longitude.toFixed(6)).join(','),
  );
  url.searchParams.set('hourly', hourlyVariables.join(','));
  url.searchParams.set('models', OPEN_METEO_FORECAST_MODEL);
  url.searchParams.set('wind_speed_unit', 'kn');
  url.searchParams.set('timeformat', 'unixtime');
  url.searchParams.set('timezone', 'GMT');
  url.searchParams.set('cell_selection', 'nearest');
  url.searchParams.set('start_hour', formatHourUtc(startTimeUtcMs));
  url.searchParams.set('end_hour', formatHourUtc(endTimeUtcMs));

  return {
    url: url.toString(),
    model: OPEN_METEO_FORECAST_MODEL,
    pressureLevels,
  };
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} is missing or invalid`);
  }

  return value as Record<string, unknown>;
}

function asNumberArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} is missing or invalid`);
  }

  return value;
}

function finiteArrayValue(
  values: readonly unknown[],
  index: number,
): number | null {
  const value = values[index];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function findTimeBracket(
  timesSeconds: readonly unknown[],
  targetTimeUtcMs: number,
): { lowerIndex: number; upperIndex: number; fraction: number } {
  const numericTimes = timesSeconds.map((value) =>
    typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN,
  );

  if (numericTimes.some((value) => !Number.isFinite(value))) {
    throw new Error('Open-Meteo returned an invalid hourly time array');
  }

  const targetSeconds = targetTimeUtcMs * SECONDS_PER_MILLISECOND;
  const upperIndex = numericTimes.findIndex((time) => time >= targetSeconds);

  if (upperIndex === -1 || targetSeconds < numericTimes[0]!) {
    throw new Error('Open-Meteo response does not bracket the requested time');
  }

  if (numericTimes[upperIndex] === targetSeconds || upperIndex === 0) {
    return { lowerIndex: upperIndex, upperIndex, fraction: 0 };
  }

  const lowerIndex = upperIndex - 1;
  const lowerTime = numericTimes[lowerIndex]!;
  const upperTime = numericTimes[upperIndex]!;

  if (upperTime <= lowerTime) {
    throw new Error('Open-Meteo hourly times must be strictly increasing');
  }

  return {
    lowerIndex,
    upperIndex,
    fraction: (targetSeconds - lowerTime) / (upperTime - lowerTime),
  };
}

function createTemporalLevelSample(
  hourly: Record<string, unknown>,
  level: OpenMeteoPressureLevel,
  bracket: ReturnType<typeof findTimeBracket>,
): LevelWindSample | null {
  const suffix = `${level.pressureHpa}hPa`;
  const speeds = asNumberArray(
    hourly[`wind_speed_${suffix}`],
    `Open-Meteo wind speed at ${level.pressureHpa} hPa`,
  );
  const directions = asNumberArray(
    hourly[`wind_direction_${suffix}`],
    `Open-Meteo wind direction at ${level.pressureHpa} hPa`,
  );
  const heights = asNumberArray(
    hourly[`geopotential_height_${suffix}`],
    `Open-Meteo geopotential height at ${level.pressureHpa} hPa`,
  );
  const readSample = (index: number) => {
    const speedKt = finiteArrayValue(speeds, index);
    const directionFromTrueDeg = finiteArrayValue(directions, index);
    const heightMetersMsl = finiteArrayValue(heights, index);

    if (
      speedKt === null ||
      speedKt < 0 ||
      directionFromTrueDeg === null ||
      heightMetersMsl === null
    ) {
      return null;
    }

    return {
      wind: { directionFromTrueDeg, speedKt },
      heightMetersMsl,
    };
  };
  const lower = readSample(bracket.lowerIndex);

  if (lower === null) {
    return null;
  }

  if (bracket.lowerIndex === bracket.upperIndex) {
    return {
      ...windFromDirectionToVector(lower.wind),
      heightMetersMsl: lower.heightMetersMsl,
      pressureHpa: level.pressureHpa,
    };
  }

  const upper = readSample(bracket.upperIndex);

  if (upper === null) {
    return null;
  }

  const wind = interpolateWindVectors(lower.wind, upper.wind, bracket.fraction);

  return {
    ...windFromDirectionToVector(wind),
    heightMetersMsl:
      lower.heightMetersMsl +
      (upper.heightMetersMsl - lower.heightMetersMsl) * bracket.fraction,
    pressureHpa: level.pressureHpa,
  };
}

function interpolateVertically(
  samples: readonly LevelWindSample[],
  targetHeightMetersMsl: number,
): {
  wind: Wind;
  effectiveAltitudeMetersMsl: number;
  altitudeClamped: boolean;
  pressureLevelRangeHpa: readonly [number, number];
  geopotentialHeightRangeMetersMsl: readonly [number, number];
} {
  if (samples.length === 0) {
    throw new Error('Open-Meteo returned no usable pressure-level wind data');
  }

  const ordered = [...samples].sort(
    (first, second) => first.heightMetersMsl - second.heightMetersMsl,
  );
  const lowest = ordered[0]!;
  const highest = ordered.at(-1)!;

  if (targetHeightMetersMsl <= lowest.heightMetersMsl) {
    return {
      wind: windVectorToFromDirection(lowest),
      effectiveAltitudeMetersMsl: lowest.heightMetersMsl,
      altitudeClamped: targetHeightMetersMsl < lowest.heightMetersMsl,
      pressureLevelRangeHpa: [lowest.pressureHpa, lowest.pressureHpa],
      geopotentialHeightRangeMetersMsl: [
        lowest.heightMetersMsl,
        lowest.heightMetersMsl,
      ],
    };
  }

  if (targetHeightMetersMsl >= highest.heightMetersMsl) {
    return {
      wind: windVectorToFromDirection(highest),
      effectiveAltitudeMetersMsl: highest.heightMetersMsl,
      altitudeClamped: targetHeightMetersMsl > highest.heightMetersMsl,
      pressureLevelRangeHpa: [highest.pressureHpa, highest.pressureHpa],
      geopotentialHeightRangeMetersMsl: [
        highest.heightMetersMsl,
        highest.heightMetersMsl,
      ],
    };
  }

  const upperIndex = ordered.findIndex(
    (sample) => sample.heightMetersMsl >= targetHeightMetersMsl,
  );
  const lower = ordered[upperIndex - 1]!;
  const upper = ordered[upperIndex]!;
  const heightDifference = upper.heightMetersMsl - lower.heightMetersMsl;
  const fraction =
    heightDifference === 0
      ? 0
      : (targetHeightMetersMsl - lower.heightMetersMsl) / heightDifference;

  return {
    wind: windVectorToFromDirection({
      eastKt: lower.eastKt + (upper.eastKt - lower.eastKt) * fraction,
      northKt: lower.northKt + (upper.northKt - lower.northKt) * fraction,
    }),
    effectiveAltitudeMetersMsl: targetHeightMetersMsl,
    altitudeClamped: false,
    pressureLevelRangeHpa: [lower.pressureHpa, upper.pressureHpa],
    geopotentialHeightRangeMetersMsl: [
      lower.heightMetersMsl,
      upper.heightMetersMsl,
    ],
  };
}

function parseLocationForecast(
  value: unknown,
  request: WeatherSampleRequest,
  pressureLevels: readonly OpenMeteoPressureLevel[],
  metadata: OpenMeteoForecastMetadata,
): ForecastLegWind {
  const location = asRecord(value, 'Open-Meteo location forecast');
  const hourly = asRecord(location.hourly, 'Open-Meteo hourly forecast');
  const times = asNumberArray(hourly.time, 'Open-Meteo hourly time');
  const bracket = findTimeBracket(times, request.timeUtcMs);
  const samples = pressureLevels.flatMap((level) => {
    const sample = createTemporalLevelSample(hourly, level, bracket);
    return sample === null ? [] : [sample];
  });
  const vertical = interpolateVertically(
    samples,
    request.altitudeFtMsl * FEET_TO_METERS,
  );

  return {
    fromId: request.fromId,
    toId: request.toId,
    source: 'forecast',
    provider: OPEN_METEO_FORECAST_PROVIDER,
    model: OPEN_METEO_FORECAST_MODEL,
    retrievedAtUtcMs: metadata.retrievedAtUtcMs,
    wind: vertical.wind,
    sampledPosition: request.position,
    sampledTimeUtcMs: request.timeUtcMs,
    altitudeFtMsl: request.altitudeFtMsl,
    effectiveAltitudeMetersMsl: vertical.effectiveAltitudeMetersMsl,
    altitudeClamped: vertical.altitudeClamped,
    pressureLevelRangeHpa: vertical.pressureLevelRangeHpa,
    geopotentialHeightRangeMetersMsl:
      vertical.geopotentialHeightRangeMetersMsl,
  };
}

export function parseOpenMeteoForecast(
  value: unknown,
  requests: readonly WeatherSampleRequest[],
  pressureLevels: readonly OpenMeteoPressureLevel[],
  metadata: OpenMeteoForecastMetadata,
): ForecastLegWind[] {
  requireFinite(metadata.retrievedAtUtcMs, 'Forecast retrieval time');
  const locations = Array.isArray(value) ? value : [value];

  if (locations.length !== requests.length) {
    throw new Error(
      `Open-Meteo returned ${locations.length} locations for ${requests.length} requests`,
    );
  }

  return requests.map((request, index) =>
    parseLocationForecast(
      locations[index],
      request,
      pressureLevels,
      metadata,
    ),
  );
}
