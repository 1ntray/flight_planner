import type { LatLngTuple } from 'leaflet';

import type { FlightPlan, Position, RouteShapingPoint } from '../../domain';

export type DraggedRoutePointPosition =
  | { kind: 'waypoint'; pointId: string; position: Position }
  | { kind: 'shaping-point'; pointId: string; position: Position };

export interface PendingRouteShapingPoint {
  fromWaypointId: string;
  toWaypointId: string;
  insertionIndex: number;
  point: RouteShapingPoint;
}

export interface RouteDisplayLeg {
  fromWaypointId: string;
  toWaypointId: string;
  positions: LatLngTuple[];
}

export function getRoutePointDisplayPosition(
  pointId: string,
  position: Position,
  draggedPoint: DraggedRoutePointPosition | null,
): Position {
  return draggedPoint?.pointId === pointId
    ? draggedPoint.position
    : position;
}

function toLatLngTuple(position: Position): LatLngTuple {
  return [position.latitude, position.longitude];
}

export function buildRouteDisplayLegs(
  flightPlan: FlightPlan,
  draggedPoint: DraggedRoutePointPosition | null,
  pendingPoint: PendingRouteShapingPoint | null,
): RouteDisplayLeg[] {
  return flightPlan.waypoints.slice(1).map((to, index) => {
    const from = flightPlan.waypoints[index];

    if (from === undefined) {
      throw new Error('A displayed route leg must have a starting waypoint');
    }

    const shape = flightPlan.legShapes.find(
      (candidate) =>
        candidate.fromWaypointId === from.id &&
        candidate.toWaypointId === to.id,
    );
    const geometry = [
      getRoutePointDisplayPosition(from.id, from.position, draggedPoint),
      ...(shape?.points.map((point) =>
        getRoutePointDisplayPosition(point.id, point.position, draggedPoint),
      ) ?? []),
      getRoutePointDisplayPosition(to.id, to.position, draggedPoint),
    ];

    if (
      pendingPoint?.fromWaypointId === from.id &&
      pendingPoint.toWaypointId === to.id
    ) {
      geometry.splice(
        pendingPoint.insertionIndex + 1,
        0,
        pendingPoint.point.position,
      );
    }

    return {
      fromWaypointId: from.id,
      toWaypointId: to.id,
      positions: geometry.map(toLatLngTuple),
    };
  });
}
