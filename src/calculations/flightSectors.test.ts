import { describe, expect, it } from 'vitest';

import type { FlightPlan } from '../domain';
import { deriveFlightPlanSectors } from './flightSectors';

const flightPlan: FlightPlan = {
  waypoints: [
    { id: 'A', name: 'A', position: { latitude: 0, longitude: 0 } },
    { id: 'B', name: 'B', position: { latitude: 0, longitude: 1 } },
    { id: 'C', name: 'C', position: { latitude: 0, longitude: 2 } },
    { id: 'D', name: 'D', position: { latitude: 0, longitude: 3 } },
  ],
  legShapes: [{
    fromWaypointId: 'B',
    toWaypointId: 'C',
    points: [{ id: 'G', position: { latitude: 0.2, longitude: 1.5 } }],
  }],
  sectorBoundaryWaypointIds: ['C'],
};

describe('deriveFlightPlanSectors', () => {
  it('shares a boundary airport without duplicating route state', () => {
    const sectors = deriveFlightPlanSectors(flightPlan);

    expect(sectors.map(({ fromWaypointId, toWaypointId }) =>
      `${fromWaypointId}-${toWaypointId}`)).toEqual(['A-C', 'C-D']);
    expect(sectors[0]?.flightPlan.waypoints.map(({ id }) => id))
      .toEqual(['A', 'B', 'C']);
    expect(sectors[1]?.flightPlan.waypoints.map(({ id }) => id))
      .toEqual(['C', 'D']);
    expect(sectors[0]?.flightPlan.legShapes[0]?.points[0]?.id).toBe('G');
  });

  it('uses canonical waypoint order even when boundary IDs are unordered', () => {
    const sectors = deriveFlightPlanSectors({
      ...flightPlan,
      sectorBoundaryWaypointIds: ['C', 'B'],
    });

    expect(sectors.map(({ fromWaypointId, toWaypointId }) =>
      `${fromWaypointId}-${toWaypointId}`)).toEqual(['A-B', 'B-C', 'C-D']);
  });

  it('rejects endpoint, unknown, and duplicate boundaries', () => {
    for (const sectorBoundaryWaypointIds of [['A'], ['missing'], ['C', 'C']]) {
      expect(() => deriveFlightPlanSectors({
        ...flightPlan,
        sectorBoundaryWaypointIds,
      })).toThrow();
    }
  });
});
