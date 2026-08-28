import type { FlightPlan } from '../domain';

export interface FlightPlanSector {
  readonly sectorIndex: number;
  readonly fromWaypointId: string;
  readonly toWaypointId: string;
  readonly waypointStartIndex: number;
  readonly waypointEndIndex: number;
  readonly flightPlan: FlightPlan;
}

export function deriveFlightPlanSectors(
  flightPlan: FlightPlan,
): FlightPlanSector[] {
  if (flightPlan.waypoints.length < 2) {
    return [];
  }

  const boundaryIds = new Set<string>();

  for (const waypointId of flightPlan.sectorBoundaryWaypointIds ?? []) {
    if (boundaryIds.has(waypointId)) {
      throw new RangeError(`Duplicate sector boundary waypoint ${waypointId}`);
    }

    const waypointIndex = flightPlan.waypoints.findIndex(
      (waypoint) => waypoint.id === waypointId,
    );

    if (waypointIndex <= 0 || waypointIndex >= flightPlan.waypoints.length - 1) {
      throw new RangeError(
        `Sector boundary ${waypointId} must identify an intermediate waypoint`,
      );
    }
    boundaryIds.add(waypointId);
  }

  const boundaryIndexes = flightPlan.waypoints
    .map((waypoint, index) => boundaryIds.has(waypoint.id) ? index : null)
    .filter((index): index is number => index !== null);
  const endpoints = [0, ...boundaryIndexes, flightPlan.waypoints.length - 1];

  return endpoints.slice(1).map((waypointEndIndex, sectorIndex) => {
    const waypointStartIndex = endpoints[sectorIndex]!;
    const waypoints = flightPlan.waypoints.slice(
      waypointStartIndex,
      waypointEndIndex + 1,
    );
    const waypointIds = new Set(waypoints.map((waypoint) => waypoint.id));

    return {
      sectorIndex,
      fromWaypointId: waypoints[0]!.id,
      toWaypointId: waypoints.at(-1)!.id,
      waypointStartIndex,
      waypointEndIndex,
      flightPlan: {
        waypoints,
        legShapes: flightPlan.legShapes.filter(
          (shape) =>
            waypointIds.has(shape.fromWaypointId) &&
            waypointIds.has(shape.toWaypointId),
        ),
        sectorBoundaryWaypointIds: [],
      },
    };
  });
}
