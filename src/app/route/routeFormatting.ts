import { normalizeTrackDeg } from '../../calculations';
import type { CalculatedLeg } from '../../domain';

export function formatTrueTrackDeg(trueTrackDeg: number | null): string {
  if (trueTrackDeg === null) {
    return '—';
  }

  const roundedTrack = Math.round(normalizeTrackDeg(trueTrackDeg)) % 360;
  return `${roundedTrack.toString().padStart(3, '0')}°`;
}

export function formatDistanceNm(distanceNm: number): string {
  return `${distanceNm.toFixed(1)} NM`;
}

export function calculateTotalDistanceNm(
  legs: readonly CalculatedLeg[],
): number {
  return legs.reduce((total, leg) => total + leg.distanceNm, 0);
}

