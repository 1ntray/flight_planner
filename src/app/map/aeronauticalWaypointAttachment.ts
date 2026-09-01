import type { AeronauticalPointFeature, Position, Waypoint } from '../../domain';

/**
 * Display-only hit radius for dropping a free waypoint onto a visible
 * aeronautical point. The committed route coordinate is always the feature's
 * published WGS84 position, never this screen-space value.
 */
export const AERONAUTICAL_WAYPOINT_ATTACH_RADIUS_PIXELS = 24;

export interface ContainerPoint {
  readonly x: number;
  readonly y: number;
}

export function findAeronauticalWaypointAttachmentTarget(
  dropPosition: Position,
  features: readonly AeronauticalPointFeature[],
  toContainerPoint: (position: Position) => ContainerPoint,
  radiusPixels = AERONAUTICAL_WAYPOINT_ATTACH_RADIUS_PIXELS,
): AeronauticalPointFeature | null {
  const dropPoint = toContainerPoint(dropPosition);
  const maximumDistanceSquared = radiusPixels ** 2;
  let nearestFeature: AeronauticalPointFeature | null = null;
  let nearestDistanceSquared = maximumDistanceSquared;

  for (const feature of features) {
    const featurePoint = toContainerPoint(feature.position);
    const distanceSquared =
      (featurePoint.x - dropPoint.x) ** 2 +
      (featurePoint.y - dropPoint.y) ** 2;

    if (distanceSquared <= nearestDistanceSquared) {
      nearestFeature = feature;
      nearestDistanceSquared = distanceSquared;
    }
  }

  return nearestFeature;
}

/**
 * Finds the nearest other real route waypoint within the same display-only
 * attachment radius. The caller commits the target's stored WGS84 coordinate;
 * the screen-space distance never becomes route data.
 */
export function findRouteWaypointSnapTarget(
  dropPosition: Position,
  waypoints: readonly Waypoint[],
  excludedWaypointId: string,
  toContainerPoint: (position: Position) => ContainerPoint,
  radiusPixels = AERONAUTICAL_WAYPOINT_ATTACH_RADIUS_PIXELS,
): Waypoint | null {
  const dropPoint = toContainerPoint(dropPosition);
  const maximumDistanceSquared = radiusPixels ** 2;
  let nearestWaypoint: Waypoint | null = null;
  let nearestDistanceSquared = maximumDistanceSquared;

  for (const waypoint of waypoints) {
    if (waypoint.id === excludedWaypointId) continue;

    const waypointPoint = toContainerPoint(waypoint.position);
    const distanceSquared =
      (waypointPoint.x - dropPoint.x) ** 2 +
      (waypointPoint.y - dropPoint.y) ** 2;

    if (distanceSquared <= nearestDistanceSquared) {
      nearestWaypoint = waypoint;
      nearestDistanceSquared = distanceSquared;
    }
  }

  return nearestWaypoint;
}

/**
 * Shaping points may use published reporting points as geometry anchors, but
 * must not silently attach to aerodromes, navaids, or designated points.
 */
export function findReportingPointShapingAttachmentTarget(
  dropPosition: Position,
  features: readonly AeronauticalPointFeature[],
  toContainerPoint: (position: Position) => ContainerPoint,
  radiusPixels = AERONAUTICAL_WAYPOINT_ATTACH_RADIUS_PIXELS,
): AeronauticalPointFeature | null {
  return findAeronauticalWaypointAttachmentTarget(
    dropPosition,
    features.filter((feature) => feature.pointKind === 'reporting-point'),
    toContainerPoint,
    radiusPixels,
  );
}
