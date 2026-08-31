import type { AeronauticalFeatureRef } from './aeronautical';
import type { Position } from './position';

/**
 * Provenance for a geometry-only point snapped to a published VFR reporting
 * point. It is deliberately distinct from a real waypoint anchor.
 */
export interface ReportingPointShapingAnchor {
  readonly kind: 'aeronautical-reporting-point';
  readonly feature: AeronauticalFeatureRef;
  readonly publishedIdentifier: string;
  readonly publishedName?: string;
}

export interface RouteShapingPoint {
  id: string;
  position: Position;
  /** Present while this geometry point follows a reporting-point snapshot. */
  anchor?: ReportingPointShapingAnchor;
}

export interface LegShape {
  fromWaypointId: string;
  toWaypointId: string;
  points: readonly RouteShapingPoint[];
}
