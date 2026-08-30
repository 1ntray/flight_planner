import {
  calculatePositionAlongGeometry,
  calculateRoute,
} from '../../calculations';
import type { FlightPlan } from '../../domain';
import type { RouteGeometryPointRef } from '../route/routeInsertion';
import type { MapSelection, SelectedRouteLeg } from '../map/routeDisplay';

function wrapIndex(index: number, length: number): number {
  return ((index % length) + length) % length;
}

export function selectRouteLegAt(
  flightPlan: FlightPlan,
  legIndex: number,
): SelectedRouteLeg | null {
  const legs = calculateRoute(flightPlan);
  const leg = legs[legIndex];

  if (leg === undefined || leg.geometry.length < 2) {
    return null;
  }

  const shape = flightPlan.legShapes.find(
    (candidate) =>
      candidate.fromWaypointId === leg.fromId &&
      candidate.toWaypointId === leg.toId,
  );
  const pointRefs: readonly RouteGeometryPointRef[] = [
    { kind: 'waypoint', id: leg.fromId },
    ...(shape?.points.map((point) => ({
      kind: 'shaping-point' as const,
      id: point.id,
    })) ?? []),
    { kind: 'waypoint', id: leg.toId },
  ];
  const midpoint = calculatePositionAlongGeometry(
    leg.geometry,
    leg.distanceNm / 2,
  );
  const segmentIndex = Math.min(
    midpoint.segmentIndex,
    pointRefs.length - 2,
  );

  return {
    kind: 'leg',
    candidate: {
      fromWaypointId: leg.fromId,
      toWaypointId: leg.toId,
      segmentIndex,
      segmentStart: pointRefs[segmentIndex]!,
      segmentEnd: pointRefs[segmentIndex + 1]!,
      position: midpoint.position,
    },
    distanceFromStartNm: midpoint.distanceFromStartNm,
  };
}

/** Moves among like route objects without making IDs part of the UI contract. */
export function traverseRouteSelection(
  flightPlan: FlightPlan,
  selection: MapSelection | null,
  direction: -1 | 1,
): MapSelection | null {
  if (flightPlan.waypoints.length === 0) {
    return null;
  }

  if (selection?.kind === 'waypoint') {
    const currentIndex = flightPlan.waypoints.findIndex(
      (waypoint) => waypoint.id === selection.id,
    );
    const index = wrapIndex(
      (currentIndex < 0 ? 0 : currentIndex) + direction,
      flightPlan.waypoints.length,
    );
    return { kind: 'waypoint', id: flightPlan.waypoints[index]!.id };
  }

  if (selection?.kind === 'leg') {
    const legs = calculateRoute(flightPlan);
    if (legs.length === 0) {
      return { kind: 'waypoint', id: flightPlan.waypoints[0]!.id };
    }
    const currentIndex = legs.findIndex(
      (leg) =>
        leg.fromId === selection.candidate.fromWaypointId &&
        leg.toId === selection.candidate.toWaypointId,
    );
    return selectRouteLegAt(
      flightPlan,
      wrapIndex((currentIndex < 0 ? 0 : currentIndex) + direction, legs.length),
    );
  }

  return {
    kind: 'waypoint',
    id: flightPlan.waypoints[
      direction === 1 ? 0 : flightPlan.waypoints.length - 1
    ]!.id,
  };
}
