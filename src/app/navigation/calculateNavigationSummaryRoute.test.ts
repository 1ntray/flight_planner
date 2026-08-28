import { describe, expect, it } from 'vitest';

import type { LegWindOverride } from '../../calculations';
import type { FlightPlan, NavigationPlanInputs } from '../../domain';
import { calculateNavigationSummaryRoute } from './calculateNavigationSummaryRoute';

const flightPlan: FlightPlan = {
  waypoints: [
    {
      id: 'A',
      name: 'Start',
      position: { latitude: 69, longitude: 18 },
    },
    {
      id: 'B',
      name: 'Finish',
      position: { latitude: 69.2, longitude: 19 },
    },
  ],
  legShapes: [],
};

const planning: NavigationPlanInputs = {
  departureTimeUtcMs: Date.UTC(2026, 7, 28, 12),
  trueAirspeedKt: 103,
  plannedAltitudeFtMsl: 5000,
  magneticVariationDegEast: 0,
  wind: { directionFromTrueDeg: 0, speedKt: 5 },
};

const forecastSamples: readonly LegWindOverride[] = [
  {
    fromId: 'A',
    toId: 'B',
    source: 'forecast',
    wind: { directionFromTrueDeg: 240, speedKt: 12 },
  },
  {
    fromId: 'A',
    toId: 'B',
    source: 'forecast',
    wind: { directionFromTrueDeg: 260, speedKt: 18 },
  },
];

describe('calculateNavigationSummaryRoute', () => {
  it('keeps same-leg performance samples out of the per-leg summary calculation', () => {
    const route = calculateNavigationSummaryRoute({
      flightPlan,
      planning,
      forecastWinds: forecastSamples,
      performancePlanActive: true,
    });

    expect(route.legs).toHaveLength(1);
    expect(route.legs[0]).toMatchObject({
      fromId: 'A',
      toId: 'B',
      wind: planning.wind,
      windSource: 'manual',
    });
  });

  it('retains one-forecast-per-leg behavior without a performance plan', () => {
    const route = calculateNavigationSummaryRoute({
      flightPlan,
      planning,
      forecastWinds: forecastSamples.slice(0, 1),
      performancePlanActive: false,
    });

    expect(route.legs[0]).toMatchObject({
      wind: forecastSamples[0]!.wind,
      windSource: 'forecast',
    });
  });
});

