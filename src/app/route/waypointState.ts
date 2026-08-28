import type { AeronauticalPointFeature, Position, Waypoint } from '../../domain';
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

export function appendAnchoredWaypoint(
  waypoints: readonly Waypoint[],
  feature: AeronauticalPointFeature,
  id: string,
): Waypoint[] {
  if (feature.ref.featureKind !== feature.pointKind) {
    throw new RangeError('Aeronautical point kind must match its feature reference');
  }

  if (feature.suggestedWaypointName.trim() === '') {
    throw new RangeError('Anchored waypoint name must not be empty');
  }

  return [
    ...waypoints,
    {
      id,
      name: feature.suggestedWaypointName,
      position: { ...feature.position },
      anchor: {
        kind: 'aeronautical-feature',
        feature: {
          ...feature.ref,
          dataset: { ...feature.ref.dataset },
        },
        publishedIdentifier: feature.identifier,
        ...(feature.name === undefined
          ? {}
          : { publishedName: feature.name }),
      },
    },
  ];
}

export function moveWaypointById(
  waypoints: readonly Waypoint[],
  id: string,
  position: Position,
): Waypoint[] {
  const waypoint = waypoints.find((candidate) => candidate.id === id);

  if (waypoint?.anchor !== undefined) {
    throw new RangeError('Anchored waypoint must be detached before moving');
  }

  return waypoints.map((waypoint) =>
    waypoint.id === id ? { ...waypoint, position } : waypoint,
  );
}

export function detachWaypointById(
  waypoints: readonly Waypoint[],
  id: string,
): Waypoint[] {
  return waypoints.map((waypoint) => {
    if (waypoint.id !== id || waypoint.anchor === undefined) {
      return waypoint;
    }

    const { anchor: _anchor, ...detachedWaypoint } = waypoint;
    return detachedWaypoint;
  });
}

export function removeWaypointById(
  waypoints: readonly Waypoint[],
  id: string,
): Waypoint[] {
  return waypoints.filter((waypoint) => waypoint.id !== id);
}
