import { describe, expect, it } from 'vitest';

import type { FlightPlan } from '../../domain';
import { traverseRouteSelection } from './selectionTraversal';

const flightPlan: FlightPlan = {
  waypoints: [
    { id: 'A', name: 'ENDU', position: { latitude: 69, longitude: 18 } },
    { id: 'B', name: 'BARDI', position: { latitude: 69.2, longitude: 18.4 } },
    { id: 'C', name: 'ENTC', position: { latitude: 69.7, longitude: 18.9 } },
  ],
  legShapes: [],
};

describe('route selection traversal', () => {
  it('cycles waypoints while a waypoint is selected', () => {
    expect(traverseRouteSelection(flightPlan, { kind: 'waypoint', id: 'B' }, 1))
      .toEqual({ kind: 'waypoint', id: 'C' });
    expect(traverseRouteSelection(flightPlan, { kind: 'waypoint', id: 'A' }, -1))
      .toEqual({ kind: 'waypoint', id: 'C' });
  });

  it('cycles real legs while a leg is selected', () => {
    const first = traverseRouteSelection(flightPlan, null, 1);
    const leg = traverseRouteSelection(flightPlan, {
      kind: 'leg',
      candidate: {
        fromWaypointId: 'A',
        toWaypointId: 'B',
        segmentIndex: 0,
        segmentStart: { kind: 'waypoint', id: 'A' },
        segmentEnd: { kind: 'waypoint', id: 'B' },
        position: { latitude: 69.1, longitude: 18.2 },
      },
      distanceFromStartNm: 1,
    }, 1);

    expect(first).toEqual({ kind: 'waypoint', id: 'A' });
    expect(leg).toMatchObject({
      kind: 'leg',
      candidate: { fromWaypointId: 'B', toWaypointId: 'C' },
    });
  });
});
