import { describe, expect, it } from 'vitest';

import type { FlightPlan } from '../../domain';
import {
  buildRouteDisplayLegs,
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
    expect(buildRouteDisplayLegs(flightPlan, null, null)).toEqual([
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
});
