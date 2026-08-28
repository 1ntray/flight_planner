import { describe, expect, it } from 'vitest';

import {
  calculateNavigationRoute,
  calculatePerformanceRoute,
} from '../calculations';
import type {
  AircraftPerformancePlanInputs,
  NavigationPlanInputs,
  Waypoint,
} from '../domain';
import { PROJECT_AIRCRAFT_PERFORMANCE_PROFILE } from '../domain';
import type { ForecastLegWind } from './types';
import {
  buildPerformanceWeatherSampleRequests,
  buildWeatherSampleRequests,
  createSampledWindResolver,
  weatherSampleRequestsMatch,
} from './weatherRequests';

const planning: NavigationPlanInputs = {
  departureTimeUtcMs: Date.UTC(2026, 7, 27, 12),
  trueAirspeedKt: 100,
  plannedAltitudeFtMsl: 3500,
  magneticVariationDegEast: 0,
  wind: { directionFromTrueDeg: 0, speedKt: 0 },
};

const waypoints: Waypoint[] = [
  {
    id: 'A',
    name: 'A',
    position: { latitude: 60, longitude: 10 },
  },
  {
    id: 'B',
    name: 'B',
    position: { latitude: 60, longitude: 11 },
  },
];

describe('buildWeatherSampleRequests', () => {
  it('uses each timed leg WGS84 midpoint, midpoint time, and planned altitude', () => {
    const route = calculateNavigationRoute({
      flightPlan: { waypoints, legShapes: [] },
      planning,
    });
    const requests = buildWeatherSampleRequests(
      route,
      planning.plannedAltitudeFtMsl,
    );

    expect(requests).toHaveLength(1);
    expect(requests[0]).toEqual({
      fromId: 'A',
      toId: 'B',
      position: route.legs[0]!.midpoint,
      timeUtcMs: route.legs[0]!.midpointTimeUtcMs,
      altitudeFtMsl: 3500,
    });
  });

  it('skips zero-distance and untimed legs', () => {
    const zeroDistanceRoute = calculateNavigationRoute({
      flightPlan: {
        waypoints: [
          waypoints[0]!,
          { ...waypoints[1]!, position: waypoints[0]!.position },
        ],
        legShapes: [],
      },
      planning,
    });
    const unplannedRoute = calculateNavigationRoute({
      flightPlan: { waypoints, legShapes: [] },
      planning: null,
    });

    expect(buildWeatherSampleRequests(zeroDistanceRoute, 3500)).toEqual([]);
    expect(buildWeatherSampleRequests(unplannedRoute, 3500)).toEqual([]);
  });

  it('compares the complete sampling context for refinement', () => {
    const route = calculateNavigationRoute({
      flightPlan: { waypoints, legShapes: [] },
      planning,
    });
    const requests = buildWeatherSampleRequests(route, 3500);

    expect(weatherSampleRequestsMatch(requests, [...requests])).toBe(true);
    expect(
      weatherSampleRequestsMatch(requests, [
        { ...requests[0]!, timeUtcMs: requests[0]!.timeUtcMs + 1 },
      ]),
    ).toBe(false);
  });
});

describe('performance-profile weather samples', () => {
  const performance: AircraftPerformancePlanInputs = {
    massKg: 820,
    defaultAltitudeFtMsl: 3000,
    departureElevationFtMsl: 0,
    destinationElevationFtMsl: 0,
    patternHeightAglFt: 1000,
    departureWeather: { qnhHpa: 1013.25, isaDeviationC: 0 },
    destinationWeather: { qnhHpa: 1013.25, isaDeviationC: 0 },
    legAltitudePlans: [],
  };

  it('creates one position-, altitude-, and time-aware request per integrated step', () => {
    const route = calculatePerformanceRoute({
      flightPlan: { waypoints, legShapes: [] },
      navigation: planning,
      performance,
      profile: PROJECT_AIRCRAFT_PERFORMANCE_PROFILE,
    });
    const requests = buildPerformanceWeatherSampleRequests(route);

    expect(route.status).toBe('ok');
    expect(requests.length).toBeGreaterThan(3);
    expect(new Set(requests.map(({ altitudeFtMsl }) => altitudeFtMsl)).size).toBeGreaterThan(3);
    expect(requests.every(({ timeUtcMs }) => Number.isFinite(timeUtcMs))).toBe(true);
  });

  it('selects the nearest same-leg forecast sample and retains manual fallback', () => {
    const sample = {
      fromId: 'A',
      toId: 'B',
      wind: { directionFromTrueDeg: 270, speedKt: 22 },
      sampledPosition: { latitude: 60, longitude: 10.5 },
      sampledTimeUtcMs: planning.departureTimeUtcMs,
      altitudeFtMsl: 3000,
    } as ForecastLegWind;
    const fallback = { directionFromTrueDeg: 0, speedKt: 5 };
    const resolve = createSampledWindResolver([sample], fallback);

    expect(resolve({
      fromWaypointId: 'A',
      toWaypointId: 'B',
      position: sample.sampledPosition,
      altitudeFtMsl: 3100,
      timeUtcMs: sample.sampledTimeUtcMs,
    })).toEqual(sample.wind);
    expect(resolve({
      fromWaypointId: 'B',
      toWaypointId: 'C',
      position: sample.sampledPosition,
      altitudeFtMsl: 3100,
      timeUtcMs: sample.sampledTimeUtcMs,
    })).toEqual(fallback);
  });
});
