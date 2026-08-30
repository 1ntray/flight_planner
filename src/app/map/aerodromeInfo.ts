import type { AeronauticalPointFeature, Waypoint } from '../../domain';

/**
 * Returns a display-only aerodrome feature for an anchored route waypoint.
 * The waypoint's stored WGS84 coordinate is deliberately retained: a saved
 * plan must not move when a later aeronautical dataset changes the feature.
 */
export function aerodromeInfoFeatureFromWaypoint(
  waypoint: Waypoint,
): AeronauticalPointFeature | null {
  const anchor = waypoint.anchor;
  if (anchor?.feature.featureKind !== 'aerodrome') {
    return null;
  }

  return {
    geometryType: 'point',
    pointKind: 'aerodrome',
    ref: anchor.feature,
    identifier: anchor.publishedIdentifier,
    ...(anchor.publishedName === undefined ? {} : { name: anchor.publishedName }),
    suggestedWaypointName: waypoint.name,
    position: waypoint.position,
  };
}
