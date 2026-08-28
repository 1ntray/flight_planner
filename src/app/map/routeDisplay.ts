import type { LatLngTuple } from 'leaflet';

import type { FlightPlan, Position, RouteShapingPoint } from '../../domain';
import type { RouteGeometryPointRef } from '../route/routeInsertion';
import type { RouteWaypointInsertionCandidate } from '../route/routeInsertion';

export type SelectedRoutePoint =
  | { kind: 'waypoint'; id: string }
  | { kind: 'shaping-point'; id: string };

export interface SelectedRouteLeg {
  kind: 'leg';
  candidate: RouteWaypointInsertionCandidate;
  distanceFromStartNm: number;
}

export type MapSelection = SelectedRoutePoint | SelectedRouteLeg;

export type MapTool =
  | { kind: 'select' }
  | { kind: 'add-waypoint' }
  | {
      kind: 'place-altitude-target';
      fromWaypointId: string;
      toWaypointId: string;
    };

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
  segments: RouteDisplaySegment[];
}

export interface RouteDisplaySegment {
  segmentIndex: number;
  startRef: RouteGeometryPointRef;
  endRef: RouteGeometryPointRef;
  startPosition: Position;
  endPosition: Position;
  positions: [LatLngTuple, LatLngTuple];
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
      {
        ref: { kind: 'waypoint' as const, id: from.id },
        position: getRoutePointDisplayPosition(
          from.id,
          from.position,
          draggedPoint,
        ),
      },
      ...(shape?.points.map((point) => ({
        ref: { kind: 'shaping-point' as const, id: point.id },
        position: getRoutePointDisplayPosition(
          point.id,
          point.position,
          draggedPoint,
        ),
      })) ?? []),
      {
        ref: { kind: 'waypoint' as const, id: to.id },
        position: getRoutePointDisplayPosition(to.id, to.position, draggedPoint),
      },
    ];
    const segments: RouteDisplaySegment[] = geometry.slice(1).map(
      (end, segmentIndex) => {
        const start = geometry[segmentIndex];

        if (start === undefined) {
          throw new Error('A displayed route segment must have a starting point');
        }

        return {
          segmentIndex,
          startRef: start.ref,
          endRef: end.ref,
          startPosition: start.position,
          endPosition: end.position,
          positions: [
            toLatLngTuple(start.position),
            toLatLngTuple(end.position),
          ],
        };
      },
    );
    const positions = geometry.map(({ position }) => toLatLngTuple(position));

    if (
      pendingPoint?.fromWaypointId === from.id &&
      pendingPoint.toWaypointId === to.id
    ) {
      positions.splice(
        pendingPoint.insertionIndex + 1,
        0,
        toLatLngTuple(pendingPoint.point.position),
      );
    }

    return {
      fromWaypointId: from.id,
      toWaypointId: to.id,
      positions,
      segments,
    };
  });
}
