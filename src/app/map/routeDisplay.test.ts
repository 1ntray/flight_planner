import { describe, expect, it } from 'vitest';

import type { Waypoint } from '../../domain';
import {
  buildRouteDisplayPositions,
  getWaypointDisplayPosition,
} from './routeDisplay';

const waypoints: Waypoint[] = [
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

describe('route display positions', () => {
  it('uses canonical waypoint coordinates when no marker is being dragged', () => {
    expect(buildRouteDisplayPositions(waypoints, null)).toEqual([
      [69, 18],
      [69.2, 18.5],
      [69.4, 19],
    ]);
  });

  it('substitutes only the temporary dragged position', () => {
    const draggedWaypoint = {
      waypointId: 'stable-b',
      position: { latitude: 69.3, longitude: 18.8 },
    };

    expect(buildRouteDisplayPositions(waypoints, draggedWaypoint)).toEqual([
      [69, 18],
      [69.3, 18.8],
      [69.4, 19],
    ]);
    expect(getWaypointDisplayPosition(waypoints[1]!, draggedWaypoint)).toBe(
      draggedWaypoint.position,
    );
    expect(waypoints[1]?.position).toEqual({ latitude: 69.2, longitude: 18.5 });
  });

  it('ignores temporary state for a waypoint that is not in the route', () => {
    expect(
      buildRouteDisplayPositions(waypoints, {
        waypointId: 'removed-waypoint',
        position: { latitude: 70, longitude: 20 },
      }),
    ).toEqual([
      [69, 18],
      [69.2, 18.5],
      [69.4, 19],
    ]);
  });
});

