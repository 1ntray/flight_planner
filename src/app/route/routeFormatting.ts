import { normalizeTrackDeg } from '../../calculations';
import type { Wind } from '../../domain';

const MILLISECONDS_PER_MINUTE = 60 * 1000;
const MILLISECONDS_PER_DAY = 24 * 60 * MILLISECONDS_PER_MINUTE;

function formatNormalizedAngleDeg(angleDeg: number | null): string {
  if (angleDeg === null) {
    return '—';
  }

  const roundedAngle = Math.round(normalizeTrackDeg(angleDeg)) % 360;
  return `${roundedAngle.toString().padStart(3, '0')}°`;
}

export function formatTrueTrackDeg(trueTrackDeg: number | null): string {
  return formatNormalizedAngleDeg(trueTrackDeg);
}

export function formatTrueHeadingDeg(trueHeadingDeg: number | null): string {
  return formatNormalizedAngleDeg(trueHeadingDeg);
}

export function formatWindValue(wind: Wind | null): string {
  if (wind === null) {
    return '—';
  }

  const direction = Math.round(normalizeTrackDeg(wind.directionFromTrueDeg)) % 360;
  return `${direction.toString().padStart(3, '0')}/${Math.round(wind.speedKt)}`;
}

export function formatWindCorrectionDeg(windCorrectionDeg: number): string {
  const roundedCorrectionDeg = Math.round(windCorrectionDeg * 10) / 10;
  const displayCorrectionDeg =
    roundedCorrectionDeg === 0 ? 0 : roundedCorrectionDeg;
  const sign = displayCorrectionDeg > 0 ? '+' : '';

  return `${sign}${displayCorrectionDeg.toFixed(1)}°`;
}

export function formatDistanceNm(distanceNm: number): string {
  return `${formatDistanceNmValue(distanceNm)} NM`;
}

export function formatDistanceNmValue(distanceNm: number): string {
  return distanceNm.toFixed(1);
}

export function formatGroundSpeedKt(groundSpeedKt: number): string {
  return `${formatGroundSpeedKtValue(groundSpeedKt)} kt`;
}

export function formatGroundSpeedKtValue(groundSpeedKt: number): string {
  return groundSpeedKt.toFixed(1);
}

export function formatEetSeconds(eetSeconds: number): string {
  return `${formatEetMinutesValue(eetSeconds)} min`;
}

export function formatEetMinutesValue(eetSeconds: number): string {
  return (eetSeconds / 60).toFixed(1);
}

function roundToNearestMinute(timestampUtcMs: number): number {
  if (!Number.isFinite(timestampUtcMs)) {
    throw new RangeError('UTC timestamp must be a finite number');
  }

  return (
    Math.round(timestampUtcMs / MILLISECONDS_PER_MINUTE) *
    MILLISECONDS_PER_MINUTE
  );
}

export function formatUtcRouteTime(
  timestampUtcMs: number,
  departureTimeUtcMs: number,
): string {
  const roundedTimestampUtcMs = roundToNearestMinute(timestampUtcMs);
  const roundedDepartureTimeUtcMs = roundToNearestMinute(departureTimeUtcMs);
  const timestamp = new Date(roundedTimestampUtcMs);
  const hours = timestamp.getUTCHours().toString().padStart(2, '0');
  const minutes = timestamp.getUTCMinutes().toString().padStart(2, '0');
  const dayOffset =
    Math.floor(roundedTimestampUtcMs / MILLISECONDS_PER_DAY) -
    Math.floor(roundedDepartureTimeUtcMs / MILLISECONDS_PER_DAY);
  const daySuffix =
    dayOffset === 0 ? '' : ` ${dayOffset > 0 ? '+' : ''}${dayOffset}d`;

  return `${hours}:${minutes}${daySuffix}`;
}

export function formatUtcDateTime(timestampUtcMs: number): string {
  const roundedTimestampUtcMs = roundToNearestMinute(timestampUtcMs);
  return `${new Date(roundedTimestampUtcMs).toISOString().slice(0, 16).replace('T', ' ')}Z`;
}
