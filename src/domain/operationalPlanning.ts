import type { AerodromePlanningWeather } from './aircraftPerformance';
import type { Waypoint } from './waypoint';

export type FuelTankKind = 'main' | 'auxiliary';

export interface FuelTankDefinition {
  readonly usableCapacityLitres: number;
  readonly armM: number;
}

export interface AircraftFuelSystemDefinition {
  readonly densityKgPerLitre: number;
  readonly main: FuelTankDefinition;
  readonly auxiliary: FuelTankDefinition;
  /** Fuel is drawn in this order for ground and airborne consumption. */
  readonly consumptionOrder: readonly ['auxiliary', 'main'];
  readonly groundDepartureAllowance: {
    readonly fuelLitres: number;
    /** Planning-time equivalent used only in the OFP fuel-requirements table. */
    readonly planningTimeMinutes: number;
  };
  readonly reserveFuelFlowLph: number;
}

export interface AircraftWeightBalanceDefinition {
  readonly basicEmptyMassKg: number;
  readonly basicEmptyMomentKgm: number;
  readonly leftSeatArmM: number;
  readonly rightSeatArmM: number;
  readonly baggageArmM: number;
  readonly maximumBaggageMassKg: number;
  readonly maximumTakeoffMassKg: number;
  readonly maximumLandingMassKg: number;
}

export type IntermediateOperationKind = 'touch-and-go' | 'full-stop';

export interface SectorOperationPlan {
  readonly waypointId: string;
  readonly kind: IntermediateOperationKind;
  /** Total fuel before the next ground allowance. Blank means carry arrival fuel forward. */
  readonly departureFuelOnboardLitres?: number;
}

export interface AlternatePlanningInputs {
  /** The primary destination is derived as FROM; this is the alternate TO snapshot. */
  readonly waypoint: Waypoint;
  readonly elevationFtMsl: number;
  readonly weather: AerodromePlanningWeather;
  readonly altitudeFtMsl: number;
}

export interface OperationalPlanningInputs {
  /** Ramp/block fuel before the first 7 L ground allowance. */
  readonly fuelOnboardLitres: number;
  readonly leftSeatMassKg: number;
  readonly rightSeatMassKg: number;
  readonly baggageMassKg: number;
  readonly extraFuelLitres: number;
  readonly finalReserveMinutes: number;
  readonly sectorOperations: readonly SectorOperationPlan[];
  readonly alternate: AlternatePlanningInputs | null;
}

