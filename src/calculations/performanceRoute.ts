import type {
  AircraftPerformancePlanInputs,
  AircraftPerformanceProfile,
  CalculatedLeg,
  FlightPhase,
  FlightPlan,
  PlanningEnvironment,
  RoutePlanningInputs,
  Wind,
  WindSampleQuery,
} from '../domain';
import {
  calculateClimbTime,
  calculatePhaseFuel,
  calculatePlanningEnvironment,
  calculateTasFromIas,
  createDescentIntervals,
} from './aircraftPerformance';
import type { VerticalInterval } from './aircraftPerformance';
import {
  calculateMagneticDirectionDeg,
  calculateWindAdjustedLeg,
} from './navigation';
import type { WindAdjustedLegSolution } from './navigation';
import { calculateRoute } from './route';
import { calculatePositionAlongGeometry } from './routeProgress';
import { deriveFlightPlanSectors } from './flightSectors';

const MILLISECONDS_PER_MINUTE = 60_000;
const TARGET_DISTANCE_TOLERANCE_NM = 1e-7;
const TARGET_SOLVER_ITERATIONS = 56;

export type WindResolver = (query: WindSampleQuery) => Wind;

export interface CalculatedPerformanceStep {
  readonly phase: FlightPhase;
  readonly startAltitudeFtMsl: number;
  readonly endAltitudeFtMsl: number;
  readonly representativeAltitudeFtMsl: number;
  readonly startDistanceFromLegNm: number;
  readonly endDistanceFromLegNm: number;
  readonly distanceNm: number;
  readonly durationSeconds: number;
  readonly fuelLitres: number;
  readonly trueAirspeedKt: number;
  readonly wind: Wind;
  readonly groundSpeedKt: number;
  readonly trueHeadingDeg: number;
  readonly magneticHeadingDeg: number;
  readonly startTimeUtcMs: number;
  readonly endTimeUtcMs: number;
}

export interface CalculatedLegPhase {
  readonly phase: FlightPhase;
  readonly distanceNm: number;
  readonly durationSeconds: number;
  readonly fuelLitres: number;
  readonly startAltitudeFtMsl: number;
  readonly endAltitudeFtMsl: number;
}

export interface CalculatedPerformanceLeg extends CalculatedLeg {
  readonly targetAltitudeFtMsl: number;
  readonly startAltitudeFtMsl: number;
  readonly endAltitudeFtMsl: number;
  readonly phases: readonly CalculatedLegPhase[];
  readonly steps: readonly CalculatedPerformanceStep[];
  readonly eetSeconds: number;
  readonly fuelLitres: number;
  readonly effectiveGroundSpeedKt: number | null;
  readonly startTimeUtcMs: number;
  readonly endTimeUtcMs: number;
}

export type PerformanceRouteNoSolutionReason =
  | 'non-positive-climb-rate'
  | 'wind-triangle-no-solution'
  | 'insufficient-leg-distance'
  | 'phase-overlap'
  | 'missing-sector-stop-plan'
  | 'sector-departure-before-arrival';

export interface CalculatedPerformanceSector {
  readonly sectorIndex: number;
  readonly fromWaypointId: string;
  readonly toWaypointId: string;
  readonly environment: PlanningEnvironment;
  readonly legs: readonly CalculatedPerformanceLeg[];
  readonly totalDistanceNm: number;
  readonly totalEetSeconds: number;
  readonly totalFuelLitres: number;
  readonly departureTimeUtcMs: number;
  readonly estimatedArrivalTimeUtcMs: number;
  readonly arrivalTargetAltitudeFtMsl: number;
}

export interface CalculatedPerformanceRouteSuccess {
  readonly status: 'ok';
  readonly environment: PlanningEnvironment;
  readonly legs: readonly CalculatedPerformanceLeg[];
  readonly totalDistanceNm: number;
  readonly totalEetSeconds: number;
  readonly totalFuelLitres: number;
  readonly estimatedArrivalTimeUtcMs: number;
  readonly arrivalTargetAltitudeFtMsl: number;
  readonly sectors: readonly CalculatedPerformanceSector[];
}

export interface CalculatedPerformanceRouteNoSolution {
  readonly status: 'no-solution';
  readonly reason: PerformanceRouteNoSolutionReason;
  readonly legFromId: string;
  readonly legToId: string;
  readonly message: string;
}

export type CalculatedPerformanceRoute =
  | CalculatedPerformanceRouteSuccess
  | CalculatedPerformanceRouteNoSolution;

export interface PerformanceRouteCalculationInput {
  readonly flightPlan: FlightPlan;
  readonly navigation: RoutePlanningInputs;
  readonly performance: AircraftPerformancePlanInputs;
  readonly profile: AircraftPerformanceProfile;
  readonly resolveWind?: WindResolver;
  /**
   * Derived takeoff masses for sequential sectors. This is calculation input,
   * never persisted editable plan state. Each sector still uses one constant
   * mass throughout its climb calculation.
   */
  readonly sectorMassesKg?: readonly number[];
}

interface LegContext {
  readonly leg: CalculatedLeg;
  readonly navigation: RoutePlanningInputs;
  readonly environment: PlanningEnvironment;
  readonly profile: AircraftPerformanceProfile;
  readonly resolveWind: WindResolver;
}

type StepCalculation =
  | {
      status: 'ok';
      steps: CalculatedPerformanceStep[];
      endDistanceNm: number;
      endTimeUtcMs: number;
    }
  | { status: 'no-solution'; message: string };

function requireFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be a finite number`);
  }
}

function windSolution(
  context: LegContext,
  trueAirspeedKt: number,
  altitudeFtMsl: number,
  distanceFromLegStartNm: number,
  timeUtcMs: number,
): { wind: Wind; solution: WindAdjustedLegSolution } | null {
  if (context.leg.trueTrackDeg === null) {
    return null;
  }

  const position = calculatePositionAlongGeometry(
    context.leg.geometry,
    distanceFromLegStartNm,
  ).position;
  const wind = context.resolveWind({
    fromWaypointId: context.leg.fromId,
    toWaypointId: context.leg.toId,
    position,
    altitudeFtMsl,
    timeUtcMs,
  });
  const result = calculateWindAdjustedLeg({
    trueTrackDeg: context.leg.trueTrackDeg,
    distanceNm: 0,
    trueAirspeedKt,
    wind,
  });

  return result.status === 'ok' ? { wind, solution: result } : null;
}

function calculateVerticalSteps(
  context: LegContext,
  phase: 'climb' | 'descent',
  intervals: readonly VerticalInterval[],
  startDistanceNm: number,
  startTimeUtcMs: number,
): StepCalculation {
  const steps: CalculatedPerformanceStep[] = [];
  let distanceCursorNm = startDistanceNm;
  let timeCursorUtcMs = startTimeUtcMs;
  const indicatedAirspeedKt =
    phase === 'climb'
      ? context.profile.climb.iasKt
      : context.profile.descent.iasKt;
  const fuelFlowLph =
    phase === 'climb'
      ? context.profile.climb.fuelFlowLph
      : context.profile.descent.fuelFlowLph;

  for (const interval of intervals) {
    const trueAirspeedKt = calculateTasFromIas(
      indicatedAirspeedKt,
      interval.representativeAltitudeFt,
      context.environment.qnhHpa,
      context.environment.isaDeviationC,
    );
    const durationSeconds = interval.durationMinutes * 60;
    const initial = windSolution(
      context,
      trueAirspeedKt,
      interval.representativeAltitudeFt,
      distanceCursorNm,
      timeCursorUtcMs,
    );

    if (initial === null) {
      return {
        status: 'no-solution',
        message: 'Wind triangle has no solution during vertical integration',
      };
    }

    const initialDistanceNm =
      initial.solution.groundSpeedKt * interval.durationMinutes / 60;
    const representativeDistanceNm = Math.min(
      context.leg.distanceNm,
      distanceCursorNm + initialDistanceNm / 2,
    );
    const representativeTimeUtcMs =
      timeCursorUtcMs + interval.durationMinutes * MILLISECONDS_PER_MINUTE / 2;
    const refined = windSolution(
      context,
      trueAirspeedKt,
      interval.representativeAltitudeFt,
      representativeDistanceNm,
      representativeTimeUtcMs,
    );

    if (refined === null) {
      return {
        status: 'no-solution',
        message: 'Wind triangle has no solution during vertical integration',
      };
    }

    const distanceNm =
      refined.solution.groundSpeedKt * interval.durationMinutes / 60;
    const endDistanceNm = distanceCursorNm + distanceNm;
    const endTimeUtcMs =
      timeCursorUtcMs + interval.durationMinutes * MILLISECONDS_PER_MINUTE;

    steps.push({
      phase,
      startAltitudeFtMsl: interval.startAltitudeFt,
      endAltitudeFtMsl: interval.endAltitudeFt,
      representativeAltitudeFtMsl: interval.representativeAltitudeFt,
      startDistanceFromLegNm: distanceCursorNm,
      endDistanceFromLegNm: endDistanceNm,
      distanceNm,
      durationSeconds,
      fuelLitres: calculatePhaseFuel(interval.durationMinutes, fuelFlowLph),
      trueAirspeedKt,
      wind: refined.wind,
      groundSpeedKt: refined.solution.groundSpeedKt,
      trueHeadingDeg: refined.solution.trueHeadingDeg,
      magneticHeadingDeg: calculateMagneticDirectionDeg(
        refined.solution.trueHeadingDeg,
        context.navigation.magneticVariationDegEast,
      ),
      startTimeUtcMs: timeCursorUtcMs,
      endTimeUtcMs,
    });
    distanceCursorNm = endDistanceNm;
    timeCursorUtcMs = endTimeUtcMs;
  }

  return {
    status: 'ok',
    steps,
    endDistanceNm: distanceCursorNm,
    endTimeUtcMs: timeCursorUtcMs,
  };
}

function calculateCruiseStep(
  context: LegContext,
  altitudeFtMsl: number,
  startDistanceNm: number,
  endDistanceNm: number,
  startTimeUtcMs: number,
): StepCalculation {
  const distanceNm = endDistanceNm - startDistanceNm;

  if (distanceNm <= TARGET_DISTANCE_TOLERANCE_NM) {
    return {
      status: 'ok',
      steps: [],
      endDistanceNm: startDistanceNm,
      endTimeUtcMs: startTimeUtcMs,
    };
  }

  const trueAirspeedKt = calculateTasFromIas(
    context.profile.cruise.iasKt,
    altitudeFtMsl,
    context.environment.qnhHpa,
    context.environment.isaDeviationC,
  );
  const midpointDistanceNm = startDistanceNm + distanceNm / 2;
  const first = windSolution(
    context,
    trueAirspeedKt,
    altitudeFtMsl,
    midpointDistanceNm,
    startTimeUtcMs,
  );

  if (first === null) {
    return {
      status: 'no-solution',
      message: 'Wind triangle has no solution in cruise',
    };
  }

  const firstDurationMinutes = distanceNm / first.solution.groundSpeedKt * 60;
  const refined = windSolution(
    context,
    trueAirspeedKt,
    altitudeFtMsl,
    midpointDistanceNm,
    startTimeUtcMs + firstDurationMinutes * MILLISECONDS_PER_MINUTE / 2,
  );

  if (refined === null) {
    return {
      status: 'no-solution',
      message: 'Wind triangle has no solution in cruise',
    };
  }

  const durationMinutes = distanceNm / refined.solution.groundSpeedKt * 60;
  const endTimeUtcMs =
    startTimeUtcMs + durationMinutes * MILLISECONDS_PER_MINUTE;

  return {
    status: 'ok',
    endDistanceNm,
    endTimeUtcMs,
    steps: [{
      phase: 'cruise',
      startAltitudeFtMsl: altitudeFtMsl,
      endAltitudeFtMsl: altitudeFtMsl,
      representativeAltitudeFtMsl: altitudeFtMsl,
      startDistanceFromLegNm: startDistanceNm,
      endDistanceFromLegNm: endDistanceNm,
      distanceNm,
      durationSeconds: durationMinutes * 60,
      fuelLitres: calculatePhaseFuel(
        durationMinutes,
        context.profile.cruise.fuelFlowLph,
      ),
      trueAirspeedKt,
      wind: refined.wind,
      groundSpeedKt: refined.solution.groundSpeedKt,
      trueHeadingDeg: refined.solution.trueHeadingDeg,
      magneticHeadingDeg: calculateMagneticDirectionDeg(
        refined.solution.trueHeadingDeg,
        context.navigation.magneticVariationDegEast,
      ),
      startTimeUtcMs,
      endTimeUtcMs,
    }],
  };
}

function aggregatePhases(
  steps: readonly CalculatedPerformanceStep[],
): CalculatedLegPhase[] {
  const phases: CalculatedLegPhase[] = [];

  for (const step of steps) {
    const previous = phases.at(-1);

    if (previous?.phase === step.phase) {
      phases[phases.length - 1] = {
        ...previous,
        distanceNm: previous.distanceNm + step.distanceNm,
        durationSeconds: previous.durationSeconds + step.durationSeconds,
        fuelLitres: previous.fuelLitres + step.fuelLitres,
        endAltitudeFtMsl: step.endAltitudeFtMsl,
      };
    } else {
      phases.push({
        phase: step.phase,
        distanceNm: step.distanceNm,
        durationSeconds: step.durationSeconds,
        fuelLitres: step.fuelLitres,
        startAltitudeFtMsl: step.startAltitudeFtMsl,
        endAltitudeFtMsl: step.endAltitudeFtMsl,
      });
    }
  }

  return phases;
}

function legKey(fromId: string, toId: string): string {
  return `${fromId}\u0000${toId}`;
}

type CalculatedSingleSectorPerformanceRoute =
  | Omit<CalculatedPerformanceRouteSuccess, 'sectors'>
  | CalculatedPerformanceRouteNoSolution;

function calculateSingleSectorPerformanceRoute({
  flightPlan,
  navigation,
  performance,
  profile,
  resolveWind = () => navigation.wind,
}: PerformanceRouteCalculationInput): CalculatedSingleSectorPerformanceRoute {
  requireFinite(performance.massKg, 'Aircraft mass');
  requireFinite(performance.defaultAltitudeFtMsl, 'Default altitude');
  requireFinite(performance.departureElevationFtMsl, 'Departure elevation');
  requireFinite(performance.destinationElevationFtMsl, 'Destination elevation');
  requireFinite(performance.patternHeightAglFt, 'Pattern height');

  if (performance.massKg <= 0) {
    throw new RangeError('Aircraft mass must be greater than zero');
  }

  if (
    performance.defaultAltitudeFtMsl < 0 ||
    performance.departureElevationFtMsl < 0 ||
    performance.destinationElevationFtMsl < 0 ||
    performance.patternHeightAglFt < 0
  ) {
    throw new RangeError('Performance altitudes must not be negative');
  }

  const environment = calculatePlanningEnvironment(
    performance.departureWeather,
    performance.destinationWeather,
  );
  const geometricLegs = calculateRoute(flightPlan);
  const adjacentKeys = new Set(
    geometricLegs.map((leg) => legKey(leg.fromId, leg.toId)),
  );
  const plansByLeg = new Map<string, AircraftPerformancePlanInputs['legAltitudePlans'][number]>();

  for (const plan of performance.legAltitudePlans) {
    const key = legKey(plan.fromWaypointId, plan.toWaypointId);

    if (!adjacentKeys.has(key)) {
      throw new RangeError(
        `Altitude plan ${plan.fromWaypointId} to ${plan.toWaypointId} does not match an adjacent waypoint leg`,
      );
    }

    if (plansByLeg.has(key)) {
      throw new RangeError(
        `Duplicate altitude plan for leg ${plan.fromWaypointId} to ${plan.toWaypointId}`,
      );
    }

    if (plan.altitudeFtMsl !== undefined) {
      requireFinite(plan.altitudeFtMsl, 'Leg altitude');
      if (plan.altitudeFtMsl < 0) {
        throw new RangeError('Leg altitude must not be negative');
      }
    }

    if (plan.targetPlacement?.mode === 'distance-along-leg') {
      requireFinite(
        plan.targetPlacement.distanceFromStartNm,
        'Altitude target distance',
      );
      if (
        plan.targetPlacement.distanceFromStartNm < 0
      ) {
        throw new RangeError('Altitude target distance must not be negative');
      }

      const matchingLeg = geometricLegs.find(
        (leg) =>
          leg.fromId === plan.fromWaypointId &&
          leg.toId === plan.toWaypointId,
      )!;

      if (
        plan.targetPlacement.distanceFromStartNm >
        matchingLeg.distanceNm + TARGET_DISTANCE_TOLERANCE_NM
      ) {
        return {
          status: 'no-solution',
          reason: 'phase-overlap',
          legFromId: plan.fromWaypointId,
          legToId: plan.toWaypointId,
          message: 'Altitude target is beyond the current shaped leg geometry',
        };
      }
    }

    plansByLeg.set(key, plan);
  }

  const calculatedLegs: CalculatedPerformanceLeg[] = [];
  let currentAltitudeFtMsl = performance.departureElevationFtMsl;
  let currentTimeUtcMs = navigation.departureTimeUtcMs;
  let totalEetSeconds = 0;
  let totalFuelLitres = 0;
  const arrivalTargetAltitudeFtMsl =
    performance.destinationElevationFtMsl + performance.patternHeightAglFt;

  for (let legIndex = 0; legIndex < geometricLegs.length; legIndex += 1) {
    const leg = geometricLegs[legIndex]!;
    const plan = plansByLeg.get(legKey(leg.fromId, leg.toId));
    const isFinalLeg = legIndex === geometricLegs.length - 1;
    const targetAltitudeFtMsl =
      plan?.altitudeFtMsl ?? performance.defaultAltitudeFtMsl;
    const context: LegContext = {
      leg,
      navigation,
      environment,
      profile,
      resolveWind,
    };
    const startAltitudeFtMsl = currentAltitudeFtMsl;
    const legStartTimeUtcMs = currentTimeUtcMs;
    const steps: CalculatedPerformanceStep[] = [];
    let distanceCursorNm = 0;

    const addTransition = (
      fromAltitudeFtMsl: number,
      toAltitudeFtMsl: number,
      requestedTargetDistanceNm: number | null,
    ): CalculatedPerformanceRouteNoSolution | null => {
      if (fromAltitudeFtMsl === toAltitudeFtMsl) {
        return null;
      }

      const phase = toAltitudeFtMsl > fromAltitudeFtMsl ? 'climb' : 'descent';
      const vertical =
        phase === 'climb'
          ? calculateClimbTime(
              fromAltitudeFtMsl,
              toAltitudeFtMsl,
              environment.isaDeviationC,
              performance.massKg,
              profile.climb.rateModel,
            )
          : {
              status: 'ok' as const,
              intervals: createDescentIntervals(
                fromAltitudeFtMsl,
                toAltitudeFtMsl,
                profile.descent.rateFtPerMin,
              ),
            };

      if (vertical.status === 'impossible') {
        return {
          status: 'no-solution',
          reason: 'non-positive-climb-rate',
          legFromId: leg.fromId,
          legToId: leg.toId,
          message: `Climb rate is non-positive at ${vertical.altitudeFt.toFixed(0)} ft`,
        };
      }

      const targetDistanceNm =
        requestedTargetDistanceNm ??
        (phase === 'climb' ? null : leg.distanceNm);

      if (targetDistanceNm === null) {
        const transition = calculateVerticalSteps(
          context,
          phase,
          vertical.intervals,
          distanceCursorNm,
          currentTimeUtcMs,
        );

        if (transition.status === 'no-solution') {
          return {
            status: 'no-solution',
            reason: 'wind-triangle-no-solution',
            legFromId: leg.fromId,
            legToId: leg.toId,
            message: transition.message,
          };
        }

        if (
          transition.endDistanceNm >
          leg.distanceNm + TARGET_DISTANCE_TOLERANCE_NM
        ) {
          return {
            status: 'no-solution',
            reason: 'insufficient-leg-distance',
            legFromId: leg.fromId,
            legToId: leg.toId,
            message: 'The altitude transition does not fit within the leg',
          };
        }

        steps.push(...transition.steps);
        distanceCursorNm = transition.endDistanceNm;
        currentTimeUtcMs = transition.endTimeUtcMs;
        return null;
      }

      if (
        targetDistanceNm < distanceCursorNm - TARGET_DISTANCE_TOLERANCE_NM ||
        targetDistanceNm > leg.distanceNm + TARGET_DISTANCE_TOLERANCE_NM
      ) {
        return {
          status: 'no-solution',
          reason: 'phase-overlap',
          legFromId: leg.fromId,
          legToId: leg.toId,
          message: 'Altitude target is outside the available leg portion',
        };
      }

      const earliest = calculateVerticalSteps(
        context,
        phase,
        vertical.intervals,
        distanceCursorNm,
        currentTimeUtcMs,
      );

      if (earliest.status === 'no-solution') {
        return {
          status: 'no-solution',
          reason: 'wind-triangle-no-solution',
          legFromId: leg.fromId,
          legToId: leg.toId,
          message: earliest.message,
        };
      }

      if (
        earliest.endDistanceNm >
        targetDistanceNm + TARGET_DISTANCE_TOLERANCE_NM
      ) {
        return {
          status: 'no-solution',
          reason: 'insufficient-leg-distance',
          legFromId: leg.fromId,
          legToId: leg.toId,
          message: 'The selected altitude target is too close for the transition',
        };
      }

      let lowerStartNm = distanceCursorNm;
      let upperStartNm = targetDistanceNm;
      let selectedCruise: Extract<StepCalculation, { status: 'ok' }> | null = null;
      let selectedTransition: Extract<StepCalculation, { status: 'ok' }> = earliest;

      for (
        let iteration = 0;
        iteration < TARGET_SOLVER_ITERATIONS;
        iteration += 1
      ) {
        const candidateStartNm = (lowerStartNm + upperStartNm) / 2;
        const cruise = calculateCruiseStep(
          context,
          fromAltitudeFtMsl,
          distanceCursorNm,
          candidateStartNm,
          currentTimeUtcMs,
        );

        if (cruise.status === 'no-solution') {
          return {
            status: 'no-solution',
            reason: 'wind-triangle-no-solution',
            legFromId: leg.fromId,
            legToId: leg.toId,
            message: cruise.message,
          };
        }

        const transition = calculateVerticalSteps(
          context,
          phase,
          vertical.intervals,
          candidateStartNm,
          cruise.endTimeUtcMs,
        );

        if (transition.status === 'no-solution') {
          return {
            status: 'no-solution',
            reason: 'wind-triangle-no-solution',
            legFromId: leg.fromId,
            legToId: leg.toId,
            message: transition.message,
          };
        }

        selectedCruise = cruise;
        selectedTransition = transition;

        if (transition.endDistanceNm < targetDistanceNm) {
          lowerStartNm = candidateStartNm;
        } else {
          upperStartNm = candidateStartNm;
        }
      }

      if (selectedCruise === null) {
        throw new Error('Altitude target solver did not produce a result');
      }

      steps.push(...selectedCruise.steps, ...selectedTransition.steps);
      distanceCursorNm = targetDistanceNm;
      currentTimeUtcMs = selectedTransition.endTimeUtcMs;
      return null;
    };

    const configuredTargetDistanceNm =
      plan?.targetPlacement?.mode === 'distance-along-leg'
        ? plan.targetPlacement.distanceFromStartNm
        : null;
    const transitionFailure = addTransition(
      currentAltitudeFtMsl,
      targetAltitudeFtMsl,
      configuredTargetDistanceNm,
    );

    if (transitionFailure !== null) {
      return transitionFailure;
    }

    currentAltitudeFtMsl = targetAltitudeFtMsl;

    if (isFinalLeg && currentAltitudeFtMsl !== arrivalTargetAltitudeFtMsl) {
      const arrivalFailure = addTransition(
        currentAltitudeFtMsl,
        arrivalTargetAltitudeFtMsl,
        leg.distanceNm,
      );

      if (arrivalFailure !== null) {
        return arrivalFailure;
      }

      currentAltitudeFtMsl = arrivalTargetAltitudeFtMsl;
    }

    const remainingCruise = calculateCruiseStep(
      context,
      currentAltitudeFtMsl,
      distanceCursorNm,
      leg.distanceNm,
      currentTimeUtcMs,
    );

    if (remainingCruise.status === 'no-solution') {
      return {
        status: 'no-solution',
        reason: 'wind-triangle-no-solution',
        legFromId: leg.fromId,
        legToId: leg.toId,
        message: remainingCruise.message,
      };
    }

    steps.push(...remainingCruise.steps);
    currentTimeUtcMs = remainingCruise.endTimeUtcMs;
    const eetSeconds = steps.reduce(
      (total, step) => total + step.durationSeconds,
      0,
    );
    const fuelLitres = steps.reduce(
      (total, step) => total + step.fuelLitres,
      0,
    );

    calculatedLegs.push({
      ...leg,
      targetAltitudeFtMsl,
      startAltitudeFtMsl,
      endAltitudeFtMsl: currentAltitudeFtMsl,
      phases: aggregatePhases(steps),
      steps,
      eetSeconds,
      fuelLitres,
      effectiveGroundSpeedKt:
        eetSeconds === 0 ? null : leg.distanceNm / (eetSeconds / 3600),
      startTimeUtcMs: legStartTimeUtcMs,
      endTimeUtcMs: currentTimeUtcMs,
    });
    totalEetSeconds += eetSeconds;
    totalFuelLitres += fuelLitres;
  }

  return {
    status: 'ok',
    environment,
    legs: calculatedLegs,
    totalDistanceNm: geometricLegs.reduce(
      (total, leg) => total + leg.distanceNm,
      0,
    ),
    totalEetSeconds,
    totalFuelLitres,
    estimatedArrivalTimeUtcMs: currentTimeUtcMs,
    arrivalTargetAltitudeFtMsl,
  };
}

export function calculatePerformanceRoute(
  input: PerformanceRouteCalculationInput,
): CalculatedPerformanceRoute {
  const sectors = deriveFlightPlanSectors(input.flightPlan);

  if (sectors.length === 0) {
    const result = calculateSingleSectorPerformanceRoute(input);
    return result.status === 'ok' ? { ...result, sectors: [] } : result;
  }

  const stopPlansByWaypointId = new Map(
    (input.performance.sectorStopPlans ?? []).map((stop) => [stop.waypointId, stop]),
  );
  const boundaryIds = new Set(input.flightPlan.sectorBoundaryWaypointIds ?? []);

  for (const stop of input.performance.sectorStopPlans ?? []) {
    if (!boundaryIds.has(stop.waypointId)) {
      throw new RangeError(
        `Sector stop plan ${stop.waypointId} is not a route sector boundary`,
      );
    }
  }

  const calculatedSectors: CalculatedPerformanceSector[] = [];
  const calculatedLegs: CalculatedPerformanceLeg[] = [];
  let previousArrivalTimeUtcMs: number | null = null;

  for (const sector of sectors) {
    const departureStop =
      sector.sectorIndex === 0
        ? null
        : stopPlansByWaypointId.get(sector.fromWaypointId) ?? null;
    const destinationStop =
      sector.sectorIndex === sectors.length - 1
        ? null
        : stopPlansByWaypointId.get(sector.toWaypointId) ?? null;

    if (sector.sectorIndex > 0 && departureStop === null) {
      return {
        status: 'no-solution',
        reason: 'missing-sector-stop-plan',
        legFromId: sector.fromWaypointId,
        legToId: sector.toWaypointId,
        message: `Intermediate airport ${sector.fromWaypointId} needs elevation and weather`,
      };
    }

    if (sector.sectorIndex < sectors.length - 1 && destinationStop === null) {
      return {
        status: 'no-solution',
        reason: 'missing-sector-stop-plan',
        legFromId: sector.fromWaypointId,
        legToId: sector.toWaypointId,
        message: `Intermediate airport ${sector.toWaypointId} needs elevation and weather`,
      };
    }

    if (
      departureStop?.stopDurationMinutes !== undefined &&
      (!Number.isFinite(departureStop.stopDurationMinutes) ||
        departureStop.stopDurationMinutes < 0)
    ) {
      throw new RangeError('Sector stop duration must be a non-negative number');
    }

    const departureTimeUtcMs =
      sector.sectorIndex === 0
        ? input.navigation.departureTimeUtcMs
        : departureStop!.stopDurationMinutes !== undefined
          ? previousArrivalTimeUtcMs! +
            departureStop!.stopDurationMinutes * 60_000
          : departureStop!.onwardDepartureTimeUtcMs ?? previousArrivalTimeUtcMs!;

    if (
      previousArrivalTimeUtcMs !== null &&
      departureTimeUtcMs < previousArrivalTimeUtcMs
    ) {
      return {
        status: 'no-solution',
        reason: 'sector-departure-before-arrival',
        legFromId: sector.fromWaypointId,
        legToId: sector.toWaypointId,
        message: `Onward departure from ${sector.fromWaypointId} is before the preceding arrival`,
      };
    }

    const sectorWaypointIds = new Set(
      sector.flightPlan.waypoints.map((waypoint) => waypoint.id),
    );
    const result = calculateSingleSectorPerformanceRoute({
      ...input,
      flightPlan: sector.flightPlan,
      navigation: {
        ...input.navigation,
        departureTimeUtcMs,
      },
      performance: {
        ...input.performance,
        massKg:
          input.sectorMassesKg?.[sector.sectorIndex] ??
          input.performance.massKg,
        departureElevationFtMsl:
          departureStop?.elevationFtMsl ??
          input.performance.departureElevationFtMsl,
        destinationElevationFtMsl:
          destinationStop?.elevationFtMsl ??
          input.performance.destinationElevationFtMsl,
        departureWeather:
          departureStop?.weather ?? input.performance.departureWeather,
        destinationWeather:
          destinationStop?.weather ?? input.performance.destinationWeather,
        legAltitudePlans: input.performance.legAltitudePlans.filter(
          (plan) =>
            sectorWaypointIds.has(plan.fromWaypointId) &&
            sectorWaypointIds.has(plan.toWaypointId),
        ),
        sectorStopPlans: [],
      },
    });

    if (result.status === 'no-solution') {
      return result;
    }

    const calculatedSector: CalculatedPerformanceSector = {
      sectorIndex: sector.sectorIndex,
      fromWaypointId: sector.fromWaypointId,
      toWaypointId: sector.toWaypointId,
      environment: result.environment,
      legs: result.legs,
      totalDistanceNm: result.totalDistanceNm,
      totalEetSeconds: result.totalEetSeconds,
      totalFuelLitres: result.totalFuelLitres,
      departureTimeUtcMs,
      estimatedArrivalTimeUtcMs: result.estimatedArrivalTimeUtcMs,
      arrivalTargetAltitudeFtMsl: result.arrivalTargetAltitudeFtMsl,
    };

    calculatedSectors.push(calculatedSector);
    calculatedLegs.push(...result.legs);
    previousArrivalTimeUtcMs = result.estimatedArrivalTimeUtcMs;
  }

  const firstSector = calculatedSectors[0]!;
  const finalSector = calculatedSectors.at(-1)!;

  return {
    status: 'ok',
    environment: firstSector.environment,
    legs: calculatedLegs,
    sectors: calculatedSectors,
    totalDistanceNm: calculatedSectors.reduce(
      (total, sector) => total + sector.totalDistanceNm,
      0,
    ),
    totalEetSeconds: calculatedSectors.reduce(
      (total, sector) => total + sector.totalEetSeconds,
      0,
    ),
    totalFuelLitres: calculatedSectors.reduce(
      (total, sector) => total + sector.totalFuelLitres,
      0,
    ),
    estimatedArrivalTimeUtcMs: finalSector.estimatedArrivalTimeUtcMs,
    arrivalTargetAltitudeFtMsl: finalSector.arrivalTargetAltitudeFtMsl,
  };
}
