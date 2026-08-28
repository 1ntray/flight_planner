import type { Waypoint } from './waypoint';
import type { LegShape } from './routeShape';

export interface FlightPlan {
  waypoints: readonly Waypoint[];
  legShapes: readonly LegShape[];
  /** Intermediate real waypoints at which one flight sector ends and another begins. */
  sectorBoundaryWaypointIds?: readonly string[];
}
