import type { AeronauticalPointFeature, Position } from '../../domain';

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
