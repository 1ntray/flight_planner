import type { FlightPlan } from './flightPlan';
import type {
  AircraftPerformancePlanInputs,
  AircraftPerformanceProfile,
} from './aircraftPerformance';
import type { NavigationPlanInputs } from './navigation';
import type { RoutePlanningInputs } from './navigation';

export const LEGACY_FLIGHT_PLANNING_DOCUMENT_SCHEMA_VERSION = 1 as const;
export const FLIGHT_PLANNING_DOCUMENT_SCHEMA_VERSION = 2 as const;

export interface FlightPlanningDocumentV1 {
  readonly schemaVersion: typeof LEGACY_FLIGHT_PLANNING_DOCUMENT_SCHEMA_VERSION;
  readonly flightPlan: FlightPlan;
  readonly planningInputs: NavigationPlanInputs;
  readonly useForecastWinds: boolean;
}

export interface FlightPlanningDocumentV2 {
  readonly schemaVersion: typeof FLIGHT_PLANNING_DOCUMENT_SCHEMA_VERSION;
  readonly flightPlan: FlightPlan;
  readonly planningInputs: RoutePlanningInputs;
  readonly aircraftPerformanceProfile: AircraftPerformanceProfile;
  readonly performanceInputs: AircraftPerformancePlanInputs | null;
  readonly useForecastWinds: boolean;
}

export type FlightPlanningDocument = FlightPlanningDocumentV2;
