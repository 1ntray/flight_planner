import type { Position } from './position';

export type FlightPhase = 'climb' | 'cruise' | 'descent';

export interface AircraftPerformanceProfile {
  readonly profileId: string;
  readonly revision: number;
  readonly climbIasKt: number;
  readonly cruiseIasKt: number;
  readonly descentIasKt: number;
  readonly climbFuelFlowLph: number;
  readonly cruiseFuelFlowLph: number;
  readonly descentFuelFlowLph: number;
  readonly descentRateFtPerMin: number;
}

export interface AerodromePlanningWeather {
  readonly qnhHpa: number;
  readonly isaDeviationC: number;
}

export interface PlanningEnvironment {
  readonly qnhHpa: number;
  readonly isaDeviationC: number;
}

export type AltitudeTargetPlacement =
  | { readonly mode: 'automatic' }
  | {
      readonly mode: 'distance-along-leg';
      readonly distanceFromStartNm: number;
    };

export interface LegAltitudePlan {
  readonly fromWaypointId: string;
  readonly toWaypointId: string;
  /** Overrides the route-wide altitude for this real-waypoint leg. */
  readonly altitudeFtMsl?: number;
  /** Where the requested altitude must have been attained. */
  readonly targetPlacement?: AltitudeTargetPlacement;
}

export interface AircraftPerformancePlanInputs {
  readonly massKg: number;
  readonly defaultAltitudeFtMsl: number;
  readonly departureElevationFtMsl: number;
  readonly destinationElevationFtMsl: number;
  readonly patternHeightAglFt: number;
  readonly departureWeather: AerodromePlanningWeather;
  readonly destinationWeather: AerodromePlanningWeather;
  readonly legAltitudePlans: readonly LegAltitudePlan[];
}

export interface WindSampleQuery {
  readonly fromWaypointId: string;
  readonly toWaypointId: string;
  readonly position: Position;
  readonly altitudeFtMsl: number;
  readonly timeUtcMs: number;
}

