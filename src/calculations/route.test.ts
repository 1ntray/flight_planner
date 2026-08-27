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
  ].map((value) => ({ ...value, legShapes: [] })) satisfies Array<
    FlightPlan & { description: string }
  >)(
    'returns no legs for $description',
    ({ waypoints, legShapes }) => {
      expect(calculateFlightPlanLegs({ waypoints, legShapes })).toEqual([]);
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
      legShapes: [],
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
      legShapes: [],
    };

    expect(calculateFlightPlanLegs(flightPlan)).toEqual([
      {
        fromId: 'A',
        toId: 'B',
        geometry: [position, position],
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

    expect(
      calculateFlightPlanLegs({ waypoints: [first, second], legShapes: [] })[0],
    ).toMatchObject({ fromId: 'A', toId: 'B', trueTrackDeg: 90 });
    expect(
      calculateFlightPlanLegs({ waypoints: [second, first], legShapes: [] })[0],
    ).toMatchObject({ fromId: 'B', toId: 'A', trueTrackDeg: 270 });
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

    expect(calculateRoute({ waypoints, legShapes: [] })).toEqual(
      calculateFlightPlanLegs({ waypoints, legShapes: [] }),
    );
  });

  it('keeps direct true track while summing unrounded shaped segments', () => {
    const waypoints = [
      {
        id: 'A',
        name: 'Start',
        position: { latitude: 0, longitude: 0 },
      },
      {
        id: 'B',
        name: 'Finish',
        position: { latitude: 0, longitude: 2 },
      },
    ];
    const shapingPoints = [
      { id: 'G1', position: { latitude: 0.5, longitude: 0.5 } },
      { id: 'G2', position: { latitude: 0.5, longitude: 1.5 } },
    ];
    const directLeg = calculateRoute({ waypoints, legShapes: [] })[0]!;
    const shapedLeg = calculateRoute({
      waypoints,
      legShapes: [
        { fromWaypointId: 'A', toWaypointId: 'B', points: shapingPoints },
      ],
    })[0]!;
    const expectedDistance =
      calculateRoute({
        waypoints: [
          waypoints[0]!,
          { id: 'G1', name: 'unused', position: shapingPoints[0]!.position },
          { id: 'G2', name: 'unused', position: shapingPoints[1]!.position },
          waypoints[1]!,
        ],
        legShapes: [],
      }).reduce((total, leg) => total + leg.distanceNm, 0);

    expect(shapedLeg.trueTrackDeg).toBe(directLeg.trueTrackDeg);
    expect(shapedLeg.trueTrackDeg).toBeCloseTo(90, 12);
    expect(shapedLeg.distanceNm).toBeCloseTo(expectedDistance, 12);
    expect(shapedLeg.distanceNm).toBeGreaterThan(directLeg.distanceNm);
    expect(shapedLeg.geometry).toEqual([
      waypoints[0]!.position,
      shapingPoints[0]!.position,
      shapingPoints[1]!.position,
      waypoints[1]!.position,
    ]);
  });

  it('rejects duplicate and orphaned leg shapes', () => {
    const waypoints = [
      { id: 'A', name: 'A', position: { latitude: 0, longitude: 0 } },
      { id: 'B', name: 'B', position: { latitude: 0, longitude: 1 } },
    ];
    const shape = {
      fromWaypointId: 'A',
      toWaypointId: 'B',
      points: [{ id: 'G1', position: { latitude: 0.5, longitude: 0.5 } }],
    };

    expect(() =>
      calculateRoute({ waypoints, legShapes: [shape, shape] }),
    ).toThrow('Duplicate route shape');
    expect(() =>
      calculateRoute({
        waypoints,
        legShapes: [{ ...shape, toWaypointId: 'missing' }],
      }),
    ).toThrow('does not match an adjacent waypoint leg');
  });
});
