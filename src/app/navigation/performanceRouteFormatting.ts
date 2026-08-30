import type { CalculatedPerformanceRouteNoSolution } from '../../calculations';
import type { FlightPlan } from '../../domain';

function waypointName(flightPlan: FlightPlan, waypointId: string): string {
  return flightPlan.waypoints.find((waypoint) => waypoint.id === waypointId)
    ?.name ?? waypointId;
}

/**
 * Calculation results retain stable waypoint IDs. Resolve them to the current
 * user-facing waypoint names only at the UI boundary.
 */
export function formatPerformanceRouteFailureLeg(
  flightPlan: FlightPlan,
  failure: CalculatedPerformanceRouteNoSolution,
): string {
  return `${waypointName(flightPlan, failure.legFromId)} → ${waypointName(
    flightPlan,
    failure.legToId,
  )}`;
}
