import { normalizeTrackDeg } from '../../calculations';
import type { WindAdjustedLegResult } from '../../calculations';
import type { CalculatedLeg } from '../../domain';

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

export function calculateTotalDistanceNm(
  legs: readonly CalculatedLeg[],
): number {
  return legs.reduce((total, leg) => total + leg.distanceNm, 0);
}

export function calculateTotalEetSeconds(
  results: readonly (WindAdjustedLegResult | null)[],
): number | null {
  let totalEetSeconds = 0;

  for (const result of results) {
    if (result === null || result.status === 'no-solution') {
      return null;
    }

    totalEetSeconds += result.eetSeconds;
  }

  return totalEetSeconds;
}
