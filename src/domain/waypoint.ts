import type { Position } from './position';
import type { AeronauticalFeatureRef } from './aeronautical';

export interface AeronauticalWaypointAnchor {
  readonly kind: 'aeronautical-feature';
  readonly feature: AeronauticalFeatureRef;
  readonly publishedIdentifier: string;
  readonly publishedName?: string;
}

export interface Waypoint {
  id: string;
  name: string;
  position: Position;
  /** Present while this waypoint remains fixed to a published feature. */
  anchor?: AeronauticalWaypointAnchor;
}
