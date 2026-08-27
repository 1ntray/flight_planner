import { describe, expect, it } from 'vitest';

import type { FlightPlan, NavigationPlanInputs, Waypoint } from '../domain';
import { calculateNavigationRoute } from './navigationRoute';

const DEPARTURE_TIME_UTC_MS = Date.UTC(2026, 7, 27, 23, 30);

const calmWindPlan: NavigationPlanInputs = {
  departureTimeUtcMs: DEPARTURE_TIME_UTC_MS,
  trueAirspeedKt: 120,
  plannedAltitudeFtMsl: 3000,
  wind: { directionFromTrueDeg: 0, speedKt: 0 },
};

const route: Waypoint[] = [
  {
    id: 'A',
    name: 'Start',
    position: { latitude: 0, longitude: 0 },
  },
  {
    id: 'B',
    name: 'Middle',
    position: { latitude: 0, longitude: 1 },
  },
  {
    id: 'C',
    name: 'Finish',
    position: { latitude: 1, longitude: 1 },
  },
];

function flightPlan(waypoints: readonly Waypoint[]): FlightPlan {
  return { waypoints, legShapes: [] };
}

describe('calculateNavigationRoute', () => {
  it('derives geometry and WGS84 midpoints without planning inputs', () => {
    const result = calculateNavigationRoute({
      flightPlan: flightPlan(route.slice(0, 2)),
      planning: null,
    });

    expect(result.totalDistanceNm).toBeCloseTo(60.107716, 6);
    expect(result.totalEetSeconds).toBeNull();
    expect(result.estimatedArrivalTimeUtcMs).toBeNull();
    expect(result.legs[0]).toMatchObject({
      fromId: 'A',
      toId: 'B',
      navigation: null,
      eetSeconds: null,
      startTimeUtcMs: null,
      midpointTimeUtcMs: null,
      endTimeUtcMs: null,
    });
    expect(result.legs[0]?.midpoint.latitude).toBeCloseTo(0, 12);
    expect(result.legs[0]?.midpoint.longitude).toBeCloseTo(0.5, 12);
  });

  it('derives sequential leg times and totals from unrounded EET values', () => {
    const result = calculateNavigationRoute({
      flightPlan: flightPlan(route),
      planning: calmWindPlan,
    });
    const first = result.legs[0];
    const second = result.legs[1];

    expect(first?.navigation?.status).toBe('ok');
    expect(second?.navigation?.status).toBe('ok');
    expect(first?.startTimeUtcMs).toBe(DEPARTURE_TIME_UTC_MS);
    expect(first?.midpointTimeUtcMs).toBeCloseTo(
      DEPARTURE_TIME_UTC_MS + (first!.eetSeconds! * 1000) / 2,
      6,
    );
    expect(first?.endTimeUtcMs).toBeCloseTo(
      DEPARTURE_TIME_UTC_MS + first!.eetSeconds! * 1000,
      6,
    );
    expect(second?.startTimeUtcMs).toBe(first?.endTimeUtcMs);
    expect(result.totalEetSeconds).toBeCloseTo(
      first!.eetSeconds! + second!.eetSeconds!,
      10,
    );
    expect(
      Math.abs(
        result.estimatedArrivalTimeUtcMs! -
          (DEPARTURE_TIME_UTC_MS + result.totalEetSeconds! * 1000),
      ),
    ).toBeLessThan(0.001);
  });

  it('applies matching per-leg forecast winds and retains manual fallback', () => {
    const result = calculateNavigationRoute({
      flightPlan: flightPlan(route),
      planning: calmWindPlan,
      legWinds: [
        {
          fromId: 'A',
          toId: 'B',
          source: 'forecast',
          wind: { directionFromTrueDeg: 270, speedKt: 20 },
        },
      ],
    });

    expect(result.legs[0]).toMatchObject({
      wind: { directionFromTrueDeg: 270, speedKt: 20 },
      windSource: 'forecast',
    });
    expect(result.legs[1]).toMatchObject({
      wind: calmWindPlan.wind,
      windSource: 'manual',
    });
    expect(result.legs[0]?.navigation?.status).toBe('ok');
    expect(result.legs[1]?.navigation?.status).toBe('ok');
  });

  it('rejects duplicate or invalid leg wind overrides', () => {
    const override = {
      fromId: 'A',
      toId: 'B',
      source: 'forecast' as const,
      wind: { directionFromTrueDeg: 270, speedKt: 20 },
    };

    expect(() =>
      calculateNavigationRoute({
        flightPlan: flightPlan(route),
        planning: calmWindPlan,
        legWinds: [override, override],
      }),
    ).toThrow('Duplicate wind override');

    expect(() =>
      calculateNavigationRoute({
        flightPlan: flightPlan(route),
        planning: calmWindPlan,
        legWinds: [{ ...override, wind: { ...override.wind, speedKt: -1 } }],
      }),
    ).toThrow(RangeError);
  });

  it('carries the estimated arrival across a UTC date boundary', () => {
    const result = calculateNavigationRoute({
      flightPlan: flightPlan([
        route[0]!,
        { ...route[1]!, position: { latitude: 0, longitude: 2 } },
      ]),
      planning: calmWindPlan,
    });
    const arrival = new Date(result.estimatedArrivalTimeUtcMs!);

    expect(arrival.getUTCDate()).toBe(28);
    expect(arrival.getUTCHours()).toBe(0);
    expect(arrival.getUTCMinutes()).toBe(30);
  });

  it('stops absolute timing after a leg with no wind solution', () => {
    const result = calculateNavigationRoute({
      flightPlan: flightPlan(route),
      planning: {
        departureTimeUtcMs: DEPARTURE_TIME_UTC_MS,
        trueAirspeedKt: 100,
        plannedAltitudeFtMsl: 3000,
        wind: { directionFromTrueDeg: 90, speedKt: 101 },
      },
    });

    expect(result.legs[0]).toMatchObject({
      startTimeUtcMs: DEPARTURE_TIME_UTC_MS,
      midpointTimeUtcMs: null,
      endTimeUtcMs: null,
      navigation: {
        status: 'no-solution',
        reason: 'non-positive-groundspeed',
      },
    });
    expect(result.legs[1]?.startTimeUtcMs).toBeNull();
    expect(result.totalEetSeconds).toBeNull();
    expect(result.estimatedArrivalTimeUtcMs).toBeNull();
  });

  it('treats a zero-distance leg as zero elapsed time without blocking later timing', () => {
    const duplicatedStart: Waypoint = {
      id: 'A2',
      name: 'Duplicate start',
      position: route[0]!.position,
    };
    const result = calculateNavigationRoute({
      flightPlan: flightPlan([route[0]!, duplicatedStart, route[1]!]),
      planning: calmWindPlan,
    });

    expect(result.legs[0]).toMatchObject({
      distanceNm: 0,
      trueTrackDeg: null,
      navigation: null,
      eetSeconds: 0,
      startTimeUtcMs: DEPARTURE_TIME_UTC_MS,
      midpointTimeUtcMs: DEPARTURE_TIME_UTC_MS,
      endTimeUtcMs: DEPARTURE_TIME_UTC_MS,
    });
    expect(result.legs[1]?.startTimeUtcMs).toBe(DEPARTURE_TIME_UTC_MS);
    expect(result.totalEetSeconds).toBe(result.legs[1]?.eetSeconds);
  });

  it('returns the departure as ETA for a planned route with no legs', () => {
    expect(
      calculateNavigationRoute({
        flightPlan: flightPlan([]),
        planning: calmWindPlan,
      }),
    ).toEqual({
      departureTimeUtcMs: DEPARTURE_TIME_UTC_MS,
      legs: [],
      totalDistanceNm: 0,
      totalEetSeconds: 0,
      estimatedArrivalTimeUtcMs: DEPARTURE_TIME_UTC_MS,
    });
  });

  it('validates planning inputs even when the route has no legs', () => {
    expect(() =>
      calculateNavigationRoute({
        flightPlan: flightPlan([]),
        planning: { ...calmWindPlan, departureTimeUtcMs: Number.NaN },
      }),
    ).toThrow(RangeError);

    expect(() =>
      calculateNavigationRoute({
        flightPlan: flightPlan([]),
        planning: { ...calmWindPlan, trueAirspeedKt: 0 },
      }),
    ).toThrow(RangeError);

    expect(() =>
      calculateNavigationRoute({
        flightPlan: flightPlan([]),
        planning: { ...calmWindPlan, plannedAltitudeFtMsl: -1 },
      }),
    ).toThrow(RangeError);
  });

  it('uses shaped distance for EET while preserving direct track and midpoint', () => {
    const direct = calculateNavigationRoute({
      flightPlan: flightPlan(route.slice(0, 2)),
      planning: calmWindPlan,
    });
    const shaped = calculateNavigationRoute({
      flightPlan: {
        waypoints: route.slice(0, 2),
        legShapes: [
          {
            fromWaypointId: 'A',
            toWaypointId: 'B',
            points: [
              {
                id: 'G1',
                position: { latitude: 0.5, longitude: 0.5 },
              },
            ],
          },
        ],
      },
      planning: calmWindPlan,
    });

    expect(shaped.legs).toHaveLength(1);
    expect(shaped.legs[0]?.trueTrackDeg).toBe(direct.legs[0]?.trueTrackDeg);
    expect(shaped.legs[0]?.midpoint).toEqual(direct.legs[0]?.midpoint);
    expect(shaped.legs[0]!.distanceNm).toBeGreaterThan(
      direct.legs[0]!.distanceNm,
    );
    expect(shaped.legs[0]!.eetSeconds).toBeGreaterThan(
      direct.legs[0]!.eetSeconds!,
    );
  });
});
