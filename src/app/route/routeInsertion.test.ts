import { describe, expect, it } from 'vitest';

import {
  calculateGeodesicMidpoint,
  calculateRoute,
} from '../../calculations';
import type { FlightPlan } from '../../domain';
import type { RouteWaypointInsertionCandidate } from './routeInsertion';
import { insertWaypointIntoFlightPlan } from './routeInsertion';

const shapedFlightPlan: FlightPlan = {
  waypoints: [
    { id: 'A', name: 'WP01', position: { latitude: 0, longitude: 0 } },
    { id: 'B', name: 'WP02', position: { latitude: 0, longitude: 3 } },
    { id: 'C', name: 'WP03', position: { latitude: 1, longitude: 3 } },
  ],
  legShapes: [
    {
      fromWaypointId: 'A',
      toWaypointId: 'B',
      points: [
        { id: 'G1', position: { latitude: 0.5, longitude: 1 } },
        { id: 'G2', position: { latitude: 0.5, longitude: 2 } },
      ],
    },
    {
      fromWaypointId: 'B',
      toWaypointId: 'C',
      points: [
        { id: 'G3', position: { latitude: 0.5, longitude: 3.2 } },
      ],
    },
  ],
};

function candidate(
  segmentIndex: number,
  position = { latitude: 0.5, longitude: 1.5 },
): RouteWaypointInsertionCandidate {
  const refs = [
    { kind: 'waypoint' as const, id: 'A' },
    { kind: 'shaping-point' as const, id: 'G1' },
    { kind: 'shaping-point' as const, id: 'G2' },
    { kind: 'waypoint' as const, id: 'B' },
  ];

  return {
    fromWaypointId: 'A',
    toWaypointId: 'B',
    segmentIndex,
    segmentStart: refs[segmentIndex]!,
    segmentEnd: refs[segmentIndex + 1]!,
    position,
  };
}

describe('insertWaypointIntoFlightPlan', () => {
  it('inserts a normal real waypoint into a direct leg', () => {
    const directPlan: FlightPlan = {
      waypoints: shapedFlightPlan.waypoints.slice(0, 2),
      legShapes: [],
    };
    const result = insertWaypointIntoFlightPlan(
      directPlan,
      {
        fromWaypointId: 'A',
        toWaypointId: 'B',
        segmentIndex: 0,
        segmentStart: { kind: 'waypoint', id: 'A' },
        segmentEnd: { kind: 'waypoint', id: 'B' },
        position: { latitude: 0, longitude: 1.5 },
      },
      'W',
    );

    expect(result.waypoints.map(({ id }) => id)).toEqual(['A', 'W', 'B']);
    expect(result.waypoints[1]).toEqual({
      id: 'W',
      name: 'WP03',
      position: { latitude: 0, longitude: 1.5 },
    });
    expect(result.legShapes).toEqual([]);
    expect(calculateRoute(result).map(({ fromId, toId }) => [fromId, toId]))
      .toEqual([
        ['A', 'W'],
        ['W', 'B'],
      ]);
  });

  it.each([
    {
      segmentIndex: 0,
      expectedShapes: [
        { fromWaypointId: 'W', toWaypointId: 'B', pointIds: ['G1', 'G2'] },
      ],
    },
    {
      segmentIndex: 1,
      expectedShapes: [
        { fromWaypointId: 'A', toWaypointId: 'W', pointIds: ['G1'] },
        { fromWaypointId: 'W', toWaypointId: 'B', pointIds: ['G2'] },
      ],
    },
    {
      segmentIndex: 2,
      expectedShapes: [
        { fromWaypointId: 'A', toWaypointId: 'W', pointIds: ['G1', 'G2'] },
      ],
    },
  ])(
    'splits shaped geometry correctly at segment $segmentIndex',
    ({ segmentIndex, expectedShapes }) => {
      const result = insertWaypointIntoFlightPlan(
        shapedFlightPlan,
        candidate(segmentIndex),
        'W',
      );
      const splitShapes = result.legShapes
        .filter((shape) => shape.fromWaypointId !== 'B')
        .map((shape) => ({
          fromWaypointId: shape.fromWaypointId,
          toWaypointId: shape.toWaypointId,
          pointIds: shape.points.map(({ id }) => id),
        }));

      expect(splitShapes).toEqual(expectedShapes);
      expect(result.legShapes.find((shape) => shape.fromWaypointId === 'B'))
        .toBe(shapedFlightPlan.legShapes[1]);
    },
  );

  it('preserves shaped distance while deriving direct tracks for both new legs', () => {
    const g1 = shapedFlightPlan.legShapes[0]!.points[0]!;
    const g2 = shapedFlightPlan.legShapes[0]!.points[1]!;
    const snappedPosition = calculateGeodesicMidpoint(g1.position, g2.position);
    const originalLeg = calculateRoute(shapedFlightPlan)[0]!;
    const result = insertWaypointIntoFlightPlan(
      shapedFlightPlan,
      candidate(1, snappedPosition),
      'W',
    );
    const splitLegs = calculateRoute(result).slice(0, 2);

    expect(
      splitLegs.reduce((total, leg) => total + leg.distanceNm, 0),
    ).toBeCloseTo(originalLeg.distanceNm, 10);
    expect(splitLegs[0]?.trueTrackDeg).toBeCloseTo(
      calculateRoute({
        waypoints: [result.waypoints[0]!, result.waypoints[1]!],
        legShapes: [],
      })[0]!.trueTrackDeg!,
      12,
    );
    expect(splitLegs[1]?.trueTrackDeg).toBeCloseTo(
      calculateRoute({
        waypoints: [result.waypoints[1]!, result.waypoints[2]!],
        legShapes: [],
      })[0]!.trueTrackDeg!,
      12,
    );
  });

  it('rejects stale geometry references and non-adjacent endpoints', () => {
    expect(() =>
      insertWaypointIntoFlightPlan(
        shapedFlightPlan,
        { ...candidate(1), segmentStart: { kind: 'waypoint', id: 'A' } },
        'W',
      ),
    ).toThrow('no longer matches the route geometry');
    expect(() =>
      insertWaypointIntoFlightPlan(
        shapedFlightPlan,
        { ...candidate(1), toWaypointId: 'C' },
        'W',
      ),
    ).toThrow('no longer matches an adjacent leg');
  });
});
