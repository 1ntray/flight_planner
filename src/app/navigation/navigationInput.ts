import { normalizeTrackDeg } from '../../calculations';
import type { NavigationParameters } from '../../domain';

export interface NavigationInputDraft {
  trueAirspeedKt: string;
  windDirectionFromTrueDeg: string;
  windSpeedKt: string;
}

export const DEFAULT_NAVIGATION_INPUT_DRAFT: NavigationInputDraft = {
  trueAirspeedKt: '100',
  windDirectionFromTrueDeg: '0',
  windSpeedKt: '0',
};

export type NavigationInputParseResult =
  | { status: 'valid'; value: NavigationParameters }
  | { status: 'invalid'; message: string };

function parseRequiredNumber(value: string, label: string): number | string {
  if (value.trim() === '') {
    return `${label} is required`;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : `${label} must be a number`;
}

export function parseNavigationInputDraft(
  draft: NavigationInputDraft,
): NavigationInputParseResult {
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
      trueAirspeedKt,
      wind: {
        directionFromTrueDeg: normalizeTrackDeg(windDirectionFromTrueDeg),
        speedKt: windSpeedKt,
      },
    },
  };
}
