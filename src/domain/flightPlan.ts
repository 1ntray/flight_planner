import type { Waypoint } from './waypoint';
import type { LegShape } from './routeShape';

export interface FlightPlan {
  waypoints: readonly Waypoint[];
  legShapes: readonly LegShape[];
}
