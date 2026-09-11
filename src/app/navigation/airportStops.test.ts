import { describe, expect, it } from 'vitest';

import type { FlightPlan } from '../../domain';
import { deriveAirportStops } from './airportStops';

function waypoint(id: string, name: string) {
  return { id, name, position: { latitude: 69, longitude: 19 } };
}

describe('deriveAirportStops', () => {
  it('presents an intermediate landing and onward departure as one stop', () => {
    const flightPlan: FlightPlan = {
      waypoints: [waypoint('a', 'A'), waypoint('b', 'B'), waypoint('c', 'C')],
      legShapes: [],
      sectorBoundaryWaypointIds: ['b'],
    };

    const stops = deriveAirportStops(flightPlan);

    expect(stops.map((stop) => [stop.name, stop.role])).toEqual([
      ['A', 'departure'],
      ['B', 'stop'],
      ['C', 'destination'],
    ]);
    expect(stops[1]?.operations.map((operation) => operation.kind)).toEqual([
      'landing',
      'takeoff',
    ]);
    expect(stops[1]?.operations.map((operation) => operation.key)).toEqual([
      'landing:a:b',
      'takeoff:b:c',
    ]);
  });

  it('keeps a simple route as one departure and one destination', () => {
    const flightPlan: FlightPlan = {
      waypoints: [waypoint('a', 'A'), waypoint('b', 'B')],
      legShapes: [],
    };

    expect(deriveAirportStops(flightPlan).map((stop) => ({
      role: stop.role,
      operations: stop.operations.map((operation) => operation.kind),
    }))).toEqual([
      { role: 'departure', operations: ['takeoff'] },
      { role: 'destination', operations: ['landing'] },
    ]);
  });
});
