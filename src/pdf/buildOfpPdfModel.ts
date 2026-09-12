import type {
  CalculatedNavigationRoute,
  CalculatedPerformanceLeg,
  CalculatedSectorOperationalFlightPlan,
  CommunicationChange,
  RunwayPerformanceWorksheet,
} from '../calculations';
import {
  calculateRunwayPerformanceWorksheet,
  calculateRunwayWindComponents,
  calculateUtsaDensityAltitudeFt,
  calculateUtsaIsaDeviationC,
  calculateUtsaPressureAltitudeFt,
  resolveRunwayDirection,
  runwayDesignatorHeadingDeg,
} from '../calculations';
import { runwayOperationKey } from '../domain';
import type {
  AerodromeDetails,
  AircraftDefinition,
  AlternatePlanningInputs,
  FlightPlan,
  LegAltitudePlan,
  OperationalPlanningInputs,
} from '../domain';
import type { EffectiveAirportPlanningEnvironment } from '../weather';
import {
  calculatePerformanceLegNavigationSummary,
  calculatePerformanceLegTrueAirspeedKt,
} from '../app/route/performanceLegSummary';
import {
  runwayPerformanceOperationDraftKey,
  type OperationalInputDraft,
} from '../app/navigation/operationalInput';
import { OFP_TEMPLATE_NAVLOG_ROW_LIMIT } from './ofpPdfModel';
import type {
  OfpAerodromeModel,
  OfpFuelRequirementLine,
  OfpNavlogRow,
  OfpPdfModel,
  OfpRunwayPerformanceModel,
  OfpWeightBalanceRow,
} from './ofpPdfModel';

export interface OfpAlternateDisplayData {
  readonly inputs: AlternatePlanningInputs;
  readonly navigationRoute: CalculatedNavigationRoute | null;
  readonly trueAirspeedKt: number | null;
  readonly progress: {
    readonly accumulatedDistanceNm: number;
    readonly accumulatedTimeSeconds: number;
    readonly accumulatedFuelLitres: number | null;
    readonly estimatedFuelRemainingLitres: number | null;
  } | null;
}

export interface BuildOfpPdfModelInput {
  /** The one on-screen sector/navlog represented by this export action. */
  readonly flightPlan: FlightPlan;
  readonly navigationRoute: CalculatedNavigationRoute;
  readonly sector: CalculatedSectorOperationalFlightPlan;
  readonly aircraft: AircraftDefinition;
  /** Parsed planning inputs are copied to W&B presentation rows only. */
  readonly operationalInputs: OperationalPlanningInputs;
  readonly legAltitudePlans: readonly LegAltitudePlan[];
  readonly operationalDraft: OperationalInputDraft;
  readonly aerodromeDetailsByWaypointId: ReadonlyMap<string, AerodromeDetails>;
  readonly airportOperationEnvironments: ReadonlyMap<string, EffectiveAirportPlanningEnvironment>;
  readonly departureTimeUtcMs: number | null;
  readonly landingTimeUtcMs: number | null;
  readonly alternate?: OfpAlternateDisplayData | null;
  /** Derived route communications displayed beside this sector's navlog. */
  readonly communicationChangesByLeg?: ReadonlyMap<string, readonly CommunicationChange[]>;
}

export class OfpPdfModelError extends Error {}

function legKey(fromWaypointId: string, toWaypointId: string): string {
  return `${fromWaypointId}\0${toWaypointId}`;
}

function requirement(line: { litres: number; kilograms: number; timeMinutes: number }): OfpFuelRequirementLine {
  return { litres: line.litres, kilograms: line.kilograms, timeMinutes: line.timeMinutes };
}

function row(massKg: number | null, armM: number | null, momentKgm: number | null): OfpWeightBalanceRow {
  return { massKg, armM, momentKgm };
}

function loadingRow(loading: { totalMassKg: number; armM: number; totalMomentKgm: number }): OfpWeightBalanceRow {
  return row(loading.totalMassKg, loading.armM, loading.totalMomentKgm);
}

function emptyNavlogRow(kind: OfpNavlogRow['kind']): OfpNavlogRow {
  return {
    kind, from: null, to: null, tasKt: null, trueTrackDeg: null,
    variationDegEast: null, trueHeadingDeg: null, wind: null,
    windCorrectionDeg: null, accumulatedDistanceNm: null,
    accumulatedTimeSeconds: null, fuelFlowLph: null,
    intermediateFuelLitres: null, accumulatedFuelLitres: null,
    minimumSafeAltitudeFtMsl: null, plannedAltitudeFtMsl: null,
    groundSpeedKt: null, intermediateDistanceNm: null,
    intermediateTimeSeconds: null, estimatedTimeUtcMs: null,
    estimatedFuelRemainingLitres: null, actualTimeUtcMs: null,
    timeDifferenceSeconds: null, actualFuelRemainingLitres: null,
    frequency: null, plannedFrequencies: [],
  };
}

function fuelFlowLph(leg: CalculatedPerformanceLeg): number | null {
  return leg.eetSeconds <= 0 ? null : leg.fuelLitres / (leg.eetSeconds / 3600);
}

function plannedFrequencies(changes: readonly CommunicationChange[]): readonly string[] {
  return changes.flatMap(({ selection }) =>
    selection.operatingFrequency.status === 'selected'
      ? [selection.operatingFrequency.candidate.frequency.valueMHz]
      : selection.operatingFrequency.candidates.map(
          ({ frequency }) => `${frequency.valueMHz}?`,
        ),
  );
}

function buildLegRow(
  calculated: CalculatedSectorOperationalFlightPlan['rows'][number],
  names: ReadonlyMap<string, string>,
  navigationByLeg: ReadonlyMap<string, CalculatedNavigationRoute['legs'][number]>,
  msaByLeg: ReadonlyMap<string, number>,
  communicationChangesByLeg: ReadonlyMap<string, readonly CommunicationChange[]>,
): OfpNavlogRow {
  const navigation = navigationByLeg.get(legKey(calculated.leg.fromId, calculated.leg.toId));
  const summary = calculatePerformanceLegNavigationSummary(calculated.leg);
  const navigationSolution = navigation?.navigation?.status === 'ok' ? navigation.navigation : null;
  return {
    ...emptyNavlogRow('leg'),
    from: names.get(calculated.leg.fromId) ?? calculated.leg.fromId,
    to: names.get(calculated.leg.toId) ?? calculated.leg.toId,
    tasKt: calculatePerformanceLegTrueAirspeedKt(calculated.leg),
    trueTrackDeg: navigation?.trueTrackDeg ?? calculated.leg.trueTrackDeg,
    variationDegEast: navigation?.magneticVariationDegEast ?? null,
    trueHeadingDeg: summary?.trueHeadingDeg ?? navigationSolution?.trueHeadingDeg ?? null,
    wind: summary?.wind ?? navigation?.wind ?? null,
    accumulatedDistanceNm: calculated.accumulated.distanceNm,
    accumulatedTimeSeconds: calculated.accumulated.airborneSeconds,
    fuelFlowLph: fuelFlowLph(calculated.leg),
    intermediateFuelLitres: calculated.intermediate.airborneFuelLitres,
    accumulatedFuelLitres: calculated.accumulated.airborneFuelLitres,
    minimumSafeAltitudeFtMsl: msaByLeg.get(legKey(calculated.leg.fromId, calculated.leg.toId)) ?? null,
    plannedAltitudeFtMsl: calculated.leg.targetAltitudeFtMsl,
    groundSpeedKt: calculated.leg.effectiveGroundSpeedKt,
    intermediateDistanceNm: calculated.intermediate.distanceNm,
    intermediateTimeSeconds: calculated.intermediate.airborneSeconds,
    estimatedTimeUtcMs: calculated.leg.endTimeUtcMs,
    estimatedFuelRemainingLitres: calculated.estimatedFuelRemainingLitres,
    plannedFrequencies: plannedFrequencies(
      communicationChangesByLeg.get(
        legKey(calculated.leg.fromId, calculated.leg.toId),
      ) ?? [],
    ),
  };
}

function buildPatternRow(sector: CalculatedSectorOperationalFlightPlan, names: ReadonlyMap<string, string>): OfpNavlogRow | null {
  const pattern = sector.patternRow;
  if (pattern === null) return null;
  const airport = names.get(pattern.airportWaypointId) ?? pattern.airportWaypointId;
  return {
    ...emptyNavlogRow('pattern'), from: airport, to: airport,
    accumulatedTimeSeconds: pattern.accumulated.airborneSeconds,
    fuelFlowLph: pattern.fuelFlowLph,
    intermediateFuelLitres: pattern.intermediate.airborneFuelLitres,
    accumulatedFuelLitres: pattern.accumulated.airborneFuelLitres,
    plannedAltitudeFtMsl: pattern.patternAltitudeFtMsl,
    intermediateTimeSeconds: pattern.intermediate.airborneSeconds,
    estimatedFuelRemainingLitres: pattern.estimatedFuelRemainingLitres,
  };
}

function buildAlternateRow(alternate: OfpAlternateDisplayData | null | undefined): OfpNavlogRow | null {
  const navigation = alternate?.navigationRoute?.legs[0];
  if (alternate === null || alternate === undefined || navigation === undefined) return null;
  const solution = navigation.navigation?.status === 'ok' ? navigation.navigation : null;
  return {
    ...emptyNavlogRow('alternate'),
    // The form itself labels this line "Alt."; do not repeat the destination.
    from: null,
    to: alternate.inputs.waypoint.anchor?.publishedIdentifier ??
      alternate.inputs.waypoint.name,
    tasKt: alternate.trueAirspeedKt, trueTrackDeg: navigation.trueTrackDeg,
    variationDegEast: navigation.magneticVariationDegEast,
    trueHeadingDeg: solution?.trueHeadingDeg ?? null, wind: navigation.wind,
    accumulatedDistanceNm: alternate.progress?.accumulatedDistanceNm ?? null,
    accumulatedTimeSeconds: alternate.progress?.accumulatedTimeSeconds ?? null,
    intermediateFuelLitres: alternate.inputs.fuelLitres,
    accumulatedFuelLitres: alternate.progress?.accumulatedFuelLitres ?? null,
    plannedAltitudeFtMsl: alternate.inputs.plannedAltitudeFtMsl,
    groundSpeedKt: solution?.groundSpeedKt ?? null,
    intermediateDistanceNm: alternate.inputs.distanceNm,
    intermediateTimeSeconds: alternate.inputs.timeMinutes * 60,
    estimatedFuelRemainingLitres: alternate.progress?.estimatedFuelRemainingLitres ?? null,
  };
}

function aerodromeModel(
  waypointId: string, name: string | null, operationKey: string,
  details: BuildOfpPdfModelInput['aerodromeDetailsByWaypointId'],
  environments: BuildOfpPdfModelInput['airportOperationEnvironments'],
  draft: OperationalInputDraft,
): OfpAerodromeModel {
  const selected = draft.runwayPerformanceOperations.find((candidate) =>
    runwayPerformanceOperationDraftKey(candidate) === operationKey,
  );
  const environment = environments.get(operationKey);
  const aerodrome = details.get(waypointId);
  const runway = selected?.runwayDesignator || null;
  const elevationFtMsl = aerodrome?.elevationFt ?? null;
  const pressureAltitudeFt = elevationFtMsl === null || environment === undefined
    ? null
    : calculateUtsaPressureAltitudeFt(elevationFtMsl, environment.qnhHpa);
  const isaDeviationC = environment?.temperatureC === undefined
    ? null
    : calculateUtsaIsaDeviationC(environment.temperatureC);
  const densityAltitudeFt = pressureAltitudeFt === null || isaDeviationC === null
    ? null
    : calculateUtsaDensityAltitudeFt(pressureAltitudeFt, isaDeviationC);
  const direction = runway === null || aerodrome === undefined
    ? null
    : resolveRunwayDirection(aerodrome.runways, runway)?.direction ?? null;
  const heading = direction === null ? null : runwayDesignatorHeadingDeg(direction.designator);
  const windComponents = heading === null || environment?.wind === undefined
    ? null
    : calculateRunwayWindComponents(heading, environment.wind);
  const crosswindKt = windComponents?.status === 'available'
    ? Math.abs(windComponents.components.crosswindKt)
    : null;
  return {
    name, runway, elevationFtMsl,
    qnhHpa: environment?.qnhHpa ?? null, temperatureC: environment?.temperatureC ?? null,
    wind: environment?.wind ?? null, crosswindKt, pressureAltitudeFt,
    densityAltitudeFt, flaps: null,
  };
}

function runwayPerformanceModel(
  kind: 'takeoff' | 'landing',
  input: BuildOfpPdfModelInput,
): OfpRunwayPerformanceModel | null {
  const aerodromeWaypointId = kind === 'takeoff'
    ? input.sector.fromWaypointId
    : input.sector.toWaypointId;
  const operationKey = runwayOperationKey(
    kind,
    input.sector.fromWaypointId,
    input.sector.toWaypointId,
  );
  const operation = input.operationalInputs.runwayPerformance?.operations.find(
    (candidate) => runwayOperationKey(
      candidate.kind,
      candidate.sectorFromWaypointId,
      candidate.sectorToWaypointId,
    ) === operationKey,
  );
  const details = input.aerodromeDetailsByWaypointId.get(aerodromeWaypointId);
  const environment = input.airportOperationEnvironments.get(operationKey);
  if (details === undefined || environment === undefined || operation === undefined) {
    return null;
  }
  const worksheet: RunwayPerformanceWorksheet = calculateRunwayPerformanceWorksheet({
    kind,
    runways: details.runways,
    elevationFt: details.elevationFt,
    qnhHpa: environment.qnhHpa,
    temperatureC: environment.temperatureC,
    wind: environment.wind,
    runwayDesignator: operation.runwayDesignator,
    runwayCondition: operation.runwayCondition,
    rcc: operation.rcc,
    massKg: kind === 'takeoff'
      ? input.sector.takeoffLoading.totalMassKg
      : input.sector.landingLoading.totalMassKg,
    modelSupported: input.aircraft.runwayPerformanceProfile?.kind === 'z242l-utsa-v1',
  });
  return worksheet;
}

export function buildOfpPdfModel(input: BuildOfpPdfModelInput): OfpPdfModel {
  const normalRowCount = input.sector.rows.length + (input.sector.patternRow === null ? 0 : 1);
  if (normalRowCount > OFP_TEMPLATE_NAVLOG_ROW_LIMIT) {
    throw new OfpPdfModelError(`The selected navlog has ${normalRowCount} rows, but the OFP template supports ${OFP_TEMPLATE_NAVLOG_ROW_LIMIT}.`);
  }
  const names = new Map(input.flightPlan.waypoints.map((waypoint) => [waypoint.id, waypoint.name]));
  const navigationByLeg = new Map(input.navigationRoute.legs.map((leg) => [legKey(leg.fromId, leg.toId), leg]));
  const msaByLeg = new Map(input.legAltitudePlans.flatMap((plan) =>
    plan.minimumSafeAltitudeFtMsl === undefined ? [] : [[legKey(plan.fromWaypointId, plan.toWaypointId), plan.minimumSafeAltitudeFtMsl] as const],
  ));
  const pattern = buildPatternRow(input.sector, names);
  const navlogRows = [
    ...input.sector.rows.map((calculated) => buildLegRow(
      calculated, names, navigationByLeg, msaByLeg,
      input.communicationChangesByLeg ?? new Map(),
    )),
    ...(pattern === null ? [] : [pattern]),
  ];
  const fromName = names.get(input.sector.fromWaypointId) ?? null;
  const toName = names.get(input.sector.toWaypointId) ?? null;
  const density = input.aircraft.fuelSystem?.densityKgPerLitre;
  const balance = input.aircraft.weightBalance;
  const fuelSystem = input.aircraft.fuelSystem;
  const fuelRow = (litres: number, armM: number): OfpWeightBalanceRow => {
    if (density === undefined) return row(null, armM, null);
    const massKg = litres * density;
    return row(massKg, armM, massKg * armM);
  };
  const weightAndBalance = balance === undefined || fuelSystem === undefined ? null : {
    basicEmpty: row(balance.basicEmptyMassKg, balance.basicEmptyMomentKgm / balance.basicEmptyMassKg, balance.basicEmptyMomentKgm),
    leftSeat: row(input.operationalInputs.leftSeatMassKg, balance.leftSeatArmM, input.operationalInputs.leftSeatMassKg * balance.leftSeatArmM),
    rightSeat: row(input.operationalInputs.rightSeatMassKg, balance.rightSeatArmM, input.operationalInputs.rightSeatMassKg * balance.rightSeatArmM),
    mainFuel: fuelRow(input.sector.takeoffLoading.fuel.mainLitres, fuelSystem.main.armM),
    auxiliaryFuel: fuelRow(input.sector.takeoffLoading.fuel.auxiliaryLitres, fuelSystem.auxiliary.armM),
    baggage: row(input.operationalInputs.baggageMassKg, balance.baggageArmM, input.operationalInputs.baggageMassKg * balance.baggageArmM),
    takeoff: loadingRow(input.sector.takeoffLoading),
    enrouteAuxiliaryFuel: fuelRow(-(input.sector.takeoffLoading.fuel.auxiliaryLitres - input.sector.landingLoading.fuel.auxiliaryLitres), fuelSystem.auxiliary.armM),
    enrouteMainFuel: fuelRow(-(input.sector.takeoffLoading.fuel.mainLitres - input.sector.landingLoading.fuel.mainLitres), fuelSystem.main.armM),
    landing: loadingRow(input.sector.landingLoading),
  };
  const minimumFlight = input.sector.minimumFlight.status === 'reachable'
    ? { timeMinutes: input.sector.minimumFlight.timeMinutes, requiredFuelRemainingLitres: input.sector.minimumFlight.requiredFuelRemainingLitres }
    : input.sector.minimumFlight.status === 'not-required'
      ? { timeMinutes: 0, requiredFuelRemainingLitres: null }
      : { timeMinutes: null, requiredFuelRemainingLitres: input.sector.minimumFlight.requiredFuelRemainingLitres };
  const firstLeg = input.sector.rows[0]?.leg ?? null;
  return {
    page1: {
      departureName: fromName, destinationName: toName,
      takeoffTimeUtcMs: input.departureTimeUtcMs, landingTimeUtcMs: input.landingTimeUtcMs,
      dateUtcMs: input.departureTimeUtcMs, registration: input.aircraft.registration ?? null,
      flightTimeSeconds: input.sector.intermediateTotal.airborneSeconds,
      fuelDepartureLitres: input.sector.fuelOnboardBeforeDepartureLitres,
      fuelRemainingLitres: input.sector.fuelAtLandingLitres, navlogRows,
      totals: {
        accumulatedDistanceNm: input.sector.accumulatedTotal.distanceNm,
        accumulatedTimeSeconds: input.sector.accumulatedTotal.airborneSeconds,
        intermediateFuelLitres: input.sector.intermediateTotal.airborneFuelLitres,
        accumulatedFuelLitres: input.sector.accumulatedTotal.airborneFuelLitres,
        intermediateDistanceNm: input.sector.intermediateTotal.distanceNm,
        intermediateTimeSeconds: input.sector.intermediateTotal.airborneSeconds,
        estimatedFuelRemainingLitres: input.sector.fuelAtLandingLitres,
      }, alternateRow: buildAlternateRow(input.alternate),
      alternateTotals: input.alternate?.progress === null || input.alternate?.progress === undefined
        ? null
        : {
            accumulatedDistanceNm: input.alternate.progress.accumulatedDistanceNm,
            accumulatedTimeSeconds: input.alternate.progress.accumulatedTimeSeconds,
            intermediateFuelLitres: null,
            accumulatedFuelLitres: input.alternate.progress.accumulatedFuelLitres,
            intermediateDistanceNm: null,
            intermediateTimeSeconds: null,
            estimatedFuelRemainingLitres:
              input.alternate.progress.estimatedFuelRemainingLitres,
          },
    },
    page2: {
      registration: input.aircraft.registration ?? null, weightAndBalance,
      fuelRequirements: density === undefined ? null : {
        trip: requirement(input.sector.tripFuel), alternate: requirement(input.sector.alternateFuel),
        extra: requirement(input.sector.extraFuel), finalReserve: requirement(input.sector.finalReserve),
        totalRequired: requirement(input.sector.totalFuelRequired),
        totalOnboard: { litres: input.sector.fuelOnboardBeforeDepartureLitres, kilograms: input.sector.fuelOnboardBeforeDepartureLitres * density },
        enduranceMinutes: input.sector.enduranceMinutes,
      },
      cruise: { altitudeFtMsl: firstLeg?.targetAltitudeFtMsl ?? null, oatC: null, rpm: null, manifoldPressure: null, tasKt: firstLeg === null ? null : calculatePerformanceLegTrueAirspeedKt(firstLeg), fuelFlowLph: input.aircraft.performance.cruise.fuelFlowLph },
      departureAerodrome: aerodromeModel(input.sector.fromWaypointId, fromName, runwayOperationKey('takeoff', input.sector.fromWaypointId, input.sector.toWaypointId), input.aerodromeDetailsByWaypointId, input.airportOperationEnvironments, input.operationalDraft),
      destinationAerodrome: aerodromeModel(input.sector.toWaypointId, toName, runwayOperationKey('landing', input.sector.fromWaypointId, input.sector.toWaypointId), input.aerodromeDetailsByWaypointId, input.airportOperationEnvironments, input.operationalDraft),
      crosswindLimitKt:
        input.operationalInputs.runwayPerformance?.personalCrosswindLimitKt ?? null,
      departureRunwayPerformance: runwayPerformanceModel('takeoff', input),
      destinationRunwayPerformance: runwayPerformanceModel('landing', input),
      minimumFlight, dateUtcMs: input.departureTimeUtcMs,
    },
  };
}
