import { describe, expect, it } from 'vitest';

import { calculatePerformanceRoute } from '../../calculations';
import type { AircraftPerformancePlanInputs, FlightPlan } from '../../domain';
import { PROJECT_AIRCRAFT_PERFORMANCE_PROFILE } from '../../domain';
import { derivePerformancePhaseBoundaries } from './performancePhaseBoundaries';

const flightPlan: FlightPlan = {
  waypoints: [
    { id: 'A', name: 'A', position: { latitude: 0, longitude: 0 } },
    { id: 'B', name: 'B', position: { latitude: 0, longitude: 2 } },
  ],
  legShapes: [],
};
const performance: AircraftPerformancePlanInputs = {
  massKg: 820,
  defaultAltitudeFtMsl: 3000,
  departureElevationFtMsl: 0,
  destinationElevationFtMsl: 0,
  patternHeightAglFt: 1000,
  departureWeather: { qnhHpa: 1013.25, isaDeviationC: 0 },
  destinationWeather: { qnhHpa: 1013.25, isaDeviationC: 0 },
  legAltitudePlans: [{
    fromWaypointId: 'A',
    toWaypointId: 'B',
    targetPlacement: { mode: 'distance-along-leg', distanceFromStartNm: 30 },
  }],
};

describe('derivePerformancePhaseBoundaries', () => {
  it('derives both ends of climb and descent runs from calculated steps', () => {
    const route = calculatePerformanceRoute({
      flightPlan,
      navigation: {
        departureTimeUtcMs: Date.UTC(2026, 7, 28, 12),
        magneticVariationDegEast: 0,
        wind: { directionFromTrueDeg: 0, speedKt: 0 },
      },
      performance,
      profile: PROJECT_AIRCRAFT_PERFORMANCE_PROFILE,
    });
    const boundaries = derivePerformancePhaseBoundaries(route);

    expect(boundaries.map(({ label }) => label)).toEqual([
      'BOC',
      'TOC',
      'TOD',
      'BOD',
    ]);
    expect(boundaries.find(({ label }) => label === 'TOC')?.distanceFromLegStartNm)
      .toBeCloseTo(30, 6);
    expect(boundaries.find(({ label }) => label === 'TOD')!.distanceFromLegStartNm)
      .toBeLessThan(boundaries.find(({ label }) => label === 'BOD')!.distanceFromLegStartNm);
  });
});
