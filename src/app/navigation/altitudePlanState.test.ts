import { describe, expect, it } from 'vitest';

import { calculateNearestPointOnGeometry, calculateRoute } from '../../calculations';
import type { FlightPlan, LegAltitudePlan } from '../../domain';
import type { RouteWaypointInsertionCandidate } from '../route/routeInsertion';
import {
  setLegAltitudeOverride,
  setLegAltitudeTargetDistance,
  splitLegAltitudePlanForWaypointInsertion,
} from './altitudePlanState';

const flightPlan: FlightPlan = {
  waypoints: [
    { id: 'A', name: 'A', position: { latitude: 0, longitude: 0 } },
    { id: 'B', name: 'B', position: { latitude: 0, longitude: 2 } },
  ],
  legShapes: [{
    fromWaypointId: 'A',
    toWaypointId: 'B',
    points: [{ id: 'G', position: { latitude: 0.4, longitude: 1 } }],
  }],
};

const candidate: RouteWaypointInsertionCandidate = {
  fromWaypointId: 'A',
  toWaypointId: 'B',
  segmentIndex: 1,
  segmentStart: { kind: 'shaping-point', id: 'G' },
  segmentEnd: { kind: 'waypoint', id: 'B' },
  position: { latitude: 0.2, longitude: 1.5 },
};

describe('leg altitude-plan state', () => {
  it('adds and removes optional altitude and target fields without undefined properties', () => {
    let plans = setLegAltitudeOverride([], 'A', 'B', 4500);
    plans = setLegAltitudeTargetDistance(plans, 'A', 'B', 12.5);

    expect(plans).toEqual([{
      fromWaypointId: 'A',
      toWaypointId: 'B',
      altitudeFtMsl: 4500,
      targetPlacement: { mode: 'distance-along-leg', distanceFromStartNm: 12.5 },
    }]);

    plans = setLegAltitudeOverride(plans, 'A', 'B', null);
    plans = setLegAltitudeTargetDistance(plans, 'A', 'B', null);
    expect(plans).toEqual([]);
  });

  it('keeps an altitude target on the first split leg when it precedes the inserted waypoint', () => {
    const geometry = calculateRoute(flightPlan)[0]!.geometry;
    const splitDistanceNm = calculateNearestPointOnGeometry(
      geometry,
      candidate.position,
    ).distanceFromStartNm;
    const plans: LegAltitudePlan[] = [{
      fromWaypointId: 'A',
      toWaypointId: 'B',
      altitudeFtMsl: 5500,
      targetPlacement: {
        mode: 'distance-along-leg',
        distanceFromStartNm: splitDistanceNm - 1,
      },
    }];

    expect(
      splitLegAltitudePlanForWaypointInsertion(
        plans,
        flightPlan,
        candidate,
        'W',
      ),
    ).toEqual([
      {
        fromWaypointId: 'A',
        toWaypointId: 'W',
        altitudeFtMsl: 5500,
        targetPlacement: {
          mode: 'distance-along-leg',
          distanceFromStartNm: splitDistanceNm - 1,
        },
      },
      { fromWaypointId: 'W', toWaypointId: 'B', altitudeFtMsl: 5500 },
    ]);
  });

  it('moves a later altitude target to the second split leg with a local distance', () => {
    const geometry = calculateRoute(flightPlan)[0]!.geometry;
    const splitDistanceNm = calculateNearestPointOnGeometry(
      geometry,
      candidate.position,
    ).distanceFromStartNm;
    const plans: LegAltitudePlan[] = [{
      fromWaypointId: 'A',
      toWaypointId: 'B',
      altitudeFtMsl: 5500,
      targetPlacement: {
        mode: 'distance-along-leg',
        distanceFromStartNm: splitDistanceNm + 2,
      },
    }];
    const result = splitLegAltitudePlanForWaypointInsertion(
      plans,
      flightPlan,
      candidate,
      'W',
    );

    expect(result[0]).toEqual({
      fromWaypointId: 'A',
      toWaypointId: 'W',
      altitudeFtMsl: 5500,
    });
    expect(result[1]).toMatchObject({
      fromWaypointId: 'W',
      toWaypointId: 'B',
      targetPlacement: { mode: 'distance-along-leg' },
    });
    expect(result[1]?.targetPlacement?.mode === 'distance-along-leg'
      ? result[1].targetPlacement.distanceFromStartNm
      : null).toBeCloseTo(2, 10);
  });
});
