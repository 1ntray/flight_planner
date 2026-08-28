import { describe, expect, it } from 'vitest';

import type {
  AircraftPerformancePlanInputs,
  FlightPlan,
  NavigationPlanInputs,
} from '../domain';
import { calculatePerformanceRoute } from './performanceRoute';

const navigation: NavigationPlanInputs = {
  departureTimeUtcMs: Date.UTC(2026, 7, 28, 10),
  trueAirspeedKt: 100,
  plannedAltitudeFtMsl: 5000,
  magneticVariationDegEast: 8,
  wind: { directionFromTrueDeg: 0, speedKt: 0 },
};

const performance: AircraftPerformancePlanInputs = {
  massKg: 820,
  defaultAltitudeFtMsl: 5000,
  departureElevationFtMsl: 0,
  destinationElevationFtMsl: 0,
  patternHeightAglFt: 1000,
  departureWeather: { qnhHpa: 1013.25, isaDeviationC: 0 },
  destinationWeather: { qnhHpa: 1013.25, isaDeviationC: 0 },
  legAltitudePlans: [],
};

const longLeg: FlightPlan = {
  waypoints: [
    { id: 'A', name: 'A', position: { latitude: 0, longitude: 0 } },
    { id: 'B', name: 'B', position: { latitude: 0, longitude: 2 } },
  ],
  legShapes: [],
};

describe('calculatePerformanceRoute', () => {
  it('integrates climb, cruise, and arrival descent inside one real leg', () => {
    const result = calculatePerformanceRoute({
      flightPlan: longLeg,
      navigation,
      performance,
    });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.legs).toHaveLength(1);
      expect(result.legs[0]?.phases.map(({ phase }) => phase)).toEqual([
        'climb',
        'cruise',
        'descent',
      ]);
      expect(result.legs[0]?.startAltitudeFtMsl).toBe(0);
      expect(result.legs[0]?.endAltitudeFtMsl).toBe(1000);
      expect(result.totalFuelLitres).toBeGreaterThan(0);
      expect(result.totalEetSeconds).toBeGreaterThan(0);
      expect(
        Math.abs(
          result.estimatedArrivalTimeUtcMs -
          (navigation.departureTimeUtcMs + result.totalEetSeconds * 1000),
        ),
      ).toBeLessThan(0.001);
    }
  });

  it('uses varying TAS at every climb interval', () => {
    const result = calculatePerformanceRoute({
      flightPlan: longLeg,
      navigation,
      performance,
    });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      const climbTas = result.legs[0]!.steps
        .filter(({ phase }) => phase === 'climb')
        .map(({ trueAirspeedKt }) => trueAirspeedKt);

      expect(climbTas.length).toBe(50);
      expect(new Set(climbTas).size).toBe(climbTas.length);
      expect(climbTas.at(-1)).toBeGreaterThan(climbTas[0]!);
    }
  });

  it('places a climb at an explicit altitude-attainment distance', () => {
    const result = calculatePerformanceRoute({
      flightPlan: longLeg,
      navigation,
      performance: {
        ...performance,
        legAltitudePlans: [{
          fromWaypointId: 'A',
          toWaypointId: 'B',
          targetPlacement: {
            mode: 'distance-along-leg',
            distanceFromStartNm: 20,
          },
        }],
      },
    });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      const climbSteps = result.legs[0]!.steps.filter(
        ({ phase }) => phase === 'climb',
      );

      expect(result.legs[0]?.phases[0]?.phase).toBe('cruise');
      expect(climbSteps.at(-1)?.endDistanceFromLegNm).toBeCloseTo(20, 6);
    }
  });

  it('supports repeated altitude changes on successive real legs', () => {
    const flightPlan: FlightPlan = {
      waypoints: [
        ...longLeg.waypoints,
        { id: 'C', name: 'C', position: { latitude: 1, longitude: 2 } },
      ],
      legShapes: [],
    };
    const result = calculatePerformanceRoute({
      flightPlan,
      navigation,
      performance: {
        ...performance,
        legAltitudePlans: [{
          fromWaypointId: 'B',
          toWaypointId: 'C',
          altitudeFtMsl: 7000,
        }],
      },
    });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.legs[0]?.targetAltitudeFtMsl).toBe(5000);
      expect(result.legs[1]?.startAltitudeFtMsl).toBe(5000);
      expect(result.legs[1]?.targetAltitudeFtMsl).toBe(7000);
      expect(result.legs[1]?.phases.map(({ phase }) => phase)).toEqual([
        'climb',
        'cruise',
        'descent',
      ]);
    }
  });

  it('uses altitude-dependent wind during vertical distance integration', () => {
    const calm = calculatePerformanceRoute({
      flightPlan: longLeg,
      navigation,
      performance,
    });
    const changingWind = calculatePerformanceRoute({
      flightPlan: longLeg,
      navigation,
      performance,
      resolveWind: ({ altitudeFtMsl }) => ({
        directionFromTrueDeg: 90,
        speedKt: altitudeFtMsl / 500,
      }),
    });

    expect(calm.status).toBe('ok');
    expect(changingWind.status).toBe('ok');
    if (calm.status === 'ok' && changingWind.status === 'ok') {
      const calmClimb = calm.legs[0]!.phases.find(
        ({ phase }) => phase === 'climb',
      )!;
      const windyClimb = changingWind.legs[0]!.phases.find(
        ({ phase }) => phase === 'climb',
      )!;

      expect(windyClimb.distanceNm).toBeLessThan(calmClimb.distanceNm);
    }
  });

  it('uses shaped WGS84 distance and produces finite phase results', () => {
    const result = calculatePerformanceRoute({
      flightPlan: {
        ...longLeg,
        legShapes: [{
          fromWaypointId: 'A',
          toWaypointId: 'B',
          points: [{
            id: 'G1',
            position: { latitude: 1, longitude: 1 },
          }],
        }],
      },
      navigation,
      performance,
    });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.totalDistanceNm).toBeGreaterThan(120);
      expect(Number.isFinite(result.totalEetSeconds)).toBe(true);
      expect(Number.isFinite(result.totalFuelLitres)).toBe(true);
    }
  });

  it('reports an impossible short-leg transition explicitly', () => {
    const result = calculatePerformanceRoute({
      flightPlan: {
        waypoints: [
          longLeg.waypoints[0]!,
          { id: 'SHORT', name: 'SHORT', position: { latitude: 0, longitude: 0.01 } },
        ],
        legShapes: [],
      },
      navigation,
      performance,
    });

    expect(result).toMatchObject({
      status: 'no-solution',
      reason: 'insufficient-leg-distance',
      legFromId: 'A',
      legToId: 'SHORT',
    });
  });
});
