import { describe, expect, it } from 'vitest';

import { calculateRoute } from '../../calculations';
import type { FlightPlan } from '../../domain';
import {
  insertRouteShapingPoint,
  moveRouteShapingPoint,
  removeRouteShapingPoint,
  removeWaypointFromFlightPlan,
} from './flightPlanState';

const flightPlan: FlightPlan = {
  waypoints: [
    { id: 'A', name: 'WP01', position: { latitude: 0, longitude: 0 } },
    { id: 'B', name: 'WP02', position: { latitude: 0, longitude: 1 } },
    { id: 'C', name: 'WP03', position: { latitude: 0, longitude: 2 } },
  ],
  legShapes: [],
};

describe('flight plan shaping state helpers', () => {
  it('inserts multiple shaping points in geometry order', () => {
    const first = insertRouteShapingPoint(flightPlan, 'A', 'B', 0, {
      id: 'G1',
      position: { latitude: 0.2, longitude: 0.3 },
    });
    const second = insertRouteShapingPoint(first, 'A', 'B', 1, {
      id: 'G2',
      position: { latitude: 0.3, longitude: 0.7 },
    });
    const insertedBetween = insertRouteShapingPoint(second, 'A', 'B', 1, {
      id: 'G3',
      position: { latitude: 0.4, longitude: 0.5 },
    });

    expect(
      insertedBetween.legShapes[0]?.points.map((point) => point.id),
    ).toEqual(['G1', 'G3', 'G2']);
    expect(flightPlan.legShapes).toEqual([]);
  });

  it('moves a shaping point without changing its identity or order', () => {
    const shaped = insertRouteShapingPoint(flightPlan, 'A', 'B', 0, {
      id: 'G1',
      position: { latitude: 0.2, longitude: 0.3 },
    });
    const position = { latitude: 0.5, longitude: 0.5 };
    const moved = moveRouteShapingPoint(shaped, 'G1', position);

    expect(moved.legShapes[0]?.points[0]).toEqual({ id: 'G1', position });
  });

  it('removing the final shaping point restores the direct leg', () => {
    const directDistance = calculateRoute(flightPlan)[0]!.distanceNm;
    const shaped = insertRouteShapingPoint(flightPlan, 'A', 'B', 0, {
      id: 'G1',
      position: { latitude: 0.5, longitude: 0.5 },
    });
    const restored = removeRouteShapingPoint(shaped, 'G1');

    expect(restored.legShapes).toEqual([]);
    expect(calculateRoute(restored)[0]!.distanceNm).toBe(directDistance);
  });

  it('deleting a real waypoint removes shapes touching it', () => {
    const withTwoShapes: FlightPlan = {
      ...flightPlan,
      legShapes: [
        {
          fromWaypointId: 'A',
          toWaypointId: 'B',
          points: [{ id: 'G1', position: { latitude: 0.2, longitude: 0.5 } }],
        },
        {
          fromWaypointId: 'B',
          toWaypointId: 'C',
          points: [{ id: 'G2', position: { latitude: 0.2, longitude: 1.5 } }],
        },
      ],
    };
    const result = removeWaypointFromFlightPlan(withTwoShapes, 'B');

    expect(result.waypoints.map((waypoint) => waypoint.id)).toEqual(['A', 'C']);
    expect(result.legShapes).toEqual([]);
    expect(calculateRoute(result)).toHaveLength(1);
  });

  it('rejects non-adjacent legs, duplicate IDs, and invalid insertion indexes', () => {
    const point = {
      id: 'G1',
      position: { latitude: 0.2, longitude: 0.5 },
    };
    const shaped = insertRouteShapingPoint(flightPlan, 'A', 'B', 0, point);

    expect(() =>
      insertRouteShapingPoint(flightPlan, 'A', 'C', 0, point),
    ).toThrow('does not match an adjacent waypoint leg');
    expect(() =>
      insertRouteShapingPoint(shaped, 'B', 'C', 0, point),
    ).toThrow('Duplicate route shaping point ID');
    expect(() =>
      insertRouteShapingPoint(flightPlan, 'A', 'B', 1, point),
    ).toThrow('insertion index is out of range');
  });
});
