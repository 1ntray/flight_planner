import type { AirportWind } from '../weather';

import { calculateNavlogDirectionDisplay, roundNavlogAccumulatedIncrement, roundNavlogValue } from '../app/route/navlogPresentation';
import {
  formatGroundSpeedKtValue,
  formatUtcRouteTime,
  formatWindValue,
} from '../app/route/routeFormatting';

export function formatOptionalNumber(value: number | null, decimals = 0): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  return decimals === 0 ? roundNavlogValue(value).toString() : value.toFixed(decimals);
}

export function formatHeading(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  const normalized = ((Math.round(value) % 360) + 360) % 360;
  return `${normalized.toString().padStart(3, '0')}°`;
}

export function formatVariation(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  const rounded = roundNavlogValue(value);
  return rounded === 0 ? '0°' : `${Math.abs(rounded)}°${rounded > 0 ? 'E' : 'W'}`;
}

export function formatWind(value: { readonly directionFromTrueDeg: number; readonly speedKt: number } | null): string | null {
  return value === null ? null : formatWindValue(value);
}

export function formatAirportWind(value: AirportWind | null): string | null {
  if (value === null) return null;
  if (value.kind === 'calm') return 'CALM';
  if (value.kind === 'variable') return `VRB/${Math.round(value.speedKt)}`;
  return formatWind(value);
}

export function formatWindCorrection(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  const rounded = roundNavlogValue(value);
  return `${rounded > 0 ? '+' : ''}${rounded}°`;
}

export function formatDistance(value: number | null): string | null {
  return formatOptionalNumber(value);
}

export function formatIncrement(
  accumulated: number | null,
  intermediate: number | null,
  divisor = 1,
): string | null {
  if (accumulated === null || intermediate === null ||
    !Number.isFinite(accumulated) || !Number.isFinite(intermediate)) {
    return null;
  }
  return roundNavlogAccumulatedIncrement(
    accumulated / divisor,
    (accumulated - intermediate) / divisor,
  ).toString();
}

export function formatTimeMinutes(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds)) return null;
  return roundNavlogValue(seconds / 60).toString();
}

export function formatClockTime(
  timestampUtcMs: number | null,
): string | null {
  if (timestampUtcMs === null || !Number.isFinite(timestampUtcMs)) return null;
  return formatUtcRouteTime(timestampUtcMs, timestampUtcMs);
}

export function formatDurationHhMm(minutes: number | null): string | null {
  if (minutes === null || !Number.isFinite(minutes)) return null;
  const rounded = Math.round(minutes);
  return `${Math.floor(rounded / 60).toString().padStart(2, '0')}:${Math.abs(rounded % 60).toString().padStart(2, '0')}`;
}

export function formatGroundSpeed(value: number | null): string | null {
  return value === null || !Number.isFinite(value) ? null : formatGroundSpeedKtValue(value);
}

export function formatNavlogDirections(
  trueTrackDeg: number | null,
  variationDegEast: number | null,
  trueHeadingDeg: number | null,
) {
  return calculateNavlogDirectionDisplay(
    trueTrackDeg,
    variationDegEast,
    trueHeadingDeg,
  );
}
