import type { Position } from './position';
import type {
  AircraftFuelSystemDefinition,
  AircraftWeightBalanceDefinition,
} from './operationalPlanning';

/**
 * Defensive limit for user-entered planning altitudes. This is not an
 * operational limitation for a particular aircraft; it bounds the current
 * atmosphere/performance model and prevents accidental enormous integrations.
 */
export const MAX_SUPPORTED_PLANNING_ALTITUDE_FT = 60_000;

export type FlightPhase = 'climb' | 'cruise' | 'descent';

export interface EffectiveAltitudeLinearMassClimbRateModel {
  readonly kind: 'effective-altitude-linear-mass';
  readonly isaAltitudeFactorFtPerC: number;
  readonly referenceMassKg: number;
  readonly baseRateFtPerMin: number;
  readonly altitudeCoefficientPerFt: number;
  readonly massCoefficientPerKg: number;
  readonly altitudeMassCoefficientPerFtKg: number;
}

/**
 * Discriminated so a future aircraft can use a different published model
 * without changing the route integration API.
 */
export type ClimbRateModel = EffectiveAltitudeLinearMassClimbRateModel;

export interface AircraftPerformanceProfile {
  readonly climb: {
    readonly iasKt: number;
    readonly fuelFlowLph: number;
    readonly rateModel: ClimbRateModel;
  };
  readonly cruise: {
    readonly iasKt: number;
    readonly fuelFlowLph: number;
  };
  readonly descent: {
    readonly iasKt: number;
    readonly fuelFlowLph: number;
    readonly rateFtPerMin: number;
  };
}

export interface AircraftDefinition {
  readonly aircraftId: string;
  readonly revision: number;
  readonly displayName: string;
  readonly registration?: string;
  readonly performance: AircraftPerformanceProfile;
  /** Optional for legacy/custom snapshots that predate operational planning. */
  readonly fuelSystem?: AircraftFuelSystemDefinition;
  /** Optional for legacy/custom snapshots that predate operational planning. */
  readonly weightBalance?: AircraftWeightBalanceDefinition;
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
  /**
   * Optional altitude to attain later on the same leg. This permits a climb
   * to the planned level followed by a descent to the TO waypoint without
   * introducing a real or shaping waypoint.
   */
  readonly endAltitudeFtMsl?: number;
  /** Where the optional end altitude must have been attained. */
  readonly endTargetPlacement?: AltitudeTargetPlacement;
}

export interface SectorStopPlan {
  readonly waypointId: string;
  readonly elevationFtMsl: number;
  readonly weather: AerodromePlanningWeather;
  /** Ground time after the preceding sector arrives. If omitted, the stop is instantaneous. */
  readonly stopDurationMinutes?: number;
  /**
   * Compatibility with schema version 4. New plans use stopDurationMinutes.
   * If both are absent, the onward sector starts at the preceding arrival.
   */
  readonly onwardDepartureTimeUtcMs?: number;
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
  readonly sectorStopPlans?: readonly SectorStopPlan[];
}

export interface WindSampleQuery {
  readonly fromWaypointId: string;
  readonly toWaypointId: string;
  readonly position: Position;
  readonly altitudeFtMsl: number;
  readonly timeUtcMs: number;
}
