import { describe, expect, it } from 'vitest';

import { calculateRoute } from '../../calculations';
import type { Waypoint } from '../../domain';
import {
  appendWaypoint,
  moveWaypointById,
  removeWaypointById,
} from './waypointState';

const originalWaypoints: Waypoint[] = [
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
];

describe('waypoint state helpers', () => {
  it('appends a sequentially named waypoint with the supplied stable ID', () => {
    const result = appendWaypoint(
      originalWaypoints,
      { latitude: 69.6, longitude: 19.5 },
      'stable-d',
    );

    expect(result.at(-1)).toEqual({
      id: 'stable-d',
      name: 'WP04',
      position: { latitude: 69.6, longitude: 19.5 },
    });
    expect(originalWaypoints).toHaveLength(3);
  });

  it('moves one waypoint without changing its stable ID or name', () => {
    const position = { latitude: 69.3, longitude: 18.8 };
    const result = moveWaypointById(originalWaypoints, 'stable-b', position);

    expect(result[1]).toEqual({ id: 'stable-b', name: 'WP02', position });
    expect(result[0]).toBe(originalWaypoints[0]);
    expect(result[2]).toBe(originalWaypoints[2]);
  });

  it('removes a middle waypoint so route derivation connects its neighbours', () => {
    const remainingWaypoints = removeWaypointById(
      originalWaypoints,
      'stable-b',
    );
    const legs = calculateRoute({
      waypoints: remainingWaypoints,
      legShapes: [],
    });

    expect(remainingWaypoints.map((waypoint) => waypoint.id)).toEqual([
      'stable-a',
      'stable-c',
    ]);
    expect(legs).toHaveLength(1);
    expect(legs[0]).toMatchObject({ fromId: 'stable-a', toId: 'stable-c' });
  });
});
