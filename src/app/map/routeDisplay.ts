import type { LatLngTuple } from 'leaflet';

import type { Position, Waypoint } from '../../domain';

export interface DraggedWaypointPosition {
  waypointId: string;
  position: Position;
}

export function getWaypointDisplayPosition(
  waypoint: Waypoint,
  draggedWaypoint: DraggedWaypointPosition | null,
): Position {
  return draggedWaypoint?.waypointId === waypoint.id
    ? draggedWaypoint.position
    : waypoint.position;
}

export function buildRouteDisplayPositions(
  waypoints: readonly Waypoint[],
  draggedWaypoint: DraggedWaypointPosition | null,
): LatLngTuple[] {
  return waypoints.map((waypoint) => {
    const position = getWaypointDisplayPosition(waypoint, draggedWaypoint);
    return [position.latitude, position.longitude];
  });
}

