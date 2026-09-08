import { normalizeTrackDeg } from '../../calculations';
import type {
  FlightPlan,
  ManualLegWindOverride,
  RoutePlanningInputs,
  WindForecastModelId,
} from '../../domain';
import { DEFAULT_WIND_FORECAST_MODEL } from '../../weather';

export interface NavigationInputDraft {
  departureTimeUtc: string;
  magneticVariationMode: 'automatic-wmm2025' | 'manual';
  magneticVariationDeg: string;
  magneticVariationDirection: 'E' | 'W';
  windDirectionFromTrueDeg: string;
  windSpeedKt: string;
  windForecastModel: WindForecastModelId;
  manualLegWindOverrides: readonly ManualLegWindOverride[];
}

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const UTC_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/u;

export function formatUtcDateTimeInput(timestampUtcMs: number): string {
  if (!Number.isFinite(timestampUtcMs)) {
    throw new RangeError('UTC timestamp must be a finite number');
  }

  return new Date(timestampUtcMs).toISOString().slice(0, 16);
}

export function createDefaultNavigationInputDraft(
  nowUtcMs = Date.now(),
): NavigationInputDraft {
  const roundedDepartureTimeUtcMs =
    Math.ceil(nowUtcMs / FIVE_MINUTES_MS) * FIVE_MINUTES_MS;

  return {
    departureTimeUtc: formatUtcDateTimeInput(roundedDepartureTimeUtcMs),
    magneticVariationMode: 'automatic-wmm2025',
    magneticVariationDeg: '0',
    magneticVariationDirection: 'E',
    windDirectionFromTrueDeg: '0',
    windSpeedKt: '0',
    windForecastModel: DEFAULT_WIND_FORECAST_MODEL,
    manualLegWindOverrides: [],
  };
}

export function createNavigationInputDraft(
  inputs: RoutePlanningInputs,
): NavigationInputDraft {
  const variationMagnitude = Math.abs(inputs.magneticVariationDegEast);

  return {
    departureTimeUtc: formatUtcDateTimeInput(inputs.departureTimeUtcMs),
    magneticVariationMode: inputs.magneticVariationMode ?? 'manual',
    magneticVariationDeg: String(variationMagnitude),
    magneticVariationDirection:
      inputs.magneticVariationDegEast < 0 ? 'W' : 'E',
    windDirectionFromTrueDeg: String(inputs.wind.directionFromTrueDeg),
    windSpeedKt: String(inputs.wind.speedKt),
    windForecastModel: inputs.windForecastModel ?? DEFAULT_WIND_FORECAST_MODEL,
    manualLegWindOverrides: inputs.manualLegWindOverrides ?? [],
  };
}

export type NavigationInputParseResult =
  | { status: 'valid'; value: RoutePlanningInputs }
  | { status: 'invalid'; message: string };

function parseRequiredNumber(value: string, label: string): number | string {
  if (value.trim() === '') {
    return `${label} is required`;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : `${label} must be a number`;
}

export function parseUtcDateTimeInput(value: string): number | null {
  const match = UTC_DATE_TIME_PATTERN.exec(value);

  if (match === null) {
    return null;
  }

  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const parsed = new Date(0);

  parsed.setUTCFullYear(year, month - 1, day);
  parsed.setUTCHours(hour, minute, 0, 0);

  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day &&
    parsed.getUTCHours() === hour &&
    parsed.getUTCMinutes() === minute
    ? parsed.getTime()
    : null;
}

export function parseNavigationInputDraft(
  draft: NavigationInputDraft,
): NavigationInputParseResult {
  const departureTimeUtcMs = parseUtcDateTimeInput(draft.departureTimeUtc);

  if (departureTimeUtcMs === null) {
    return {
      status: 'invalid',
      message: 'Departure time must be a valid UTC date and time',
    };
  }

  if (
    draft.magneticVariationMode !== 'automatic-wmm2025' &&
    draft.magneticVariationMode !== 'manual'
  ) {
    return { status: 'invalid', message: 'Magnetic variation mode must be automatic or manual' };
  }

  const magneticVariationDeg = parseRequiredNumber(
    draft.magneticVariationDeg,
    'Magnetic variation',
  );

  if (typeof magneticVariationDeg === 'string') {
    return { status: 'invalid', message: magneticVariationDeg };
  }
  if (magneticVariationDeg < 0 || magneticVariationDeg > 180) {
    return {
      status: 'invalid',
      message: 'Magnetic variation must be between 0 and 180 degrees',
    };
  }
  if (
    draft.magneticVariationDirection !== 'E' &&
    draft.magneticVariationDirection !== 'W'
  ) {
    return {
      status: 'invalid',
      message: 'Magnetic variation direction must be east or west',
    };
  }
  // Retain the manual fallback value while automatic WMM is selected, so
  // switching modes does not discard the user's explicit variation.
  const magneticVariationDegEast = magneticVariationDeg === 0
    ? 0
    : draft.magneticVariationDirection === 'E'
      ? magneticVariationDeg
      : -magneticVariationDeg;

  const windDirectionFromTrueDeg = parseRequiredNumber(
    draft.windDirectionFromTrueDeg,
    'Wind direction',
  );

  if (typeof windDirectionFromTrueDeg === 'string') {
    return { status: 'invalid', message: windDirectionFromTrueDeg };
  }

  const windSpeedKt = parseRequiredNumber(draft.windSpeedKt, 'Wind speed');

  if (typeof windSpeedKt === 'string') {
    return { status: 'invalid', message: windSpeedKt };
  }

  if (windSpeedKt < 0) {
    return {
      status: 'invalid',
      message: 'Wind speed must not be negative',
    };
  }

  if (
    draft.windForecastModel !== 'ecmwf_ifs025' &&
    draft.windForecastModel !== 'icon_eu'
  ) {
    return { status: 'invalid', message: 'Wind forecast model is not supported' };
  }

  const seenLegs = new Set<string>();
  for (const override of draft.manualLegWindOverrides) {
    if (override.fromWaypointId === '' || override.toWaypointId === '') {
      return { status: 'invalid', message: 'Manual wind override requires two waypoints' };
    }
    const key = `${override.fromWaypointId}\u0000${override.toWaypointId}`;
    if (seenLegs.has(key)) {
      return { status: 'invalid', message: 'A leg can have only one manual wind override' };
    }
    seenLegs.add(key);
    if (!Number.isFinite(override.wind.directionFromTrueDeg) ||
        !Number.isFinite(override.wind.speedKt) || override.wind.speedKt < 0) {
      return { status: 'invalid', message: 'Manual wind override is invalid' };
    }
  }

  return {
    status: 'valid',
    value: {
      departureTimeUtcMs,
      windForecastModel: draft.windForecastModel,
      manualLegWindOverrides: draft.manualLegWindOverrides.map((override) => ({
        fromWaypointId: override.fromWaypointId,
        toWaypointId: override.toWaypointId,
        wind: {
          directionFromTrueDeg: normalizeTrackDeg(override.wind.directionFromTrueDeg),
          speedKt: override.wind.speedKt,
        },
      })),
      magneticVariationMode: draft.magneticVariationMode,
      magneticVariationDegEast,
      wind: {
        directionFromTrueDeg: normalizeTrackDeg(windDirectionFromTrueDeg),
        speedKt: windSpeedKt,
      },
    },
  };
}

/** Drops overrides whose exact adjacency no longer exists after a route edit. */
export function reconcileManualLegWindOverrides(
  flightPlan: FlightPlan,
  overrides: readonly ManualLegWindOverride[],
): readonly ManualLegWindOverride[] {
  const adjacentLegs = new Set(
    flightPlan.waypoints.slice(1).map((to, index) =>
      `${flightPlan.waypoints[index]!.id}\u0000${to.id}`,
    ),
  );
  const seen = new Set<string>();
  return overrides.flatMap((override) => {
    const key = `${override.fromWaypointId}\u0000${override.toWaypointId}`;
    if (!adjacentLegs.has(key) || seen.has(key)) return [];
    seen.add(key);
    return [override];
  });
}
