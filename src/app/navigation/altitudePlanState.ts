import { calculateNearestPointOnGeometry, calculateRoute } from '../../calculations';
import type { FlightPlan, LegAltitudePlan } from '../../domain';
import type { RouteWaypointInsertionCandidate } from '../route/routeInsertion';

export interface AltitudePlacementLeg {
  fromWaypointId: string;
  toWaypointId: string;
  target: 'primary' | 'end';
}

function legMatches(
  plan: LegAltitudePlan,
  fromWaypointId: string,
  toWaypointId: string,
): boolean {
  return (
    plan.fromWaypointId === fromWaypointId &&
    plan.toWaypointId === toWaypointId
  );
}

function updateLegPlan(
  plans: readonly LegAltitudePlan[],
  fromWaypointId: string,
  toWaypointId: string,
  update: (plan: LegAltitudePlan) => LegAltitudePlan,
): LegAltitudePlan[] {
  const existing = plans.find((plan) =>
    legMatches(plan, fromWaypointId, toWaypointId),
  );
  const updated = update(
    existing ?? { fromWaypointId, toWaypointId },
  );
  const keepUpdated =
    updated.minimumSafeAltitudeFtMsl !== undefined ||
    updated.altitudeFtMsl !== undefined ||
    updated.targetPlacement !== undefined ||
    updated.endAltitudeFtMsl !== undefined ||
    updated.endTargetPlacement !== undefined;

  return [
    ...plans.filter(
      (plan) => !legMatches(plan, fromWaypointId, toWaypointId),
    ),
    ...(keepUpdated ? [updated] : []),
  ];
}

export function setLegAltitudeOverride(
  plans: readonly LegAltitudePlan[],
  fromWaypointId: string,
  toWaypointId: string,
  altitudeFtMsl: number | null,
): LegAltitudePlan[] {
  return updateLegPlan(
    plans,
    fromWaypointId,
    toWaypointId,
    (plan) => {
      if (altitudeFtMsl === null) {
        const { altitudeFtMsl: _removed, ...withoutAltitude } = plan;
        return withoutAltitude;
      }

      return { ...plan, altitudeFtMsl };
    },
  );
}

export function setLegMinimumSafeAltitude(
  plans: readonly LegAltitudePlan[],
  fromWaypointId: string,
  toWaypointId: string,
  minimumSafeAltitudeFtMsl: number | null,
): LegAltitudePlan[] {
  return updateLegPlan(plans, fromWaypointId, toWaypointId, (plan) => {
    if (minimumSafeAltitudeFtMsl === null) {
      const { minimumSafeAltitudeFtMsl: _removed, ...withoutMsa } = plan;
      return withoutMsa;
    }

    return { ...plan, minimumSafeAltitudeFtMsl };
  });
}

export function setLegEndAltitudeOverride(
  plans: readonly LegAltitudePlan[],
  fromWaypointId: string,
  toWaypointId: string,
  altitudeFtMsl: number | null,
): LegAltitudePlan[] {
  return updateLegPlan(plans, fromWaypointId, toWaypointId, (plan) => {
    if (altitudeFtMsl === null) {
      const {
        endAltitudeFtMsl: _removedAltitude,
        endTargetPlacement: _removedPlacement,
        ...withoutEndAltitude
      } = plan;
      return withoutEndAltitude;
    }

    return { ...plan, endAltitudeFtMsl: altitudeFtMsl };
  });
}

/**
 * Keeps a leg altitude instruction attached to its physical route location
 * when a real waypoint splits that leg. Both new legs inherit the altitude;
 * an explicit target point moves to the side of the split that contains it.
 */
export function splitLegAltitudePlanForWaypointInsertion(
  plans: readonly LegAltitudePlan[],
  flightPlan: FlightPlan,
  candidate: RouteWaypointInsertionCandidate,
  insertedWaypointId: string,
): LegAltitudePlan[] {
  const sourcePlan = plans.find((plan) =>
    legMatches(plan, candidate.fromWaypointId, candidate.toWaypointId),
  );

  if (sourcePlan === undefined) {
    return [...plans];
  }

  const sourceLeg = calculateRoute(flightPlan).find(
    (leg) =>
      leg.fromId === candidate.fromWaypointId &&
      leg.toId === candidate.toWaypointId,
  );

  if (sourceLeg === undefined) {
    throw new RangeError('Waypoint insertion candidate does not match an altitude-plan leg');
  }

  const splitDistanceNm = calculateNearestPointOnGeometry(
    sourceLeg.geometry,
    candidate.position,
  ).distanceFromStartNm;
  const base = {
    ...(sourcePlan.minimumSafeAltitudeFtMsl === undefined
      ? {}
      : { minimumSafeAltitudeFtMsl: sourcePlan.minimumSafeAltitudeFtMsl }),
    ...(sourcePlan.altitudeFtMsl === undefined
      ? {}
      : { altitudeFtMsl: sourcePlan.altitudeFtMsl }),
  };
  let leftPlacement: LegAltitudePlan['targetPlacement'];
  let rightPlacement: LegAltitudePlan['targetPlacement'];

  if (sourcePlan.targetPlacement?.mode === 'distance-along-leg') {
    if (sourcePlan.targetPlacement.distanceFromStartNm <= splitDistanceNm) {
      leftPlacement = sourcePlan.targetPlacement;
    } else {
      rightPlacement = {
        mode: 'distance-along-leg',
        distanceFromStartNm:
          sourcePlan.targetPlacement.distanceFromStartNm - splitDistanceNm,
      };
    }
  } else if (sourcePlan.targetPlacement?.mode === 'automatic') {
    leftPlacement = sourcePlan.targetPlacement;
  }

  const left: LegAltitudePlan = {
    fromWaypointId: candidate.fromWaypointId,
    toWaypointId: insertedWaypointId,
    ...base,
    ...(leftPlacement === undefined ? {} : { targetPlacement: leftPlacement }),
  };
  const right: LegAltitudePlan = {
    fromWaypointId: insertedWaypointId,
    toWaypointId: candidate.toWaypointId,
    ...base,
    ...(rightPlacement === undefined ? {} : { targetPlacement: rightPlacement }),
  };

  if (sourcePlan.endAltitudeFtMsl !== undefined) {
    const endPlacement = sourcePlan.endTargetPlacement;
    if (
      endPlacement?.mode === 'distance-along-leg' &&
      endPlacement.distanceFromStartNm <= splitDistanceNm
    ) {
      Object.assign(left, {
        endAltitudeFtMsl: sourcePlan.endAltitudeFtMsl,
        endTargetPlacement: endPlacement,
      });
      Object.assign(right, {
        altitudeFtMsl: sourcePlan.endAltitudeFtMsl,
      });
    } else {
      Object.assign(right, {
        endAltitudeFtMsl: sourcePlan.endAltitudeFtMsl,
        ...(endPlacement?.mode === 'distance-along-leg'
          ? {
              endTargetPlacement: {
                mode: 'distance-along-leg' as const,
                distanceFromStartNm:
                  endPlacement.distanceFromStartNm - splitDistanceNm,
              },
            }
          : endPlacement === undefined
            ? {}
            : { endTargetPlacement: endPlacement }),
      });
    }
  }

  return [
    ...plans.filter(
      (plan) => !legMatches(plan, candidate.fromWaypointId, candidate.toWaypointId),
    ),
    left,
    right,
  ];
}

export function removeAltitudePlansTouchingWaypoint(
  plans: readonly LegAltitudePlan[],
  waypointId: string,
): LegAltitudePlan[] {
  return plans.filter(
    (plan) =>
      plan.fromWaypointId !== waypointId && plan.toWaypointId !== waypointId,
  );
}

export function setLegAltitudeTargetDistance(
  plans: readonly LegAltitudePlan[],
  fromWaypointId: string,
  toWaypointId: string,
  distanceFromStartNm: number | null,
): LegAltitudePlan[] {
  return updateLegPlan(
    plans,
    fromWaypointId,
    toWaypointId,
    (plan) => {
      if (distanceFromStartNm === null) {
        const { targetPlacement: _removed, ...withoutPlacement } = plan;
        return withoutPlacement;
      }

      return {
        ...plan,
        targetPlacement: {
          mode: 'distance-along-leg',
          distanceFromStartNm,
        },
      };
    },
  );
}

export function setLegEndAltitudeTargetDistance(
  plans: readonly LegAltitudePlan[],
  fromWaypointId: string,
  toWaypointId: string,
  distanceFromStartNm: number | null,
): LegAltitudePlan[] {
  return updateLegPlan(plans, fromWaypointId, toWaypointId, (plan) => {
    if (distanceFromStartNm === null) {
      const { endTargetPlacement: _removed, ...withoutPlacement } = plan;
      return withoutPlacement;
    }

    return {
      ...plan,
      endTargetPlacement: {
        mode: 'distance-along-leg',
        distanceFromStartNm,
      },
    };
  });
}
