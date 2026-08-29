import { MAX_WAYPOINT_NAME_LENGTH } from '../../domain';
import type {
  AeronauticalPointFeature,
  AeronauticalWaypointAnchor,
  Position,
  Waypoint,
} from '../../domain';
import { getNextWaypointName } from './waypointNaming';

export { MAX_WAYPOINT_NAME_LENGTH };

function normalizeWaypointName(name: string): string {
  const normalizedName = name.trim();

  if (normalizedName === '') {
    throw new RangeError('Waypoint name must not be empty');
  }

  if (normalizedName.length > MAX_WAYPOINT_NAME_LENGTH) {
    throw new RangeError(
      `Waypoint name must not exceed ${MAX_WAYPOINT_NAME_LENGTH} characters`,
    );
  }

  return normalizedName;
}

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
  assertPointFeatureCanAnchorWaypoint(feature);

  const waypointName = normalizeWaypointName(feature.suggestedWaypointName);

  return [
    ...waypoints,
    {
      id,
      name: waypointName,
      position: { ...feature.position },
      anchor: createAeronauticalWaypointAnchor(feature),
    },
  ];
}

function assertPointFeatureCanAnchorWaypoint(
  feature: AeronauticalPointFeature,
): void {
  if (feature.ref.featureKind !== feature.pointKind) {
    throw new RangeError('Aeronautical point kind must match its feature reference');
  }
}

function createAeronauticalWaypointAnchor(
  feature: AeronauticalPointFeature,
): AeronauticalWaypointAnchor {
  return {
    kind: 'aeronautical-feature',
    feature: {
      ...feature.ref,
      dataset: { ...feature.ref.dataset },
    },
    publishedIdentifier: feature.identifier,
    ...(feature.name === undefined
      ? {}
      : { publishedName: feature.name }),
  };
}

/**
 * Anchors an existing free route waypoint without changing its route identity
 * or user-facing label. The published WGS84 coordinate and compact provenance
 * become the route's stored snapshot.
 */
export function attachWaypointToAeronauticalFeature(
  waypoints: readonly Waypoint[],
  id: string,
  feature: AeronauticalPointFeature,
): Waypoint[] {
  assertPointFeatureCanAnchorWaypoint(feature);

  const waypoint = waypoints.find((candidate) => candidate.id === id);

  if (waypoint === undefined) {
    throw new RangeError(`Waypoint ${id} does not exist`);
  }

  if (waypoint.anchor !== undefined) {
    throw new RangeError('Anchored waypoint must be detached before attaching');
  }

  return waypoints.map((candidate) =>
    candidate.id === id
      ? {
          ...candidate,
          position: { ...feature.position },
          anchor: createAeronauticalWaypointAnchor(feature),
        }
      : candidate,
  );
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

export function renameWaypointById(
  waypoints: readonly Waypoint[],
  id: string,
  name: string,
): Waypoint[] {
  const waypoint = waypoints.find((candidate) => candidate.id === id);

  if (waypoint === undefined) {
    throw new RangeError(`Waypoint ${id} does not exist`);
  }

  const normalizedName = normalizeWaypointName(name);

  if (waypoint.name === normalizedName) {
    return waypoints.slice();
  }

  return waypoints.map((candidate) =>
    candidate.id === id
      ? { ...candidate, name: normalizedName }
      : candidate,
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
