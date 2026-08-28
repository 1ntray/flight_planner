import { normalizeTrackDeg } from '../../calculations';
import type { NavigationPlanInputs } from '../../domain';

export interface NavigationInputDraft {
  departureTimeUtc: string;
  trueAirspeedKt: string;
  plannedAltitudeFtMsl: string;
  magneticVariationDeg: string;
  magneticVariationDirection: 'E' | 'W';
  windDirectionFromTrueDeg: string;
  windSpeedKt: string;
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
    trueAirspeedKt: '100',
    plannedAltitudeFtMsl: '3000',
    magneticVariationDeg: '0',
    magneticVariationDirection: 'E',
    windDirectionFromTrueDeg: '0',
    windSpeedKt: '0',
  };
}

export type NavigationInputParseResult =
  | { status: 'valid'; value: NavigationPlanInputs }
  | { status: 'invalid'; message: string };

function parseRequiredNumber(value: string, label: string): number | string {
  if (value.trim() === '') {
    return `${label} is required`;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : `${label} must be a number`;
}

function parseUtcDateTime(value: string): number | null {
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
  const departureTimeUtcMs = parseUtcDateTime(draft.departureTimeUtc);

  if (departureTimeUtcMs === null) {
    return {
      status: 'invalid',
      message: 'Departure time must be a valid UTC date and time',
    };
  }

  const trueAirspeedKt = parseRequiredNumber(
    draft.trueAirspeedKt,
    'True airspeed',
  );

  if (typeof trueAirspeedKt === 'string') {
    return { status: 'invalid', message: trueAirspeedKt };
  }

  if (trueAirspeedKt <= 0) {
    return {
      status: 'invalid',
      message: 'True airspeed must be greater than zero',
    };
  }

  const plannedAltitudeFtMsl = parseRequiredNumber(
    draft.plannedAltitudeFtMsl,
    'Planned altitude',
  );

  if (typeof plannedAltitudeFtMsl === 'string') {
    return { status: 'invalid', message: plannedAltitudeFtMsl };
  }

  if (plannedAltitudeFtMsl < 0) {
    return {
      status: 'invalid',
      message: 'Planned altitude must not be negative',
    };
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

  return {
    status: 'valid',
    value: {
      departureTimeUtcMs,
      trueAirspeedKt,
      plannedAltitudeFtMsl,
      magneticVariationDegEast:
        magneticVariationDeg === 0
          ? 0
          : draft.magneticVariationDirection === 'E'
            ? magneticVariationDeg
            : -magneticVariationDeg,
      wind: {
        directionFromTrueDeg: normalizeTrackDeg(windDirectionFromTrueDeg),
        speedKt: windSpeedKt,
      },
    },
  };
}
