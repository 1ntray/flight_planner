import { deriveFlightPlanSectors } from '../../calculations';
import { runwayOperationKey } from '../../domain';
import type { FlightPlan, RunwayOperationKind } from '../../domain';

export interface AirportOperationContext {
  readonly key: string;
  readonly kind: RunwayOperationKind;
  readonly sectorFromWaypointId: string;
  readonly sectorToWaypointId: string;
  readonly waypointId: string;
}

export interface AirportStopContext {
  readonly key: string;
  readonly waypointId: string;
  readonly name: string;
  readonly role: 'departure' | 'stop' | 'destination';
  readonly operations: readonly AirportOperationContext[];
}

/**
 * Presents each route airport once while preserving the separate stable
 * takeoff and landing operation identities required by runway calculations.
 */
export function deriveAirportStops(
  flightPlan: FlightPlan,
): readonly AirportStopContext[] {
  const sectors = deriveFlightPlanSectors(flightPlan);
  const stops: AirportStopContext[] = [];

  const appendOperation = (
    waypointId: string,
    name: string,
    role: AirportStopContext['role'],
    operation: AirportOperationContext,
  ) => {
    const existing = stops.at(-1);
    if (existing?.waypointId === waypointId) {
      stops[stops.length - 1] = {
        ...existing,
        role: 'stop',
        operations: [...existing.operations, operation],
      };
      return;
    }
    stops.push({ key: waypointId, waypointId, name, role, operations: [operation] });
  };

  sectors.forEach((sector, index) => {
    const from = sector.flightPlan.waypoints[0]!;
    const to = sector.flightPlan.waypoints.at(-1)!;
    appendOperation(from.id, from.name, index === 0 ? 'departure' : 'stop', {
      key: runwayOperationKey('takeoff', from.id, to.id),
      kind: 'takeoff',
      sectorFromWaypointId: from.id,
      sectorToWaypointId: to.id,
      waypointId: from.id,
    });
    appendOperation(
      to.id,
      to.name,
      index === sectors.length - 1 ? 'destination' : 'stop',
      {
        key: runwayOperationKey('landing', from.id, to.id),
        kind: 'landing',
        sectorFromWaypointId: from.id,
        sectorToWaypointId: to.id,
        waypointId: to.id,
      },
    );
  });

  return stops;
}
