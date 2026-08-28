import type { FlightPlan } from './flightPlan';
import type {
  AircraftDefinition,
  AircraftPerformancePlanInputs,
} from './aircraftPerformance';
import type { NavigationPlanInputs } from './navigation';
import type { RoutePlanningInputs } from './navigation';

export const LEGACY_FLIGHT_PLANNING_DOCUMENT_SCHEMA_VERSION = 1 as const;
export const LEGACY_AIRCRAFT_PROFILE_DOCUMENT_SCHEMA_VERSION = 2 as const;
export const FLIGHT_PLANNING_DOCUMENT_SCHEMA_VERSION = 3 as const;

export interface LegacyAircraftPerformanceProfileV2 {
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

export interface FlightPlanningDocumentV1 {
  readonly schemaVersion: typeof LEGACY_FLIGHT_PLANNING_DOCUMENT_SCHEMA_VERSION;
  readonly flightPlan: FlightPlan;
  readonly planningInputs: NavigationPlanInputs;
  readonly useForecastWinds: boolean;
}

export interface FlightPlanningDocumentV2 {
  readonly schemaVersion: typeof LEGACY_AIRCRAFT_PROFILE_DOCUMENT_SCHEMA_VERSION;
  readonly flightPlan: FlightPlan;
  readonly planningInputs: RoutePlanningInputs;
  readonly aircraftPerformanceProfile: LegacyAircraftPerformanceProfileV2;
  readonly performanceInputs: AircraftPerformancePlanInputs | null;
  readonly useForecastWinds: boolean;
}

export interface FlightPlanningDocumentV3 {
  readonly schemaVersion: typeof FLIGHT_PLANNING_DOCUMENT_SCHEMA_VERSION;
  readonly flightPlan: FlightPlan;
  readonly planningInputs: RoutePlanningInputs;
  /** Immutable snapshot used by this saved plan. */
  readonly aircraftDefinition: AircraftDefinition;
  readonly performanceInputs: AircraftPerformancePlanInputs | null;
  readonly useForecastWinds: boolean;
}

export type FlightPlanningDocument = FlightPlanningDocumentV3;
