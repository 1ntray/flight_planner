import type { Waypoint } from './waypoint';

export interface FlightPlan {
  waypoints: readonly Waypoint[];
}

