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
  readonly magneticHeadingDeg: number;
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
      magneticHeadingDeg: cruise.magneticHeadingDeg,
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
    magneticHeadingDeg: circularAverageDeg(
      leg.steps,
      (step) => step.magneticHeadingDeg,
    ),
  };
}
