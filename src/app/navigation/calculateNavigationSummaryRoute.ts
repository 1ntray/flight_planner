import {
  calculateNavigationRoute,
} from '../../calculations';
import type {
  CalculatedNavigationRoute,
  LegWindOverride,
} from '../../calculations';
import type { FlightPlan, NavigationPlanInputs } from '../../domain';

export interface CalculateNavigationSummaryRouteInput {
  flightPlan: FlightPlan;
  planning: NavigationPlanInputs | null;
  forecastWinds: readonly LegWindOverride[];
  performancePlanActive: boolean;
}

/**
 * Calculates the one-row-per-leg navigation summary.
 *
 * A performance forecast can contain several position/altitude/time samples
 * for the same waypoint leg. Those samples belong to the performance wind
 * resolver and cannot be passed to the summary route's one-override-per-leg
 * interface.
 */
export function calculateNavigationSummaryRoute({
  flightPlan,
  planning,
  forecastWinds,
  performancePlanActive,
}: CalculateNavigationSummaryRouteInput): CalculatedNavigationRoute {
  return calculateNavigationRoute({
    flightPlan,
    planning,
    legWinds: performancePlanActive ? [] : forecastWinds,
  });
}

