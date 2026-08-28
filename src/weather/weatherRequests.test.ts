import { describe, expect, it } from 'vitest';

import { calculateNavigationRoute } from '../calculations';
import type { NavigationPlanInputs, Waypoint } from '../domain';
import {
  buildWeatherSampleRequests,
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
