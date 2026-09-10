export type RunwayOperationKind = 'takeoff' | 'landing';

export interface ManualSurfaceWind {
  /** Meteorological true direction from which the wind blows. */
  readonly directionFromTrueDeg: number;
  readonly speedKt: number;
  readonly gustKt?: number;
}

/** Stable route identity for one end of one derived flight-plan sector. */
export interface RunwayPerformanceOperationInput {
  readonly kind: RunwayOperationKind;
  readonly sectorFromWaypointId: string;
  readonly sectorToWaypointId: string;
  readonly aerodromeWaypointId: string;
  readonly runwayDesignator?: string;
  readonly runwayCondition?: string;
  readonly rcc?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /** Used only when the airport weather wind source is Manual. */
  readonly manualSurfaceWind?: ManualSurfaceWind;
  /** Used only when the airport weather temperature source is Manual. */
  readonly manualOatC?: number;
}

export interface RunwayPerformancePlanInputs {
  readonly personalCrosswindLimitKt: number;
  readonly instructor: boolean;
  readonly operations: readonly RunwayPerformanceOperationInput[];
}

export interface AircraftRunwayPerformanceProfile {
  readonly kind: 'z242l-utsa-v1';
  readonly revision: 1;
}

export function runwayOperationKey(
  kind: RunwayOperationKind,
  sectorFromWaypointId: string,
  sectorToWaypointId: string,
): string {
  return `${kind}:${sectorFromWaypointId}:${sectorToWaypointId}`;
}
