import type {
  AircraftDefinition,
  AircraftFuelSystemDefinition,
  AircraftPerformancePlanInputs,
  AircraftWeightBalanceDefinition,
  FlightPlan,
  OperationalPlanningInputs,
  RoutePlanningInputs,
} from '../domain';
import { deriveFlightPlanSectors } from './flightSectors';
import { calculatePerformanceRoute } from './performanceRoute';
import type {
  CalculatedPerformanceLeg,
  CalculatedPerformanceRoute,
  CalculatedPerformanceRouteNoSolution,
  CalculatedPerformanceRouteSuccess,
  CalculatedPerformanceSector,
  WindResolver,
} from './performanceRoute';

const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const MASS_CONVERGENCE_TOLERANCE_KG = 1e-7;
const MAX_MASS_CONVERGENCE_ITERATIONS = 12;
const FUEL_TOLERANCE_LITRES = 1e-9;

function patternArrivalDelaySeconds(
  operational: OperationalPlanningInputs,
): Readonly<Record<string, number>> {
  return Object.fromEntries(
    (operational.patternPlans ?? [])
      .filter((plan) => plan.patternCount > 0)
      .map((plan) => [plan.waypointId, plan.patternCount * 5 * SECONDS_PER_MINUTE]),
  );
}

export interface CalculatedTankFuel {
  readonly mainLitres: number;
  readonly auxiliaryLitres: number;
  readonly totalLitres: number;
}

export interface CalculatedLoadingState {
  readonly totalMassKg: number;
  readonly totalMomentKgm: number;
  readonly armM: number;
  readonly fuel: CalculatedTankFuel;
  readonly fuelMassKg: number;
  readonly fuelMomentKgm: number;
}

export interface CalculatedOfpProgressValue {
  readonly distanceNm: number;
  readonly airborneSeconds: number;
  readonly airborneFuelLitres: number;
}

export interface CalculatedOfpLegRow {
  readonly leg: CalculatedPerformanceLeg;
  readonly intermediate: CalculatedOfpProgressValue;
  readonly accumulated: CalculatedOfpProgressValue;
  readonly estimatedFuelRemainingLitres: number;
}

/**
 * Derived OFP-only row for planned visual circuits after a sector arrival.
 * It deliberately does not create a real route leg or waypoint.
 */
export interface CalculatedOfpPatternRow {
  readonly airportWaypointId: string;
  readonly patternCount: number;
  readonly patternAltitudeFtMsl: number;
  readonly fuelFlowLph: number;
  readonly intermediate: CalculatedOfpProgressValue;
  readonly accumulated: CalculatedOfpProgressValue;
  readonly estimatedFuelRemainingLitres: number;
}

export interface CalculatedFuelRequirementLine {
  readonly litres: number;
  readonly kilograms: number;
  readonly timeMinutes: number;
}

export type CalculatedMinimumFlight =
  | {
      readonly status: 'not-required';
      readonly timeMinutes: 0;
      readonly requiredFuelRemainingLitres: null;
    }
  | {
      readonly status: 'reachable';
      readonly timeMinutes: number;
      readonly requiredFuelRemainingLitres: number;
    }
  | {
      readonly status: 'not-reached';
      readonly timeMinutes: null;
      readonly requiredFuelRemainingLitres: number | null;
    };

export type OperationalWarningCode =
  | 'insufficient-fuel'
  | 'maximum-takeoff-mass-exceeded'
  | 'maximum-landing-mass-exceeded'
  | 'minimum-landing-mass-not-reached';

export interface OperationalWarning {
  readonly code: OperationalWarningCode;
  readonly sectorIndex: number;
  readonly message: string;
}

export interface CalculatedSectorOperationalFlightPlan {
  readonly sectorIndex: number;
  readonly fromWaypointId: string;
  readonly toWaypointId: string;
  readonly rows: readonly CalculatedOfpLegRow[];
  readonly patternRow: CalculatedOfpPatternRow | null;
  readonly intermediateTotal: CalculatedOfpProgressValue;
  readonly accumulatedTotal: CalculatedOfpProgressValue;
  readonly fuelOnboardBeforeDepartureLitres: number;
  readonly fuelAtTakeoffLitres: number;
  readonly fuelAtLandingLitres: number;
  readonly groundAllowanceApplied: boolean;
  readonly takeoffLoading: CalculatedLoadingState;
  readonly landingLoading: CalculatedLoadingState;
  readonly tripFuel: CalculatedFuelRequirementLine;
  readonly alternateFuel: CalculatedFuelRequirementLine;
  readonly extraFuel: CalculatedFuelRequirementLine;
  readonly finalReserve: CalculatedFuelRequirementLine;
  readonly totalFuelRequired: CalculatedFuelRequirementLine;
  readonly enduranceMinutes: number;
  readonly minimumFlight: CalculatedMinimumFlight;
  readonly warnings: readonly OperationalWarning[];
}

export interface CalculatedOperationalFlightPlanSuccess {
  readonly status: 'ok';
  readonly performanceRoute: CalculatedPerformanceRouteSuccess;
  readonly sectors: readonly CalculatedSectorOperationalFlightPlan[];
  readonly warnings: readonly OperationalWarning[];
}

export interface CalculatedOperationalFlightPlanNoSolution {
  readonly status: 'no-solution';
  readonly reason:
    | 'aircraft-operational-definition-missing'
    | 'invalid-operational-input'
    | 'insufficient-fuel'
    | 'main-performance-no-solution';
  readonly message: string;
  readonly performanceFailure?: CalculatedPerformanceRouteNoSolution;
}

export type CalculatedOperationalFlightPlan =
  | CalculatedOperationalFlightPlanSuccess
  | CalculatedOperationalFlightPlanNoSolution;

export interface OperationalFlightPlanCalculationInput {
  readonly flightPlan: FlightPlan;
  readonly navigation: RoutePlanningInputs;
  readonly performance: AircraftPerformancePlanInputs;
  readonly aircraft: AircraftDefinition;
  readonly operational: OperationalPlanningInputs;
  readonly resolveWind?: WindResolver;
}

interface OperationalProjection {
  readonly sectors: readonly CalculatedSectorOperationalFlightPlan[];
  readonly sectorTakeoffMassesKg: readonly number[];
  readonly finalLandingLoading: CalculatedLoadingState;
  readonly warnings: readonly OperationalWarning[];
}

function requireFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a finite non-negative number`);
  }
}

function totalUsableFuelLitres(system: AircraftFuelSystemDefinition): number {
  return system.main.usableCapacityLitres + system.auxiliary.usableCapacityLitres;
}

export function allocateFuelToTanks(
  totalLitres: number,
  system: AircraftFuelSystemDefinition,
): CalculatedTankFuel {
  requireFiniteNonNegative(totalLitres, 'Fuel onboard');
  const capacity = totalUsableFuelLitres(system);

  if (totalLitres > capacity + FUEL_TOLERANCE_LITRES) {
    throw new RangeError(`Fuel onboard exceeds usable capacity of ${capacity} L`);
  }

  const mainLitres = Math.min(totalLitres, system.main.usableCapacityLitres);
  const auxiliaryLitres = Math.max(0, totalLitres - mainLitres);

  return { mainLitres, auxiliaryLitres, totalLitres };
}

export function consumeFuelFromTanks(
  fuel: CalculatedTankFuel,
  consumedLitres: number,
): CalculatedTankFuel | null {
  requireFiniteNonNegative(consumedLitres, 'Fuel consumption');

  if (consumedLitres > fuel.totalLitres + FUEL_TOLERANCE_LITRES) {
    return null;
  }

  const normalizedConsumption = Math.min(consumedLitres, fuel.totalLitres);
  const auxiliaryConsumed = Math.min(
    normalizedConsumption,
    fuel.auxiliaryLitres,
  );
  const mainConsumed = normalizedConsumption - auxiliaryConsumed;
  const auxiliaryLitres = fuel.auxiliaryLitres - auxiliaryConsumed;
  const mainLitres = fuel.mainLitres - mainConsumed;

  return {
    mainLitres,
    auxiliaryLitres,
    totalLitres: mainLitres + auxiliaryLitres,
  };
}

export function calculateLoadingState(
  fuel: CalculatedTankFuel,
  operational: OperationalPlanningInputs,
  system: AircraftFuelSystemDefinition,
  loading: AircraftWeightBalanceDefinition,
): CalculatedLoadingState {
  const mainMassKg = fuel.mainLitres * system.densityKgPerLitre;
  const auxiliaryMassKg = fuel.auxiliaryLitres * system.densityKgPerLitre;
  const fuelMassKg = mainMassKg + auxiliaryMassKg;
  const fuelMomentKgm =
    mainMassKg * system.main.armM +
    auxiliaryMassKg * system.auxiliary.armM;
  const totalMassKg =
    loading.basicEmptyMassKg +
    operational.leftSeatMassKg +
    operational.rightSeatMassKg +
    operational.baggageMassKg +
    fuelMassKg;
  const totalMomentKgm =
    loading.basicEmptyMomentKgm +
    operational.leftSeatMassKg * loading.leftSeatArmM +
    operational.rightSeatMassKg * loading.rightSeatArmM +
    operational.baggageMassKg * loading.baggageArmM +
    fuelMomentKgm;

  return {
    totalMassKg,
    totalMomentKgm,
    armM: totalMomentKgm / totalMassKg,
    fuel,
    fuelMassKg,
    fuelMomentKgm,
  };
}

export function calculateInitialTakeoffLoading(
  aircraft: AircraftDefinition,
  operational: OperationalPlanningInputs,
): CalculatedLoadingState {
  const system = aircraft.fuelSystem;
  const loading = aircraft.weightBalance;
  if (system === undefined || loading === undefined) {
    throw new RangeError(
      'The selected aircraft has no fuel-system or weight-and-balance definition',
    );
  }
  const fuel = allocateFuelToTanks(operational.fuelOnboardLitres, system);
  const takeoffFuel = consumeFuelFromTanks(
    fuel,
    system.groundDepartureAllowance.fuelLitres,
  );
  if (takeoffFuel === null) {
    throw new RangeError('Fuel onboard is insufficient for the ground allowance');
  }
  return calculateLoadingState(takeoffFuel, operational, system, loading);
}

function fuelLine(
  litres: number,
  timeMinutes: number,
  system: AircraftFuelSystemDefinition,
): CalculatedFuelRequirementLine {
  return {
    litres,
    kilograms: litres * system.densityKgPerLitre,
    timeMinutes,
  };
}

function calculateMinimumFlight(
  takeoffLoading: CalculatedLoadingState,
  sector: CalculatedPerformanceSector,
  system: AircraftFuelSystemDefinition,
  loading: AircraftWeightBalanceDefinition,
  patternRow: Pick<CalculatedOfpPatternRow, 'intermediate'> | null,
): CalculatedMinimumFlight {
  if (takeoffLoading.totalMassKg <= loading.maximumLandingMassKg) {
    return {
      status: 'not-required',
      timeMinutes: 0,
      requiredFuelRemainingLitres: null,
    };
  }

  const fuelToBurnLitres =
    (takeoffLoading.totalMassKg - loading.maximumLandingMassKg) /
    system.densityKgPerLitre;
  const requiredFuelRemainingLitres =
    takeoffLoading.fuel.totalLitres - fuelToBurnLitres;

  if (requiredFuelRemainingLitres < 0) {
    return {
      status: 'not-reached',
      timeMinutes: null,
      requiredFuelRemainingLitres: null,
    };
  }

  let consumedLitres = 0;
  let elapsedSeconds = 0;

  for (const leg of sector.legs) {
    for (const step of leg.steps) {
      if (
        step.fuelLitres > 0 &&
        consumedLitres + step.fuelLitres >= fuelToBurnLitres
      ) {
        const fraction = (fuelToBurnLitres - consumedLitres) / step.fuelLitres;
        return {
          status: 'reachable',
          timeMinutes:
            (elapsedSeconds + fraction * step.durationSeconds) /
            SECONDS_PER_MINUTE,
          requiredFuelRemainingLitres,
        };
      }

      consumedLitres += step.fuelLitres;
      elapsedSeconds += step.durationSeconds;
    }
  }

  if (
    patternRow !== null &&
    patternRow.intermediate.airborneFuelLitres > 0 &&
    consumedLitres + patternRow.intermediate.airborneFuelLitres >= fuelToBurnLitres
  ) {
    const fraction =
      (fuelToBurnLitres - consumedLitres) /
      patternRow.intermediate.airborneFuelLitres;
    return {
      status: 'reachable',
      timeMinutes:
        (elapsedSeconds + fraction * patternRow.intermediate.airborneSeconds) /
        SECONDS_PER_MINUTE,
      requiredFuelRemainingLitres,
    };
  }

  return {
    status: 'not-reached',
    timeMinutes: null,
    requiredFuelRemainingLitres,
  };
}

function validateOperationalInputs(
  operational: OperationalPlanningInputs,
  flightPlan: FlightPlan,
  system: AircraftFuelSystemDefinition,
  loading: AircraftWeightBalanceDefinition,
): string | null {
  const scalarInputs: readonly [number, string][] = [
    [operational.fuelOnboardLitres, 'Fuel onboard'],
    [operational.leftSeatMassKg, 'Left-seat mass'],
    [operational.rightSeatMassKg, 'Right-seat mass'],
    [operational.baggageMassKg, 'Baggage mass'],
    [operational.extraFuelLitres, 'Extra fuel'],
    [operational.finalReserveLitres, 'Final reserve'],
  ];

  for (const [value, label] of scalarInputs) {
    if (!Number.isFinite(value) || value < 0) {
      return `${label} must be a finite non-negative number`;
    }
  }

  const capacity = totalUsableFuelLitres(system);
  if (operational.fuelOnboardLitres > capacity) {
    return `Fuel onboard exceeds usable capacity of ${capacity} L`;
  }
  if (operational.baggageMassKg > loading.maximumBaggageMassKg) {
    return `Baggage exceeds maximum mass of ${loading.maximumBaggageMassKg} kg`;
  }

  const boundaryIds = new Set(flightPlan.sectorBoundaryWaypointIds ?? []);
  const seenOperations = new Set<string>();
  for (const operation of operational.sectorOperations) {
    if (!boundaryIds.has(operation.waypointId)) {
      return `Operation ${operation.waypointId} is not a sector boundary`;
    }
    if (seenOperations.has(operation.waypointId)) {
      return `Operation ${operation.waypointId} is duplicated`;
    }
    seenOperations.add(operation.waypointId);
    if (
      operation.kind === 'touch-and-go' &&
      operation.departureFuelOnboardLitres !== undefined
    ) {
      return 'A touch-and-go cannot contain a refuelling target';
    }
    if (operation.departureFuelOnboardLitres !== undefined) {
      if (
        !Number.isFinite(operation.departureFuelOnboardLitres) ||
        operation.departureFuelOnboardLitres < 0 ||
        operation.departureFuelOnboardLitres > capacity
      ) {
        return `Full-stop fuel onboard must be between 0 and ${capacity} L`;
      }
    }
  }

  const landingWaypointIds = new Set([
    ...boundaryIds,
    ...(flightPlan.waypoints.at(-1) === undefined
      ? []
      : [flightPlan.waypoints.at(-1)!.id]),
  ]);
  const seenPatternWaypointIds = new Set<string>();
  for (const plan of operational.patternPlans ?? []) {
    if (!landingWaypointIds.has(plan.waypointId)) {
      return `Pattern plan ${plan.waypointId} is not a route landing airport`;
    }
    if (seenPatternWaypointIds.has(plan.waypointId)) {
      return `Pattern plan ${plan.waypointId} is duplicated`;
    }
    seenPatternWaypointIds.add(plan.waypointId);
    if (!Number.isInteger(plan.patternCount) || plan.patternCount < 0) {
      return `Pattern count at ${plan.waypointId} must be a non-negative whole number`;
    }
  }

  if (operational.alternate !== null && (
    !Number.isFinite(operational.alternate.distanceNm) ||
    operational.alternate.distanceNm < 0 ||
    !Number.isFinite(operational.alternate.timeMinutes) ||
    operational.alternate.timeMinutes < 0 ||
    !Number.isFinite(operational.alternate.fuelLitres) ||
    operational.alternate.fuelLitres < 0
  )) {
    return 'Alternate distance, time, and fuel must be valid non-negative values';
  }

  return null;
}

function groundAllowanceApplies(
  sectorIndex: number,
  fromWaypointId: string,
  operationsByWaypointId: ReadonlyMap<
    string,
    OperationalPlanningInputs['sectorOperations'][number]
  >,
): boolean {
  return (
    sectorIndex === 0 ||
    operationsByWaypointId.get(fromWaypointId)?.kind === 'full-stop'
  );
}

function projectOperationalPlan(
  flightPlan: FlightPlan,
  performanceRoute: CalculatedPerformanceRouteSuccess,
  alternate: OperationalPlanningInputs['alternate'],
  aircraft: AircraftDefinition,
  operational: OperationalPlanningInputs,
): OperationalProjection | CalculatedOperationalFlightPlanNoSolution {
  const system = aircraft.fuelSystem!;
  const loading = aircraft.weightBalance!;
  const routeSectors = deriveFlightPlanSectors(flightPlan);
  const operationsByWaypointId = new Map(
    operational.sectorOperations.map((operation) => [
      operation.waypointId,
      operation,
    ]),
  );
  const patternCountsByWaypointId = new Map(
    (operational.patternPlans ?? []).map((plan) => [
      plan.waypointId,
      plan.patternCount,
    ]),
  );
  const patternFuelFlowLph = aircraft.performance.cruise.fuelFlowLph;
  const patternFuelBySector = performanceRoute.sectors.map((sector) => {
    const patternCount = patternCountsByWaypointId.get(sector.toWaypointId) ?? 0;
    return patternCount * 5 / MINUTES_PER_HOUR * patternFuelFlowLph;
  });
  const patternSecondsBySector = performanceRoute.sectors.map((sector) =>
    (patternCountsByWaypointId.get(sector.toWaypointId) ?? 0) * 5 * SECONDS_PER_MINUTE,
  );
  const groundAllowanceBySector = performanceRoute.sectors.map((sector) =>
    groundAllowanceApplies(
      sector.sectorIndex,
      sector.fromWaypointId,
      operationsByWaypointId,
    ),
  );
  const remainingAirborneFuel = new Array<number>(performanceRoute.sectors.length);
  const remainingAirborneSeconds = new Array<number>(performanceRoute.sectors.length);
  let futureFuel = 0;
  let futureSeconds = 0;

  for (let index = performanceRoute.sectors.length - 1; index >= 0; index -= 1) {
    const sector = performanceRoute.sectors[index]!;
    const arrivalOperation = operationsByWaypointId.get(sector.toWaypointId);
    if (
      arrivalOperation?.kind === 'full-stop' &&
      arrivalOperation.departureFuelOnboardLitres !== undefined
    ) {
      // This sector terminates at the refuelling airport. The fuel requirement
      // before it must therefore exclude all later sectors.
      futureFuel = 0;
      futureSeconds = 0;
    }
    futureFuel += sector.totalFuelLitres + patternFuelBySector[index]!;
    futureSeconds += sector.totalEetSeconds + patternSecondsBySector[index]!;
    remainingAirborneFuel[index] = futureFuel;
    remainingAirborneSeconds[index] = futureSeconds;
  }

  let currentFuel = allocateFuelToTanks(
    operational.fuelOnboardLitres,
    system,
  );
  let accumulatedDistanceNm = 0;
  let accumulatedAirborneSeconds = 0;
  let accumulatedAirborneFuelLitres = 0;
  const sectorTakeoffMassesKg: number[] = [];
  const sectors: CalculatedSectorOperationalFlightPlan[] = [];
  const warnings: OperationalWarning[] = [];

  for (const sector of performanceRoute.sectors) {
    const operation =
      sector.sectorIndex === 0
        ? null
        : operationsByWaypointId.get(sector.fromWaypointId) ?? {
            waypointId: sector.fromWaypointId,
            kind: 'touch-and-go' as const,
          };

    if (
      operation?.kind === 'full-stop' &&
      operation.departureFuelOnboardLitres !== undefined
    ) {
      currentFuel = allocateFuelToTanks(
        operation.departureFuelOnboardLitres,
        system,
      );
    }

    const fuelOnboardBeforeDepartureLitres = currentFuel.totalLitres;
    const groundAllowanceApplied = groundAllowanceBySector[sector.sectorIndex]!;
    if (groundAllowanceApplied) {
      const afterGround = consumeFuelFromTanks(
        currentFuel,
        system.groundDepartureAllowance.fuelLitres,
      );
      if (afterGround === null) {
        return {
          status: 'no-solution',
          reason: 'insufficient-fuel',
          message: `Insufficient fuel for the ground allowance before sector ${sector.sectorIndex + 1}`,
        };
      }
      currentFuel = afterGround;
    }

    const takeoffLoading = calculateLoadingState(
      currentFuel,
      operational,
      system,
      loading,
    );
    sectorTakeoffMassesKg.push(takeoffLoading.totalMassKg);
    const rows: CalculatedOfpLegRow[] = [];

    for (const leg of sector.legs) {
      const afterLeg = consumeFuelFromTanks(currentFuel, leg.fuelLitres);
      if (afterLeg === null) {
        return {
          status: 'no-solution',
          reason: 'insufficient-fuel',
          message: `Fuel is exhausted on ${leg.fromId} to ${leg.toId}`,
        };
      }
      currentFuel = afterLeg;
      accumulatedDistanceNm += leg.distanceNm;
      accumulatedAirborneSeconds += leg.eetSeconds;
      accumulatedAirborneFuelLitres += leg.fuelLitres;
      rows.push({
        leg,
        intermediate: {
          distanceNm: leg.distanceNm,
          airborneSeconds: leg.eetSeconds,
          airborneFuelLitres: leg.fuelLitres,
        },
        accumulated: {
          distanceNm: accumulatedDistanceNm,
          airborneSeconds: accumulatedAirborneSeconds,
          airborneFuelLitres: accumulatedAirborneFuelLitres,
        },
        estimatedFuelRemainingLitres: currentFuel.totalLitres,
      });
    }

    const patternCount = patternCountsByWaypointId.get(sector.toWaypointId) ?? 0;
    const patternSeconds = patternSecondsBySector[sector.sectorIndex]!;
    const patternFuelLitres = patternFuelBySector[sector.sectorIndex]!;
    let patternRow: CalculatedOfpPatternRow | null = null;
    if (patternCount > 0) {
      const afterPattern = consumeFuelFromTanks(currentFuel, patternFuelLitres);
      if (afterPattern === null) {
        return {
          status: 'no-solution',
          reason: 'insufficient-fuel',
          message: `Fuel is exhausted during the ${sector.toWaypointId} pattern`,
        };
      }
      currentFuel = afterPattern;
      accumulatedAirborneSeconds += patternSeconds;
      accumulatedAirborneFuelLitres += patternFuelLitres;
      patternRow = {
        airportWaypointId: sector.toWaypointId,
        patternCount,
        patternAltitudeFtMsl: sector.arrivalTargetAltitudeFtMsl,
        fuelFlowLph: patternFuelFlowLph,
        intermediate: {
          distanceNm: 0,
          airborneSeconds: patternSeconds,
          airborneFuelLitres: patternFuelLitres,
        },
        accumulated: {
          distanceNm: accumulatedDistanceNm,
          airborneSeconds: accumulatedAirborneSeconds,
          airborneFuelLitres: accumulatedAirborneFuelLitres,
        },
        estimatedFuelRemainingLitres: currentFuel.totalLitres,
      };
    }

    const landingLoading = calculateLoadingState(
      currentFuel,
      operational,
      system,
      loading,
    );
    const sectorWarnings: OperationalWarning[] = [];
    if (takeoffLoading.totalMassKg > loading.maximumTakeoffMassKg) {
      sectorWarnings.push({
        code: 'maximum-takeoff-mass-exceeded',
        sectorIndex: sector.sectorIndex,
        message: `Takeoff mass ${takeoffLoading.totalMassKg.toFixed(1)} kg exceeds ${loading.maximumTakeoffMassKg} kg`,
      });
    }
    if (landingLoading.totalMassKg > loading.maximumLandingMassKg) {
      sectorWarnings.push({
        code: 'maximum-landing-mass-exceeded',
        sectorIndex: sector.sectorIndex,
        message: `Landing mass ${landingLoading.totalMassKg.toFixed(1)} kg exceeds ${loading.maximumLandingMassKg} kg`,
      });
    }

    const minimumFlight = calculateMinimumFlight(
      takeoffLoading,
      sector,
      system,
      loading,
      patternRow,
    );
    if (minimumFlight.status === 'not-reached') {
      sectorWarnings.push({
        code: 'minimum-landing-mass-not-reached',
        sectorIndex: sector.sectorIndex,
        message: `The planned sector does not burn enough fuel to reach ${loading.maximumLandingMassKg} kg`,
      });
    }

    let remainingGroundCount = 0;
    for (let index = sector.sectorIndex; index < performanceRoute.sectors.length; index += 1) {
      if (groundAllowanceBySector[index]) {
        remainingGroundCount += 1;
      }
      const horizonSector = performanceRoute.sectors[index]!;
      const horizonArrivalOperation = operationsByWaypointId.get(
        horizonSector.toWaypointId,
      );
      if (
        horizonArrivalOperation?.kind === 'full-stop' &&
        horizonArrivalOperation.departureFuelOnboardLitres !== undefined
      ) {
        break;
      }
    }
    const tripFuelLitres =
      remainingAirborneFuel[sector.sectorIndex]! +
      remainingGroundCount * system.groundDepartureAllowance.fuelLitres;
    const tripTimeMinutes =
      remainingAirborneSeconds[sector.sectorIndex]! / SECONDS_PER_MINUTE +
      remainingGroundCount *
        system.groundDepartureAllowance.planningTimeMinutes;
    const alternateFuelLitres = alternate?.fuelLitres ?? 0;
    const alternateTimeMinutes = alternate?.timeMinutes ?? 0;
    const extraTimeMinutes =
      operational.extraFuelLitres /
      system.reserveFuelFlowLph *
      MINUTES_PER_HOUR;
    const finalReserveLitres = operational.finalReserveLitres;
    const finalReserveTimeMinutes = finalReserveLitres /
      system.reserveFuelFlowLph * MINUTES_PER_HOUR;
    const totalRequiredLitres =
      tripFuelLitres +
      alternateFuelLitres +
      operational.extraFuelLitres +
      finalReserveLitres;
    const totalRequiredTimeMinutes =
      tripTimeMinutes +
      alternateTimeMinutes +
      extraTimeMinutes +
      finalReserveTimeMinutes;
    const enduranceMinutes =
      totalRequiredTimeMinutes +
      (fuelOnboardBeforeDepartureLitres - totalRequiredLitres) /
        system.reserveFuelFlowLph *
        MINUTES_PER_HOUR;

    if (fuelOnboardBeforeDepartureLitres < totalRequiredLitres) {
      sectorWarnings.push({
        code: 'insufficient-fuel',
        sectorIndex: sector.sectorIndex,
        message: `Fuel onboard is ${(totalRequiredLitres - fuelOnboardBeforeDepartureLitres).toFixed(1)} L below the remaining requirement`,
      });
    }
    warnings.push(...sectorWarnings);

    const routeSector = routeSectors[sector.sectorIndex];
    if (routeSector === undefined) {
      throw new Error('Calculated sector does not match the route sector projection');
    }
    const intermediateTotal = {
      distanceNm: sector.totalDistanceNm,
      airborneSeconds: sector.totalEetSeconds + patternSeconds,
      airborneFuelLitres: sector.totalFuelLitres + patternFuelLitres,
    };
    const accumulatedTotal = patternRow?.accumulated ?? rows.at(-1)?.accumulated ?? {
      distanceNm: accumulatedDistanceNm,
      airborneSeconds: accumulatedAirborneSeconds,
      airborneFuelLitres: accumulatedAirborneFuelLitres,
    };

    sectors.push({
      sectorIndex: sector.sectorIndex,
      fromWaypointId: routeSector.fromWaypointId,
      toWaypointId: routeSector.toWaypointId,
      rows,
      patternRow,
      intermediateTotal,
      accumulatedTotal,
      fuelOnboardBeforeDepartureLitres,
      fuelAtTakeoffLitres: takeoffLoading.fuel.totalLitres,
      fuelAtLandingLitres: landingLoading.fuel.totalLitres,
      groundAllowanceApplied,
      takeoffLoading,
      landingLoading,
      tripFuel: fuelLine(tripFuelLitres, tripTimeMinutes, system),
      alternateFuel: fuelLine(
        alternateFuelLitres,
        alternateTimeMinutes,
        system,
      ),
      extraFuel: fuelLine(
        operational.extraFuelLitres,
        extraTimeMinutes,
        system,
      ),
      finalReserve: fuelLine(
        finalReserveLitres,
        finalReserveTimeMinutes,
        system,
      ),
      totalFuelRequired: fuelLine(
        totalRequiredLitres,
        totalRequiredTimeMinutes,
        system,
      ),
      enduranceMinutes,
      minimumFlight,
      warnings: sectorWarnings,
    });
  }

  const finalLandingLoading = sectors.at(-1)?.landingLoading ??
    calculateLoadingState(currentFuel, operational, system, loading);

  return {
    sectors,
    sectorTakeoffMassesKg,
    finalLandingLoading,
    warnings,
  };
}

export function calculateOperationalFlightPlan(
  input: OperationalFlightPlanCalculationInput,
): CalculatedOperationalFlightPlan {
  const system = input.aircraft.fuelSystem;
  const loading = input.aircraft.weightBalance;
  if (system === undefined || loading === undefined) {
    return {
      status: 'no-solution',
      reason: 'aircraft-operational-definition-missing',
      message: 'The selected aircraft has no fuel-system or weight-and-balance definition',
    };
  }

  const validationError = validateOperationalInputs(
    input.operational,
    input.flightPlan,
    system,
    loading,
  );
  if (validationError !== null) {
    return {
      status: 'no-solution',
      reason: 'invalid-operational-input',
      message: validationError,
    };
  }

  const sectorCount = deriveFlightPlanSectors(input.flightPlan).length;
  if (sectorCount === 0) {
    return {
      status: 'no-solution',
      reason: 'invalid-operational-input',
      message: 'At least two primary waypoints are required',
    };
  }

  let initialTakeoffLoading: CalculatedLoadingState;
  try {
    initialTakeoffLoading = calculateInitialTakeoffLoading(
      input.aircraft,
      input.operational,
    );
  } catch (error) {
    return {
      status: 'no-solution',
      reason: 'insufficient-fuel',
      message: error instanceof Error
        ? error.message
        : 'Fuel onboard is insufficient for the initial ground allowance',
    };
  }
  const initialMass = initialTakeoffLoading.totalMassKg;
  let sectorMassesKg = new Array<number>(sectorCount).fill(initialMass);
  let mainRoute: CalculatedPerformanceRouteSuccess | null = null;
  let projection: OperationalProjection | null = null;

  for (
    let iteration = 0;
    iteration < MAX_MASS_CONVERGENCE_ITERATIONS;
    iteration += 1
  ) {
    const result = calculatePerformanceRoute({
      flightPlan: input.flightPlan,
      navigation: input.navigation,
      performance: {
        ...input.performance,
        massKg: sectorMassesKg[0]!,
      },
      profile: input.aircraft.performance,
      sectorMassesKg,
      arrivalDelaySecondsByWaypointId: patternArrivalDelaySeconds(input.operational),
      ...(input.resolveWind === undefined ? {} : { resolveWind: input.resolveWind }),
    });
    if (result.status === 'no-solution') {
      return {
        status: 'no-solution',
        reason: 'main-performance-no-solution',
        message: result.message,
        performanceFailure: result,
      };
    }

    const projected = projectOperationalPlan(
      input.flightPlan,
      result,
      null,
      input.aircraft,
      input.operational,
    );
    if ('reason' in projected) {
      return projected;
    }

    mainRoute = result;
    projection = projected;
    const converged = projected.sectorTakeoffMassesKg.every(
      (massKg, index) =>
        Math.abs(massKg - sectorMassesKg[index]!) <=
        MASS_CONVERGENCE_TOLERANCE_KG,
    );
    sectorMassesKg = [...projected.sectorTakeoffMassesKg];
    if (converged) {
      break;
    }
  }

  if (mainRoute === null || projection === null) {
    throw new Error('Operational mass convergence did not run');
  }

  const finalProjection = projectOperationalPlan(
    input.flightPlan,
    mainRoute,
    input.operational.alternate,
    input.aircraft,
    input.operational,
  );
  if ('reason' in finalProjection) {
    return finalProjection;
  }

  return {
    status: 'ok',
    performanceRoute: mainRoute,
    sectors: finalProjection.sectors,
    warnings: finalProjection.warnings,
  };
}
