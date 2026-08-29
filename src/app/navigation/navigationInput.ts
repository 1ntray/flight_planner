import { normalizeTrackDeg } from '../../calculations';
import type { RoutePlanningInputs } from '../../domain';

export interface NavigationInputDraft {
  departureTimeUtc: string;
  magneticVariationMode: 'automatic-wmm2025' | 'manual';
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
    magneticVariationMode: 'automatic-wmm2025',
    magneticVariationDeg: '0',
    magneticVariationDirection: 'E',
    windDirectionFromTrueDeg: '0',
    windSpeedKt: '0',
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

  return {
    status: 'valid',
    value: {
      departureTimeUtcMs,
      magneticVariationMode: draft.magneticVariationMode,
      magneticVariationDegEast,
      wind: {
        directionFromTrueDeg: normalizeTrackDeg(windDirectionFromTrueDeg),
        speedKt: windSpeedKt,
      },
    },
  };
}
