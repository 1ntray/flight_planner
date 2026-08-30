import { describe, expect, it } from 'vitest';

import type { CalculatedPerformanceRouteNoSolution } from '../../calculations';
import type { FlightPlan } from '../../domain';
import { formatPerformanceRouteFailureLeg } from './performanceRouteFormatting';

const flightPlan: FlightPlan = {
  waypoints: [
    { id: 'waypoint-1', name: 'ENDU', position: { latitude: 69.0558, longitude: 18.5404 } },
    { id: 'waypoint-2', name: 'BARDI', position: { latitude: 69.2, longitude: 18.8 } },
  ],
  legShapes: [],
};

const failure: CalculatedPerformanceRouteNoSolution = {
  status: 'no-solution',
  reason: 'insufficient-leg-distance',
  legFromId: 'waypoint-1',
  legToId: 'waypoint-2',
  message: 'The altitude transition does not fit within the leg',
};

describe('performance-route error formatting', () => {
  it('shows waypoint names rather than internal IDs', () => {
    expect(formatPerformanceRouteFailureLeg(flightPlan, failure)).toBe(
      'ENDU → BARDI',
    );
  });

  it('retains an unknown ID as a diagnostic fallback', () => {
    expect(formatPerformanceRouteFailureLeg(flightPlan, {
      ...failure,
      legToId: 'missing-waypoint',
    })).toBe('ENDU → missing-waypoint');
  });
});
