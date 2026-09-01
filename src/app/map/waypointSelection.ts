import { deriveFlightPlanSectors } from '../../calculations';
import type { FlightPlan, Waypoint } from '../../domain';

export interface SharedPositionWaypointUse {
  readonly id: string;
  readonly name: string;
}

export type WaypointSectorRole = 'departure' | 'arrival' | 'enroute';

export interface WaypointSectorContext {
  readonly sectorIndex: number;
  readonly departureName: string;
  readonly destinationName: string;
  readonly role: WaypointSectorRole;
}

/**
 * Exact stored coordinates are intentional here: shared route points are
 * created through anchoring or snapping, both of which commit one canonical
 * WGS84 position. Nearby, independently planned points remain separate.
 */
export function getSharedPositionWaypointUses(
  flightPlan: FlightPlan,
  waypoint: Waypoint,
): SharedPositionWaypointUse[] {
  return flightPlan.waypoints
    .filter(
      (candidate) =>
        candidate.position.latitude === waypoint.position.latitude &&
        candidate.position.longitude === waypoint.position.longitude,
    )
    .map(({ id, name }) => ({ id, name }));
}

/** Returns every derived flight sector containing this particular occurrence. */
export function getWaypointSectorContexts(
  flightPlan: FlightPlan,
  waypointId: string,
): WaypointSectorContext[] {
  return deriveFlightPlanSectors(flightPlan).flatMap((sector) => {
    const sectorWaypoints = sector.flightPlan.waypoints;
    const occurrenceIndex = sectorWaypoints.findIndex(
      (waypoint) => waypoint.id === waypointId,
    );
    if (occurrenceIndex < 0) return [];

    return [{
      sectorIndex: sector.sectorIndex,
      departureName: sectorWaypoints[0]!.name,
      destinationName: sectorWaypoints.at(-1)!.name,
      role:
        occurrenceIndex === 0
          ? 'departure'
          : occurrenceIndex === sectorWaypoints.length - 1
            ? 'arrival'
            : 'enroute',
    }];
  });
}
