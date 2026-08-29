import { describe, expect, it } from 'vitest';

import type { FlightPlan, NavigationPlanInputs } from '../domain';
import { calculateGeodesicMidpoint } from './geodesy';
import {
  applyLegMagneticVariations,
  calculateRouteMagneticVariations,
  wmm2025MagneticVariationProvider,
} from './magneticVariation';
import type { MagneticVariationProvider } from './magneticVariation';
import type { MagneticVariationQuery } from './magneticVariation';
import { calculateNavigationRoute } from './navigationRoute';

const planning: NavigationPlanInputs = {
  departureTimeUtcMs: Date.UTC(2026, 7, 28, 9),
  trueAirspeedKt: 120,
  plannedAltitudeFtMsl: 3500,
  magneticVariationMode: 'automatic-wmm2025',
  magneticVariationDegEast: 0,
  wind: { directionFromTrueDeg: 0, speedKt: 0 },
};

const flightPlan: FlightPlan = {
  waypoints: [
    { id: 'A', name: 'A', position: { latitude: 69, longitude: 18 } },
    { id: 'B', name: 'B', position: { latitude: 69.5, longitude: 19 } },
    { id: 'C', name: 'C', position: { latitude: 70, longitude: 20 } },
  ],
  legShapes: [],
  sectorBoundaryWaypointIds: [],
};

function routeFor(plan = flightPlan) {
  return calculateNavigationRoute({ flightPlan: plan, planning });
}

describe('WMM2025 magnetic variation provider', () => {
  it.each([
    [Date.UTC(2025, 0, 1), 0, 80, 0, 1.28],
    [Date.UTC(2025, 0, 1), 0, 0, 120, -0.16],
    [Date.UTC(2025, 0, 1), 0, -80, 240, 68.78],
    [Date.UTC(2025, 0, 1), 100 * 3280.839895013123, 80, 0, 0.85],
    [Date.UTC(2025, 0, 1), 100 * 3280.839895013123, 0, 120, -0.15],
    [Date.UTC(2025, 0, 1), 100 * 3280.839895013123, -80, 240, 68.21],
    [Date.UTC(2027, 6, 2, 12), 0, 80, 0, 2.59],
    [Date.UTC(2027, 6, 2, 12), 0, 0, 120, -0.24],
    [Date.UTC(2027, 6, 2, 12), 0, -80, 240, 68.49],
    [Date.UTC(2027, 6, 2, 12), 100 * 3280.839895013123, 80, 0, 2.16],
    [Date.UTC(2027, 6, 2, 12), 100 * 3280.839895013123, 0, 120, -0.23],
    [Date.UTC(2027, 6, 2, 12), 100 * 3280.839895013123, -80, 240, 67.93],
  ])('matches the official NOAA WMM2025 declination vector', (
    timeUtcMs,
    altitudeFtMsl,
    latitude,
    longitude,
    expectedVariationDegEast,
  ) => {
    const result = wmm2025MagneticVariationProvider.getVariation({
      position: { latitude, longitude },
      altitudeFtMsl,
      timeUtcMs,
    });

    expect(result).toMatchObject({
      status: 'available',
      variationDegEast: expectedVariationDegEast,
      source: { id: 'WMM2025', kind: 'model' },
    });
  });

  it('uses east-positive output and varies by date and location', () => {
    const east = wmm2025MagneticVariationProvider.getVariation({
      position: { latitude: 80, longitude: 0 }, altitudeFtMsl: 0,
      timeUtcMs: Date.UTC(2025, 0, 1),
    });
    const west = wmm2025MagneticVariationProvider.getVariation({
      position: { latitude: 0, longitude: 120 }, altitudeFtMsl: 0,
      timeUtcMs: Date.UTC(2025, 0, 1),
    });
    const later = wmm2025MagneticVariationProvider.getVariation({
      position: { latitude: 80, longitude: 0 }, altitudeFtMsl: 0,
      timeUtcMs: Date.UTC(2027, 6, 2, 12),
    });

    expect(east).toMatchObject({ status: 'available', variationDegEast: 1.28 });
    expect(west).toMatchObject({ status: 'available', variationDegEast: -0.16 });
    expect(later).toMatchObject({ status: 'available', variationDegEast: 2.59 });
  });

  it('does not calculate outside the WMM2025 validity window', () => {
    expect(wmm2025MagneticVariationProvider.getVariation({
      position: { latitude: 69, longitude: 18 }, altitudeFtMsl: 0,
      timeUtcMs: Date.UTC(2024, 11, 31, 23, 59),
    })).toMatchObject({ status: 'unavailable', reason: 'outside-model-validity' });
    expect(wmm2025MagneticVariationProvider.getVariation({
      position: { latitude: 69, longitude: 18 }, altitudeFtMsl: 0,
      timeUtcMs: Date.UTC(2030, 0, 1),
    })).toMatchObject({ status: 'unavailable', reason: 'outside-model-validity' });
  });
});

describe('per-leg magnetic variation derivation', () => {
  it('samples the direct WGS84 endpoint midpoint, not shaping geometry', () => {
    const shaped: FlightPlan = {
      ...flightPlan,
      waypoints: flightPlan.waypoints.slice(0, 2),
      legShapes: [{
        fromWaypointId: 'A', toWaypointId: 'B',
        points: [{ id: 'G', position: { latitude: 80, longitude: 10 } }],
      }],
    };
    const queries: MagneticVariationQuery[] = [];
    const provider: MagneticVariationProvider = {
      getVariation(query) {
        queries.push(query);
        return { status: 'available', variationDegEast: 7, source: { kind: 'model', id: 'test' } };
      },
    };

    const variations = calculateRouteMagneticVariations({
      flightPlan: shaped,
      navigationRoute: routeFor(shaped),
      mode: 'automatic-wmm2025',
      manualVariationDegEast: 0,
      fallbackAltitudeFtMsl: 3500,
      provider,
    });

    expect(variations[0]?.midpoint).toEqual(
      calculateGeodesicMidpoint(shaped.waypoints[0]!.position, shaped.waypoints[1]!.position),
    );
    expect(queries[0]?.position).toEqual(variations[0]?.midpoint);
    expect(queries[0]?.altitudeFtMsl).toBe(3500);
    expect(queries[0]?.timeUtcMs).toBe(variations[0]?.timeUtcMs);
  });

  it('derives independently varying values for geographically separated legs', () => {
    const wideRoute: FlightPlan = {
      waypoints: [
        { id: 'A', name: 'A', position: { latitude: 80, longitude: 0 } },
        { id: 'B', name: 'B', position: { latitude: 75, longitude: 20 } },
        { id: 'C', name: 'C', position: { latitude: 0, longitude: 120 } },
      ],
      legShapes: [],
      sectorBoundaryWaypointIds: [],
    };

    const variations = calculateRouteMagneticVariations({
      flightPlan: wideRoute,
      navigationRoute: routeFor(wideRoute),
      mode: 'automatic-wmm2025',
      manualVariationDegEast: 0,
      fallbackAltitudeFtMsl: 3500,
    });

    expect(variations).toHaveLength(2);
    expect(variations[0]?.result).toMatchObject({ status: 'available' });
    expect(variations[1]?.result).toMatchObject({ status: 'available' });
    if (
      variations[0]?.result.status === 'available' &&
      variations[1]?.result.status === 'available'
    ) {
      expect(variations[0].result.variationDegEast).not.toBe(
        variations[1].result.variationDegEast,
      );
    }
  });

  it('keeps manual override behaviour and applies true-to-magnetic conversion once per leg', () => {
    const manualFlightPlan: FlightPlan = {
      waypoints: [
        { id: 'A', name: 'A', position: { latitude: 0, longitude: 0 } },
        { id: 'B', name: 'B', position: { latitude: 0, longitude: 1 } },
      ],
      legShapes: [],
      sectorBoundaryWaypointIds: [],
    };
    const baseRoute = routeFor(manualFlightPlan);
    const variations = calculateRouteMagneticVariations({
      flightPlan: manualFlightPlan,
      navigationRoute: baseRoute,
      mode: 'manual',
      manualVariationDegEast: 10,
      fallbackAltitudeFtMsl: 3500,
    });
    const decorated = applyLegMagneticVariations(baseRoute, variations);

    expect(decorated.legs[0]).toMatchObject({
      magneticVariationDegEast: 10,
      magneticTrackDeg: 80,
      magneticHeadingDeg: 80,
      magneticVariationSource: { kind: 'manual', id: 'manual' },
    });
  });
});
