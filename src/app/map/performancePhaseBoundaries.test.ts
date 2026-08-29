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
  it('keeps internal boundaries but omits a descent end at the TO waypoint', () => {
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
    ]);
    expect(boundaries.find(({ label }) => label === 'TOC')?.distanceFromLegStartNm)
      .toBeCloseTo(30, 6);
    expect(boundaries.find(({ label }) => label === 'TOD')!.distanceFromLegStartNm)
      .toBeLessThan(route.status === 'ok' ? route.legs[0]!.distanceNm : 0);
  });

  it('omits a climb start at FROM and a descent end at TO', () => {
    const route = calculatePerformanceRoute({
      flightPlan,
      navigation: {
        departureTimeUtcMs: Date.UTC(2026, 7, 28, 12),
        magneticVariationDegEast: 0,
        wind: { directionFromTrueDeg: 0, speedKt: 0 },
      },
      performance: {
        ...performance,
        legAltitudePlans: [],
      },
      profile: PROJECT_AIRCRAFT_PERFORMANCE_PROFILE,
    });

    expect(derivePerformancePhaseBoundaries(route).map(({ label }) => label))
      .toEqual(['TOC', 'TOD']);
  });

  it('retains both boundaries for a descent ending between waypoints', () => {
    const route = calculatePerformanceRoute({
      flightPlan: {
        waypoints: [
          ...flightPlan.waypoints,
          { id: 'C', name: 'C', position: { latitude: 0, longitude: 4 } },
        ],
        legShapes: [],
      },
      navigation: {
        departureTimeUtcMs: Date.UTC(2026, 7, 28, 12),
        magneticVariationDegEast: 0,
        wind: { directionFromTrueDeg: 0, speedKt: 0 },
      },
      performance: {
        ...performance,
        departureElevationFtMsl: 3000,
        legAltitudePlans: [{
          fromWaypointId: 'A',
          toWaypointId: 'B',
          altitudeFtMsl: 3000,
          endAltitudeFtMsl: 2000,
          endTargetPlacement: {
            mode: 'distance-along-leg',
            distanceFromStartNm: 80,
          },
        }],
      },
      profile: PROJECT_AIRCRAFT_PERFORMANCE_PROFILE,
    });
    const firstLegBoundaries = derivePerformancePhaseBoundaries(route).filter(
      ({ fromWaypointId, toWaypointId }) =>
        fromWaypointId === 'A' && toWaypointId === 'B',
    );

    expect(firstLegBoundaries.map(({ label }) => label))
      .toEqual(['TOD', 'BOD']);
  });
});
