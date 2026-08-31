import { describe, expect, it } from 'vitest';

import type { FlightPlan } from '../../domain';
import {
  buildRouteDisplayLegs,
  getRouteDisplayLegMidpoint,
  getRouteSectorColor,
  getRoutePointDisplayPosition,
} from './routeDisplay';

const flightPlan: FlightPlan = {
  waypoints: [
    {
      id: 'stable-a',
      name: 'WP01',
      position: { latitude: 69, longitude: 18 },
    },
    {
      id: 'stable-b',
      name: 'WP02',
      position: { latitude: 69.2, longitude: 18.5 },
    },
    {
      id: 'stable-c',
      name: 'WP03',
      position: { latitude: 69.4, longitude: 19 },
    },
  ],
  legShapes: [
    {
      fromWaypointId: 'stable-a',
      toWaypointId: 'stable-b',
      points: [
        {
          id: 'shape-1',
          position: { latitude: 69.1, longitude: 18.15 },
        },
      ],
    },
  ],
};

describe('route display geometry', () => {
  it('builds one geometry per real-waypoint leg with shaping points included', () => {
    const display = buildRouteDisplayLegs(flightPlan, null, null);

    expect(
      display.map(({ fromWaypointId, toWaypointId, positions }) => ({
        fromWaypointId,
        toWaypointId,
        positions,
      })),
    ).toEqual([
      {
        fromWaypointId: 'stable-a',
        toWaypointId: 'stable-b',
        positions: [
          [69, 18],
          [69.1, 18.15],
          [69.2, 18.5],
        ],
      },
      {
        fromWaypointId: 'stable-b',
        toWaypointId: 'stable-c',
        positions: [
          [69.2, 18.5],
          [69.4, 19],
        ],
      },
    ]);
    expect(display[0]?.segments).toEqual([
      {
        segmentIndex: 0,
        startRef: { kind: 'waypoint', id: 'stable-a' },
        endRef: { kind: 'shaping-point', id: 'shape-1' },
        startPosition: { latitude: 69, longitude: 18 },
        endPosition: { latitude: 69.1, longitude: 18.15 },
        positions: [
          [69, 18],
          [69.1, 18.15],
        ],
      },
      {
        segmentIndex: 1,
        startRef: { kind: 'shaping-point', id: 'shape-1' },
        endRef: { kind: 'waypoint', id: 'stable-b' },
        startPosition: { latitude: 69.1, longitude: 18.15 },
        endPosition: { latitude: 69.2, longitude: 18.5 },
        positions: [
          [69.1, 18.15],
          [69.2, 18.5],
        ],
      },
    ]);
  });

  it('substitutes a dragged point without mutating canonical input', () => {
    const position = { latitude: 69.15, longitude: 18.3 };
    const display = buildRouteDisplayLegs(
      flightPlan,
      { kind: 'shaping-point', pointId: 'shape-1', position },
      null,
    );

    expect(display[0]?.positions[1]).toEqual([69.15, 18.3]);
    expect(
      getRoutePointDisplayPosition('shape-1', { latitude: 0, longitude: 0 }, {
        kind: 'shaping-point',
        pointId: 'shape-1',
        position,
      }),
    ).toBe(position);
    expect(flightPlan.legShapes[0]?.points[0]?.position).toEqual({
      latitude: 69.1,
      longitude: 18.15,
    });
  });

  it('finds a WGS84 midpoint along displayed shaping geometry', () => {
    const display = buildRouteDisplayLegs(flightPlan, null, null);
    const midpoint = getRouteDisplayLegMidpoint(display[0]!);

    // The first shaped segment is shorter than the second, so the halfway
    // position lies on the second segment rather than at the shape handle.
    expect(midpoint.latitude).toBeGreaterThan(69.1);
    expect(midpoint.latitude).toBeLessThan(69.2);
    expect(midpoint.longitude).toBeGreaterThan(18.15);
    expect(midpoint.longitude).toBeLessThan(18.5);
  });

  it('inserts a pending shaping point at the selected segment index', () => {
    const display = buildRouteDisplayLegs(flightPlan, null, {
      fromWaypointId: 'stable-a',
      toWaypointId: 'stable-b',
      insertionIndex: 1,
      point: {
        id: 'pending',
        position: { latitude: 69.18, longitude: 18.4 },
      },
    });

    expect(display[0]?.positions).toEqual([
      [69, 18],
      [69.1, 18.15],
      [69.18, 18.4],
      [69.2, 18.5],
    ]);
  });

  it('assigns a stable, distinct color index to each derived sector', () => {
    const display = buildRouteDisplayLegs({
      ...flightPlan,
      sectorBoundaryWaypointIds: ['stable-b'],
    }, null, null);

    expect(display.map(({ sectorIndex }) => sectorIndex)).toEqual([0, 1]);
    expect(getRouteSectorColor(display[0]!.sectorIndex)).not.toBe(
      getRouteSectorColor(display[1]!.sectorIndex),
    );
    expect(getRouteSectorColor(5)).toBe(getRouteSectorColor(0));
  });
});
