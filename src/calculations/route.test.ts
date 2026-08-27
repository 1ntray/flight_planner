import { describe, expect, it } from 'vitest';

import type { FlightPlan } from '../domain';
import { calculateFlightPlanLegs, calculateRoute } from './route';

describe('calculateFlightPlanLegs', () => {
  it.each([
    { waypoints: [], description: 'no waypoints' },
    {
      waypoints: [
        {
          id: 'ESSA',
          name: 'Stockholm Arlanda',
          position: { latitude: 59.6519, longitude: 17.9186 },
        },
      ],
      description: 'one waypoint',
    },
  ] satisfies Array<FlightPlan & { description: string }>) (
    'returns no legs for $description',
    ({ waypoints }) => {
      expect(calculateFlightPlanLegs({ waypoints })).toEqual([]);
    },
  );

  it('derives ordered adjacent legs from the waypoint array', () => {
    const flightPlan: FlightPlan = {
      waypoints: [
        {
          id: 'A',
          name: 'Start',
          position: { latitude: 0, longitude: 0 },
        },
        {
          id: 'B',
          name: 'Middle',
          position: { latitude: 0, longitude: 1 },
        },
        {
          id: 'C',
          name: 'Finish',
          position: { latitude: 1, longitude: 1 },
        },
      ],
    };

    const legs = calculateFlightPlanLegs(flightPlan);

    expect(legs).toHaveLength(2);
    expect(legs[0]).toMatchObject({
      fromId: 'A',
      toId: 'B',
      trueTrackDeg: 90,
    });
    expect(legs[0]?.distanceNm).toBeCloseTo(60.107716, 6);
    expect(legs[1]).toMatchObject({
      fromId: 'B',
      toId: 'C',
      trueTrackDeg: 0,
    });
    expect(legs[1]?.distanceNm).toBeCloseTo(59.705393, 6);
  });

  it('derives a null track for a zero-length leg', () => {
    const position = { latitude: 57.6628, longitude: 12.2798 };
    const flightPlan: FlightPlan = {
      waypoints: [
        { id: 'A', name: 'First', position },
        { id: 'B', name: 'Second', position },
      ],
    };

    expect(calculateFlightPlanLegs(flightPlan)).toEqual([
      {
        fromId: 'A',
        toId: 'B',
        distanceNm: 0,
        trueTrackDeg: null,
      },
    ]);
  });

  it('recalculates legs from the current waypoint order', () => {
    const first = {
      id: 'A',
      name: 'First',
      position: { latitude: 0, longitude: 0 },
    };
    const second = {
      id: 'B',
      name: 'Second',
      position: { latitude: 0, longitude: 1 },
    };

    expect(calculateFlightPlanLegs({ waypoints: [first, second] })[0]).toMatchObject(
      { fromId: 'A', toId: 'B', trueTrackDeg: 90 },
    );
    expect(calculateFlightPlanLegs({ waypoints: [second, first] })[0]).toMatchObject(
      { fromId: 'B', toId: 'A', trueTrackDeg: 270 },
    );
  });

  it('derives the route directly from a waypoint array', () => {
    const waypoints = [
      {
        id: 'A',
        name: 'First',
        position: { latitude: 69, longitude: 18 },
      },
      {
        id: 'B',
        name: 'Second',
        position: { latitude: 69.5, longitude: 19 },
      },
    ];

    expect(calculateRoute(waypoints)).toEqual(
      calculateFlightPlanLegs({ waypoints }),
    );
  });
});
