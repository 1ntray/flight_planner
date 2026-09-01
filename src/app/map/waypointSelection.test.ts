import { describe, expect, it } from 'vitest';

import type { FlightPlan } from '../../domain';
import {
  getSharedPositionWaypointUses,
  getWaypointSectorContexts,
} from './waypointSelection';

const flightPlan: FlightPlan = {
  waypoints: [
    { id: 'A', name: 'ENDU', position: { latitude: 69, longitude: 18 } },
    { id: 'B', name: 'ESPENES', position: { latitude: 69.1, longitude: 18.1 } },
    { id: 'C', name: 'ENTC', position: { latitude: 69.2, longitude: 18.2 } },
    { id: 'D', name: 'ENDU', position: { latitude: 69, longitude: 18 } },
    { id: 'E', name: 'ENEV', position: { latitude: 69.3, longitude: 18.3 } },
  ],
  legShapes: [],
  sectorBoundaryWaypointIds: ['C'],
};

describe('waypoint map selection context', () => {
  it('groups only exact shared waypoint positions in route order', () => {
    expect(getSharedPositionWaypointUses(flightPlan, flightPlan.waypoints[0]!))
      .toEqual([
        { id: 'A', name: 'ENDU' },
        { id: 'D', name: 'ENDU' },
      ]);
  });

  it('derives a sector route and role for a regular waypoint occurrence', () => {
    expect(getWaypointSectorContexts(flightPlan, 'B')).toEqual([
      {
        sectorIndex: 0,
        departureName: 'ENDU',
        destinationName: 'ENTC',
        role: 'enroute',
      },
    ]);
  });

  it('shows both arrival and departure sector contexts for a boundary waypoint', () => {
    expect(getWaypointSectorContexts(flightPlan, 'C')).toEqual([
      {
        sectorIndex: 0,
        departureName: 'ENDU',
        destinationName: 'ENTC',
        role: 'arrival',
      },
      {
        sectorIndex: 1,
        departureName: 'ENTC',
        destinationName: 'ENEV',
        role: 'departure',
      },
    ]);
  });
});
