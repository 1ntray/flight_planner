import { normalizeTrackDeg } from '../../calculations';
import type {
  CalculatedPerformanceLeg,
  CalculatedPerformanceStep,
} from '../../calculations';
import type { Wind } from '../../domain';
import {
  windFromDirectionToVector,
  windVectorToFromDirection,
} from '../../weather';

export interface PerformanceLegNavigationSummary {
  readonly source: 'cruise' | 'average';
  readonly wind: Wind;
  readonly trueHeadingDeg: number;
}

/**
 * The representative TAS used by the displayed navlog: the longest cruise
 * segment at target altitude where available, otherwise a time-weighted leg
 * average. This is presentation selection, not a new performance calculation.
 */
export function calculatePerformanceLegTrueAirspeedKt(
  leg: CalculatedPerformanceLeg,
): number | null {
  const cruiseSteps = leg.steps.filter((step) => step.phase === 'cruise');
  const targetCruise = cruiseSteps.filter(
    (step) =>
      Math.abs(step.representativeAltitudeFtMsl - leg.targetAltitudeFtMsl) <=
      1e-9,
  );
  const cruise = (targetCruise.length > 0 ? targetCruise : cruiseSteps).reduce<
    CalculatedPerformanceStep | null
  >(
    (longest, step) =>
      longest === null || step.durationSeconds > longest.durationSeconds
        ? step
        : longest,
    null,
  );
  if (cruise !== null) return cruise.trueAirspeedKt;
  const durationSeconds = leg.steps.reduce(
    (total, step) => total + step.durationSeconds,
    0,
  );
  return durationSeconds <= 0
    ? null
    : leg.steps.reduce(
        (total, step) => total + step.trueAirspeedKt * step.durationSeconds,
        0,
      ) / durationSeconds;
}

function circularAverageDeg(
  steps: readonly CalculatedPerformanceStep[],
  select: (step: CalculatedPerformanceStep) => number,
): number {
  let east = 0;
  let north = 0;

  for (const step of steps) {
    const radians = select(step) * Math.PI / 180;
    east += Math.sin(radians) * step.durationSeconds;
    north += Math.cos(radians) * step.durationSeconds;
  }

  return normalizeTrackDeg(Math.atan2(east, north) * 180 / Math.PI);
}

export function calculatePerformanceLegNavigationSummary(
  leg: CalculatedPerformanceLeg,
): PerformanceLegNavigationSummary | null {
  const cruiseSteps = leg.steps.filter((step) => step.phase === 'cruise');
  const targetAltitudeCruiseSteps = cruiseSteps.filter(
    (step) =>
      Math.abs(
        step.representativeAltitudeFtMsl - leg.targetAltitudeFtMsl,
      ) <= 1e-9,
  );
  const cruise = (
    targetAltitudeCruiseSteps.length > 0
      ? targetAltitudeCruiseSteps
      : cruiseSteps
  )
    .reduce<CalculatedPerformanceStep | null>(
      (longest, step) =>
        longest === null || step.distanceNm > longest.distanceNm
          ? step
          : longest,
      null,
    );

  if (cruise !== null) {
    return {
      source: 'cruise',
      wind: cruise.wind,
      trueHeadingDeg: cruise.trueHeadingDeg,
    };
  }

  if (leg.steps.length === 0) {
    return null;
  }

  const durationSeconds = leg.steps.reduce(
    (total, step) => total + step.durationSeconds,
    0,
  );
  if (durationSeconds <= 0) {
    return null;
  }
  const windVector = leg.steps.reduce(
    (total, step) => {
      const vector = windFromDirectionToVector(step.wind);
      return {
        eastKt: total.eastKt + vector.eastKt * step.durationSeconds,
        northKt: total.northKt + vector.northKt * step.durationSeconds,
      };
    },
    { eastKt: 0, northKt: 0 },
  );

  return {
    source: 'average',
    wind: windVectorToFromDirection({
      eastKt: windVector.eastKt / durationSeconds,
      northKt: windVector.northKt / durationSeconds,
    }),
    trueHeadingDeg: circularAverageDeg(
      leg.steps,
      (step) => step.trueHeadingDeg,
    ),
  };
}
