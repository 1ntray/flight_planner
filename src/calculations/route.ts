import type { CalculatedLeg, FlightPlan, Waypoint } from '../domain';
import { calculateInverseGeodesic } from './geodesy';

export function calculateLeg(from: Waypoint, to: Waypoint): CalculatedLeg {
  const geodesic = calculateInverseGeodesic(from.position, to.position);

  return {
    fromId: from.id,
    toId: to.id,
    distanceNm: geodesic.distanceNm,
    trueTrackDeg: geodesic.trueTrackDeg,
  };
}

export function calculateFlightPlanLegs(
  flightPlan: FlightPlan,
): CalculatedLeg[] {
  return calculateRoute(flightPlan.waypoints);
}

export function calculateRoute(
  waypoints: readonly Waypoint[],
): CalculatedLeg[] {
  return waypoints.slice(1).map((to, index) => {
    const from = waypoints[index];

    if (from === undefined) {
      throw new Error('A calculated leg must have a starting waypoint');
    }

    return calculateLeg(from, to);
  });
}
