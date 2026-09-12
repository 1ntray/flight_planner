import type { AerodromeRunway, RunwayDirection } from '../domain';
import type { AirportWind } from '../weather';
import {
  Z242_LANDING_FIGURE_5_26_HOT_BRAKES,
  Z242_TAKEOFF_FIGURE_5_10,
} from './z242AfmNomogramData';
import type { Z242AfmNomogramData } from './z242AfmNomogramData';

export const DEFAULT_PERSONAL_CROSSWIND_LIMIT_KT = 9;
export const TAKEOFF_PERFORMANCE_FACTOR = 1.25;
export const LANDING_PERFORMANCE_FACTOR = 1.43;

export interface RunwayPerformanceModelProvenance {
  readonly aircraft: 'ZLIN Z242L';
  readonly takeoffSource: 'AFM Figure 5-10, take-off distance to 50 ft (15 m)';
  readonly landingSource: 'AFM Figure 5-26, landing distance from 50 ft (15 m), Hot brakes';
  readonly brakingSource: 'UTSA OM-C 4.7.1';
  readonly methodSource: 'UTSA Operational Flightplan v2.0, 10.08.2026';
  readonly takeoffRepresentationRevision: 'z242l-afm-fig-5-10-v1';
  readonly landingRepresentationRevision: 'z242l-afm-fig-5-26-hot-brakes-v1';
}

export const Z242L_RUNWAY_PERFORMANCE_PROVENANCE: RunwayPerformanceModelProvenance = {
  aircraft: 'ZLIN Z242L',
  takeoffSource: 'AFM Figure 5-10, take-off distance to 50 ft (15 m)',
  landingSource: 'AFM Figure 5-26, landing distance from 50 ft (15 m), Hot brakes',
  brakingSource: 'UTSA OM-C 4.7.1',
  methodSource: 'UTSA Operational Flightplan v2.0, 10.08.2026',
  takeoffRepresentationRevision: 'z242l-afm-fig-5-10-v1',
  landingRepresentationRevision: 'z242l-afm-fig-5-26-hot-brakes-v1',
};

export function calculateUtsaPressureAltitudeFt(
  elevationFt: number,
  qnhHpa: number,
): number {
  if (!Number.isFinite(elevationFt) || !Number.isFinite(qnhHpa) || qnhHpa <= 0) {
    throw new RangeError('Elevation and QNH must be finite, and QNH must be positive');
  }
  return elevationFt + 27 * (1013 - qnhHpa);
}

export function calculateUtsaIsaDeviationC(oatC: number): number {
  if (!Number.isFinite(oatC)) throw new RangeError('OAT must be finite');
  return Math.round(oatC - 15);
}

export function calculateUtsaDensityAltitudeFt(
  pressureAltitudeFt: number,
  roundedIsaDeviationC: number,
): number {
  if (!Number.isFinite(pressureAltitudeFt) || !Number.isFinite(roundedIsaDeviationC)) {
    throw new RangeError('Pressure altitude and ISA deviation must be finite');
  }
  if (!Number.isInteger(roundedIsaDeviationC)) {
    throw new RangeError('ISA deviation must already be rounded to a whole degree');
  }
  return pressureAltitudeFt + 120 * roundedIsaDeviationC;
}

export interface RunwayWindComponents {
  /** Positive is headwind, negative is tailwind. */
  readonly parallelKt: number;
  /** Signed component; limitation checks use its magnitude. */
  readonly crosswindKt: number;
  readonly gustParallelKt?: number;
  readonly gustCrosswindKt?: number;
}

export type RunwayWindComponentResult =
  | { readonly status: 'available'; readonly components: RunwayWindComponents }
  | { readonly status: 'unavailable'; readonly reason: 'variable-wind' };

/**
 * Converts a standard runway designator (for example 10 or 28L) to the
 * nominal heading used by the OFP wind-component worksheet. This deliberately
 * does not use the aerodrome's published true bearing.
 */
export function runwayDesignatorHeadingDeg(designator: string): number | null {
  const match = /^(\d{2})(?:[LCR])?$/.exec(designator.trim().toUpperCase());
  if (match === null) return null;
  const runwayNumber = Number(match[1]);
  return runwayNumber >= 1 && runwayNumber <= 36 ? runwayNumber * 10 : null;
}

function roundWindComponentKt(value: number): number {
  const rounded = Math.round(value);
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function calculateRunwayWindComponents(
  runwayHeadingDeg: number,
  wind: AirportWind,
): RunwayWindComponentResult {
  if (!Number.isFinite(runwayHeadingDeg)) {
    throw new RangeError('Runway heading must be finite');
  }
  if (wind.kind === 'variable') return { status: 'unavailable', reason: 'variable-wind' };
  if (wind.kind === 'calm') {
    return { status: 'available', components: { parallelKt: 0, crosswindKt: 0 } };
  }
  const angleRad = (wind.directionFromTrueDeg - runwayHeadingDeg) * Math.PI / 180;
  const components: RunwayWindComponents = {
    parallelKt: roundWindComponentKt(wind.speedKt * Math.cos(angleRad)),
    crosswindKt: roundWindComponentKt(wind.speedKt * Math.sin(angleRad)),
    ...(wind.gustKt === undefined ? {} : {
      gustParallelKt: roundWindComponentKt(wind.gustKt * Math.cos(angleRad)),
      gustCrosswindKt: roundWindComponentKt(wind.gustKt * Math.sin(angleRad)),
    }),
  };
  return { status: 'available', components };
}

export type WindDistanceCorrection =
  | { readonly status: 'available'; readonly steps: number; readonly fraction: number; readonly factor: number }
  | { readonly status: 'unavailable'; readonly reason: 'nonsensical-extreme-headwind' };

export function calculateUtsaWindDistanceCorrection(
  parallelComponentKt: number,
): WindDistanceCorrection {
  if (!Number.isFinite(parallelComponentKt)) throw new RangeError('Wind component must be finite');
  const steps = Math.floor(Math.abs(parallelComponentKt) / 9);
  const fraction = steps * 0.1;
  const factor = parallelComponentKt >= 0 ? 1 - fraction : 1 + fraction;
  return factor <= 0
    ? { status: 'unavailable', reason: 'nonsensical-extreme-headwind' }
    : { status: 'available', steps, fraction, factor };
}

export interface RccPerformanceRule {
  readonly rcc: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  readonly runwayCondition: string;
  readonly brakingAction: string;
  readonly landingCorrectionFraction: number | null;
  readonly instructorCrosswindLimitKt: number | null;
  readonly supported: boolean;
}

const RCC_RULES: Readonly<Record<number, RccPerformanceRule>> = {
  6: { rcc: 6, runwayCondition: 'DRY', brakingAction: 'DRY', landingCorrectionFraction: 0, instructorCrosswindLimitKt: 20, supported: true },
  5: { rcc: 5, runwayCondition: 'WET', brakingAction: 'GOOD', landingCorrectionFraction: 0, instructorCrosswindLimitKt: 20, supported: true },
  4: { rcc: 4, runwayCondition: '—', brakingAction: 'MEDIUM TO GOOD', landingCorrectionFraction: 0.1, instructorCrosswindLimitKt: 16, supported: true },
  3: { rcc: 3, runwayCondition: '—', brakingAction: 'MEDIUM', landingCorrectionFraction: 0.2, instructorCrosswindLimitKt: 13, supported: true },
  2: { rcc: 2, runwayCondition: '—', brakingAction: 'MEDIUM TO POOR', landingCorrectionFraction: 0.5, instructorCrosswindLimitKt: 7, supported: true },
  1: { rcc: 1, runwayCondition: '—', brakingAction: 'POOR', landingCorrectionFraction: 1, instructorCrosswindLimitKt: 4, supported: true },
  0: { rcc: 0, runwayCondition: '—', brakingAction: 'LESS THAN POOR', landingCorrectionFraction: null, instructorCrosswindLimitKt: null, supported: false },
};

export function getRccPerformanceRule(rcc: 0 | 1 | 2 | 3 | 4 | 5 | 6): RccPerformanceRule {
  return RCC_RULES[rcc]!;
}

export function effectiveCrosswindLimitKt(
  personalLimitKt: number,
  instructor: boolean,
  rcc: 0 | 1 | 2 | 3 | 4 | 5 | 6,
): number | null {
  if (!Number.isFinite(personalLimitKt) || personalLimitKt < 0) {
    throw new RangeError('Personal crosswind limit must be finite and non-negative');
  }
  return instructor ? getRccPerformanceRule(rcc).instructorCrosswindLimitKt : personalLimitKt;
}

export function calculateTakeoffDistanceSequence(
  uncorrectedDistanceM: number,
  parallelComponentKt: number,
) {
  const wind = calculateUtsaWindDistanceCorrection(parallelComponentKt);
  if (wind.status === 'unavailable') return wind;
  const correctedDistanceM = uncorrectedDistanceM * wind.factor;
  return {
    status: 'available' as const,
    afterWindM: correctedDistanceM,
    correctedDistanceM,
    requiredDistanceM: correctedDistanceM * TAKEOFF_PERFORMANCE_FACTOR,
    wind,
  };
}

export function calculateLandingDistanceSequence(
  uncorrectedDistanceM: number,
  parallelComponentKt: number,
  rcc: 0 | 1 | 2 | 3 | 4 | 5 | 6,
) {
  const wind = calculateUtsaWindDistanceCorrection(parallelComponentKt);
  const rccRule = getRccPerformanceRule(rcc);
  if (!rccRule.supported) return { status: 'unsupported' as const, reason: 'rcc-0' as const };
  if (wind.status === 'unavailable') return wind;
  const afterWindM = uncorrectedDistanceM * wind.factor;
  const correctedDistanceM = afterWindM * (1 + rccRule.landingCorrectionFraction!);
  return {
    status: 'available' as const,
    afterWindM,
    correctedDistanceM,
    requiredDistanceM: correctedDistanceM * LANDING_PERFORMANCE_FACTOR,
    wind,
    rccRule,
  };
}

export function resolveRunwayDirection(
  runways: readonly AerodromeRunway[],
  designator: string,
): { readonly runway: AerodromeRunway; readonly direction: RunwayDirection } | null {
  for (const runway of runways) {
    const direction = runway.directions.find((candidate) => candidate.designator === designator);
    if (direction !== undefined) return { runway, direction };
  }
  return null;
}

/** Input and derived values for the paper OFP runway-performance worksheet. */
export interface RunwayPerformanceWorksheetInput {
  readonly kind: 'takeoff' | 'landing';
  readonly runways: readonly AerodromeRunway[];
  readonly elevationFt: number | null | undefined;
  readonly qnhHpa: number | null | undefined;
  readonly temperatureC: number | null | undefined;
  readonly wind: AirportWind | undefined;
  readonly runwayDesignator: string | undefined;
  readonly runwayCondition: string | undefined;
  readonly rcc: 0 | 1 | 2 | 3 | 4 | 5 | 6 | undefined;
  readonly massKg: number;
  readonly modelSupported: boolean;
}

export interface RunwayPerformanceWorksheet {
  readonly uncorrectedDistanceM: number | null;
  /** Positive is headwind and negative is tailwind. */
  readonly headwindKt: number | null;
  readonly runwayState: string | null;
  readonly rcc: number | null;
  readonly correctionPercent: number | null;
  readonly correctedDistanceM: number | null;
  readonly performanceFactorPercent: number | null;
  readonly requiredDistanceM: number | null;
  readonly availableDistanceM: number | null;
}

/**
 * Reuses the reviewed AFM/UTSA calculation chain for one OFP worksheet.
 * Null fields are deliberate: a missing authoritative input must not create
 * a fabricated performance figure.
 */
export function calculateRunwayPerformanceWorksheet(
  input: RunwayPerformanceWorksheetInput,
): RunwayPerformanceWorksheet {
  const resolved = input.runwayDesignator === undefined || input.runwayDesignator === ''
    ? null
    : resolveRunwayDirection(input.runways, input.runwayDesignator);
  const direction = resolved?.direction;
  const rccRule = input.rcc === undefined ? undefined : getRccPerformanceRule(input.rcc);
  const pressureAltitude = input.elevationFt == null || input.qnhHpa == null
    ? null
    : calculateUtsaPressureAltitudeFt(input.elevationFt, input.qnhHpa);
  const isaDeviation = input.temperatureC == null
    ? null
    : calculateUtsaIsaDeviationC(input.temperatureC);
  const runwayHeading = direction === undefined
    ? null
    : runwayDesignatorHeadingDeg(direction.designator);
  const windComponents = runwayHeading === null || input.wind === undefined
    ? null
    : calculateRunwayWindComponents(runwayHeading, input.wind);
  const components = windComponents?.status === 'available'
    ? windComponents.components
    : null;
  const afm = !input.modelSupported || pressureAltitude === null || input.temperatureC == null ||
      !Number.isFinite(input.massKg) || input.massKg <= 0
    ? null
    : input.kind === 'takeoff'
      ? calculateZ242TakeoffDistanceTo50Ft({
          pressureAltitudeFt: pressureAltitude,
          temperatureC: input.temperatureC,
          massKg: input.massKg,
        })
      : calculateZ242HotBrakesLandingDistanceFrom50Ft({
          pressureAltitudeFt: pressureAltitude,
          temperatureC: input.temperatureC,
          massKg: input.massKg,
        });
  const uncorrectedDistanceM = afm?.status === 'available' ? afm.distanceM : null;
  const sequence = uncorrectedDistanceM === null || components === null
    ? null
    : input.kind === 'takeoff'
      ? calculateTakeoffDistanceSequence(uncorrectedDistanceM, components.parallelKt)
      : input.rcc === undefined
        ? null
        : calculateLandingDistanceSequence(
            uncorrectedDistanceM,
            components.parallelKt,
            input.rcc,
          );
  const distances = sequence?.status === 'available' ? sequence : null;
  const availableDistanceM = input.kind === 'takeoff'
    ? direction?.declaredDistances.todaM ?? null
    : direction?.declaredDistances.ldaM ?? null;
  return {
    uncorrectedDistanceM,
    headwindKt: components?.parallelKt ?? null,
    runwayState: input.runwayCondition === undefined || input.runwayCondition.trim() === ''
      ? rccRule?.runwayCondition ?? null
      : input.runwayCondition,
    rcc: input.rcc ?? null,
    correctionPercent: input.kind === 'takeoff'
      ? (input.rcc === undefined ? null : 0)
      : rccRule?.landingCorrectionFraction === null || rccRule === undefined
        ? null
        : rccRule.landingCorrectionFraction * 100,
    correctedDistanceM: distances?.correctedDistanceM ?? null,
    performanceFactorPercent: distances === null
      ? null
      : input.kind === 'takeoff' ? 25 : 43,
    requiredDistanceM: distances?.requiredDistanceM ?? null,
    availableDistanceM,
  };
}

export type Z242AfmEnvelopeBoundary =
  | 'temperature'
  | 'pressure-altitude'
  | 'mass'
  | 'entry-frame'
  | 'final-frame';

export type Z242AfmDistanceResult =
  | { readonly status: 'available'; readonly distanceM: number }
  | {
      readonly status: 'unavailable';
      readonly reason: 'outside-reviewed-envelope';
      readonly boundary: Z242AfmEnvelopeBoundary;
    };

export interface Z242AfmDistanceInput {
  readonly pressureAltitudeFt: number;
  readonly temperatureC: number;
  readonly massKg: number;
}

function validateAfmInput(input: Z242AfmDistanceInput): void {
  if (!Number.isFinite(input.pressureAltitudeFt) ||
      !Number.isFinite(input.temperatureC) ||
      !Number.isFinite(input.massKg) || input.massKg <= 0) {
    throw new RangeError('AFM inputs must be finite and mass must be positive');
  }
}

function betweenInclusive(value: number, bounds: readonly [number, number]): boolean {
  return value >= bounds[0] && value <= bounds[1];
}

function segmentIndex(value: number, coordinates: readonly number[]): number {
  for (let index = 1; index < coordinates.length; index += 1) {
    if (value <= coordinates[index]!) return index - 1;
  }
  return coordinates.length - 2;
}

/**
 * Piecewise-linear interpolation with a monotonic coordinate key. Paired
 * values may increase or decrease independently. Edge continuation is used
 * only for the reviewed weight-guide slope step.
 */
export function interpolateZ242NomogramAxis(
  coordinate: number,
  coordinates: readonly number[],
  values: readonly number[],
  continueAtEdges = false,
): number | null {
  if (coordinates.length < 2 || coordinates.length !== values.length) {
    throw new RangeError('Nomogram axes require matching arrays with at least two points');
  }
  for (let index = 0; index < coordinates.length; index += 1) {
    if (!Number.isFinite(coordinates[index]) || !Number.isFinite(values[index])) {
      throw new RangeError('Nomogram axis values must be finite');
    }
    if (index > 0 && coordinates[index]! <= coordinates[index - 1]!) {
      throw new RangeError('Nomogram coordinate keys must be strictly increasing');
    }
  }
  if (!Number.isFinite(coordinate)) throw new RangeError('Nomogram coordinate must be finite');
  if (!continueAtEdges &&
      (coordinate < coordinates[0]! || coordinate > coordinates[coordinates.length - 1]!)) {
    return null;
  }
  const index = coordinate <= coordinates[0]!
    ? 0
    : coordinate >= coordinates[coordinates.length - 1]!
      ? coordinates.length - 2
      : segmentIndex(coordinate, coordinates);
  const startCoordinate = coordinates[index]!;
  const endCoordinate = coordinates[index + 1]!;
  const fraction = (coordinate - startCoordinate) / (endCoordinate - startCoordinate);
  return values[index]! + fraction * (values[index + 1]! - values[index]!);
}

function outside(boundary: Z242AfmEnvelopeBoundary): Z242AfmDistanceResult {
  return { status: 'unavailable', reason: 'outside-reviewed-envelope', boundary };
}

function calculateZ242NomogramDistance(
  model: Z242AfmNomogramData,
  input: Z242AfmDistanceInput,
): Z242AfmDistanceResult {
  validateAfmInput(input);
  if (!betweenInclusive(input.temperatureC, model.chartBounds.temperatureC)) {
    return outside('temperature');
  }
  if (!betweenInclusive(input.pressureAltitudeFt, model.chartBounds.pressureAltitudeFt)) {
    return outside('pressure-altitude');
  }
  if (!betweenInclusive(input.massKg, model.chartBounds.massKg)) {
    return outside('mass');
  }

  const temperatureX = interpolateZ242NomogramAxis(
    input.temperatureC,
    model.temperatureAxis.valuesC,
    model.temperatureAxis.x,
  )!;
  const pressureAltitudeCoordinates = model.pressureAltitudeLines.map(
    (line) => line.pressureAltitudeFt,
  );
  const yAtPressureAltitudeLines = model.pressureAltitudeLines.map(
    (line) => line.slope * temperatureX + line.intercept,
  );
  const entryY = interpolateZ242NomogramAxis(
    input.pressureAltitudeFt,
    pressureAltitudeCoordinates,
    yAtPressureAltitudeLines,
  )!;
  const distanceFrame: readonly [number, number] = [
    model.distanceAxis.y[0]!,
    model.distanceAxis.y[model.distanceAxis.y.length - 1]!,
  ];
  if (!betweenInclusive(entryY, distanceFrame)) return outside('entry-frame');

  const massX = interpolateZ242NomogramAxis(
    input.massKg,
    model.massAxis.valuesKg,
    model.massAxis.x,
  )!;
  const guideSlope = interpolateZ242NomogramAxis(
    entryY,
    model.weightGuideLines.map((guide) => guide.entryY),
    model.weightGuideLines.map((guide) => guide.slope),
    true,
  )!;
  const finalY = entryY + guideSlope * (massX - model.weightPanelReferenceX);
  if (!betweenInclusive(finalY, distanceFrame)) return outside('final-frame');

  const distanceM = interpolateZ242NomogramAxis(
    finalY,
    model.distanceAxis.y,
    model.distanceAxis.valuesM,
  )!;
  if (!Number.isFinite(distanceM)) throw new RangeError('AFM interpolation produced a non-finite distance');
  return { status: 'available', distanceM };
}

/** Reviewed digitization of AFM Figure 5-10. */
export function calculateZ242TakeoffDistanceTo50Ft(input: Z242AfmDistanceInput): Z242AfmDistanceResult {
  return calculateZ242NomogramDistance(Z242_TAKEOFF_FIGURE_5_10, input);
}

/** Uses Figure 5-26 Hot brakes only; Figure 5-25 is intentionally excluded. */
export function calculateZ242HotBrakesLandingDistanceFrom50Ft(input: Z242AfmDistanceInput): Z242AfmDistanceResult {
  return calculateZ242NomogramDistance(Z242_LANDING_FIGURE_5_26_HOT_BRAKES, input);
}
