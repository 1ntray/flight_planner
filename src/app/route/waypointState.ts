import type { Position, Waypoint } from '../../domain';
import { getNextWaypointName } from './waypointNaming';

export function appendWaypoint(
  waypoints: readonly Waypoint[],
  position: Position,
  id: string,
): Waypoint[] {
  return [
    ...waypoints,
    {
      id,
      name: getNextWaypointName(waypoints),
      position,
    },
  ];
}

export function moveWaypointById(
  waypoints: readonly Waypoint[],
  id: string,
  position: Position,
): Waypoint[] {
  return waypoints.map((waypoint) =>
    waypoint.id === id ? { ...waypoint, position } : waypoint,
  );
}

export function removeWaypointById(
  waypoints: readonly Waypoint[],
  id: string,
): Waypoint[] {
  return waypoints.filter((waypoint) => waypoint.id !== id);
}

