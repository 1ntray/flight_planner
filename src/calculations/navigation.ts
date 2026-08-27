import type { NavigationParameters } from '../domain';
import { normalizeTrackDeg } from './geodesy';

export const SECONDS_PER_HOUR = 3600;

const DEGREES_TO_RADIANS = Math.PI / 180;
const RADIANS_TO_DEGREES = 180 / Math.PI;
const CROSSWIND_RATIO_TOLERANCE = 1e-12;
const MINIMUM_FORWARD_GROUNDSPEED_KT = 1e-9;

export interface WindAdjustedLegInput extends NavigationParameters {
  distanceNm: number;
  trueTrackDeg: number;
}

export type NavigationNoSolutionReason =
  | 'crosswind-exceeds-true-airspeed'
  | 'non-positive-groundspeed';

export interface WindAdjustedLegSolution {
  status: 'ok';
  windCorrectionDeg: number;
  trueHeadingDeg: number;
  groundSpeedKt: number;
  eetSeconds: number;
}

export interface WindAdjustedLegNoSolution {
  status: 'no-solution';
  reason: NavigationNoSolutionReason;
}

export type WindAdjustedLegResult =
  | WindAdjustedLegSolution
  | WindAdjustedLegNoSolution;

function requireFiniteNumber(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number`);
  }
}

export function calculateWindAdjustedLeg({
  trueTrackDeg,
  distanceNm,
  trueAirspeedKt,
  wind,
}: WindAdjustedLegInput): WindAdjustedLegResult {
  requireFiniteNumber(trueTrackDeg, 'True track');
  requireFiniteNumber(distanceNm, 'Distance');
  requireFiniteNumber(trueAirspeedKt, 'True airspeed');
  requireFiniteNumber(wind.directionFromTrueDeg, 'Wind direction');
  requireFiniteNumber(wind.speedKt, 'Wind speed');

  if (distanceNm < 0) {
    throw new RangeError('Distance must not be negative');
  }

  if (trueAirspeedKt <= 0) {
    throw new RangeError('True airspeed must be greater than zero');
  }

  if (wind.speedKt < 0) {
    throw new RangeError('Wind speed must not be negative');
  }

  const normalizedTrackDeg = normalizeTrackDeg(trueTrackDeg);
  const relativeWindDirectionRad =
    normalizeTrackDeg(wind.directionFromTrueDeg - normalizedTrackDeg) *
    DEGREES_TO_RADIANS;
  const crosswindFromRightKt =
    wind.speedKt * Math.sin(relativeWindDirectionRad);
  const calculatedCrosswindRatio = crosswindFromRightKt / trueAirspeedKt;
  const crosswindRatio =
    Math.abs(calculatedCrosswindRatio) <= CROSSWIND_RATIO_TOLERANCE
      ? 0
      : calculatedCrosswindRatio;

  if (Math.abs(crosswindRatio) > 1 + CROSSWIND_RATIO_TOLERANCE) {
    return {
      status: 'no-solution',
      reason: 'crosswind-exceeds-true-airspeed',
    };
  }

  const windCorrectionRad = Math.asin(
    Math.max(-1, Math.min(1, crosswindRatio)),
  );
  const headwindComponentKt =
    wind.speedKt * Math.cos(relativeWindDirectionRad);
  const groundSpeedKt =
    trueAirspeedKt * Math.cos(windCorrectionRad) - headwindComponentKt;

  if (groundSpeedKt <= MINIMUM_FORWARD_GROUNDSPEED_KT) {
    return {
      status: 'no-solution',
      reason: 'non-positive-groundspeed',
    };
  }

  const calculatedWindCorrectionDeg =
    windCorrectionRad * RADIANS_TO_DEGREES;
  const windCorrectionDeg =
    calculatedWindCorrectionDeg === 0 ? 0 : calculatedWindCorrectionDeg;

  return {
    status: 'ok',
    windCorrectionDeg,
    trueHeadingDeg: normalizeTrackDeg(
      normalizedTrackDeg + windCorrectionDeg,
    ),
    groundSpeedKt,
    eetSeconds: (distanceNm / groundSpeedKt) * SECONDS_PER_HOUR,
  };
}
