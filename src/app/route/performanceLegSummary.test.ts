import { describe, expect, it } from 'vitest';

import type { CalculatedPerformanceLeg } from '../../calculations';
import { calculatePerformanceLegNavigationSummary } from './performanceLegSummary';

function step(
  phase: 'climb' | 'cruise' | 'descent',
  distanceNm: number,
  durationSeconds: number,
  windDirection: number,
  heading: number,
  altitudeFtMsl = 3000,
) {
  return {
    phase,
    distanceNm,
    durationSeconds,
    wind: { directionFromTrueDeg: windDirection, speedKt: 10 },
    trueHeadingDeg: heading,
    representativeAltitudeFtMsl: altitudeFtMsl,
  };
}

describe('calculatePerformanceLegNavigationSummary', () => {
  it('prefers cruise at the requested leg altitude over a longer pre-transition cruise', () => {
    const leg = {
      targetAltitudeFtMsl: 3000,
      steps: [
        step('cruise', 40, 1200, 210, 85, 1000),
        step('climb', 8, 300, 240, 90),
        step('cruise', 20, 600, 270, 95),
      ],
    } as unknown as CalculatedPerformanceLeg;

    expect(calculatePerformanceLegNavigationSummary(leg)).toEqual({
      source: 'cruise',
      wind: { directionFromTrueDeg: 270, speedKt: 10 },
      trueHeadingDeg: 95,
    });
  });

  it('uses duration-weighted vector and circular averages without cruise', () => {
    const leg = {
      targetAltitudeFtMsl: 3000,
      steps: [
        step('climb', 5, 60, 350, 350),
        step('climb', 10, 180, 10, 10),
      ],
    } as unknown as CalculatedPerformanceLeg;
    const summary = calculatePerformanceLegNavigationSummary(leg)!;

    expect(summary.source).toBe('average');
    expect(summary.wind.directionFromTrueDeg).toBeCloseTo(5.04, 1);
    expect(summary.trueHeadingDeg).toBeCloseTo(5.04, 1);
  });
});
