import type { AerodromeRunway, RunwayDirection } from '../domain';
import type { AirportWind } from '../weather';

export const DEFAULT_PERSONAL_CROSSWIND_LIMIT_KT = 9;
export const TAKEOFF_PERFORMANCE_FACTOR = 1.25;
export const LANDING_PERFORMANCE_FACTOR = 1.43;

export interface RunwayPerformanceModelProvenance {
  readonly aircraft: 'ZLIN Z242L';
  readonly takeoffSource: 'AFM Figure 5-10, take-off distance to 50 ft (15 m)';
  readonly landingSource: 'AFM Figure 5-26, landing distance from 50 ft (15 m), Hot brakes';
  readonly brakingSource: 'UTSA OM-C 4.7.1';
  readonly methodSource: 'UTSA Operational Flightplan v2.0, 10.08.2026';
}

export const Z242L_RUNWAY_PERFORMANCE_PROVENANCE: RunwayPerformanceModelProvenance = {
  aircraft: 'ZLIN Z242L',
  takeoffSource: 'AFM Figure 5-10, take-off distance to 50 ft (15 m)',
  landingSource: 'AFM Figure 5-26, landing distance from 50 ft (15 m), Hot brakes',
  brakingSource: 'UTSA OM-C 4.7.1',
  methodSource: 'UTSA Operational Flightplan v2.0, 10.08.2026',
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

export function calculateRunwayWindComponents(
  runwayTrueBearingDeg: number,
  wind: AirportWind,
): RunwayWindComponentResult {
  if (!Number.isFinite(runwayTrueBearingDeg)) {
    throw new RangeError('Runway bearing must be finite');
  }
  if (wind.kind === 'variable') return { status: 'unavailable', reason: 'variable-wind' };
  if (wind.kind === 'calm') {
    return { status: 'available', components: { parallelKt: 0, crosswindKt: 0 } };
  }
  const angleRad = (wind.directionFromTrueDeg - runwayTrueBearingDeg) * Math.PI / 180;
  const components: RunwayWindComponents = {
    parallelKt: wind.speedKt * Math.cos(angleRad),
    crosswindKt: wind.speedKt * Math.sin(angleRad),
    ...(wind.gustKt === undefined ? {} : {
      gustParallelKt: wind.gustKt * Math.cos(angleRad),
      gustCrosswindKt: wind.gustKt * Math.sin(angleRad),
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
  5: { rcc: 5, runwayCondition: '—', brakingAction: 'GOOD', landingCorrectionFraction: 0, instructorCrosswindLimitKt: 20, supported: true },
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

export type Z242AfmDistanceResult = {
  readonly status: 'unavailable';
  readonly reason: 'reviewed-digitization-required';
};

export interface Z242AfmDistanceInput {
  readonly pressureAltitudeFt: number;
  readonly isaDeviationC: number;
  readonly massKg: number;
}

function validateAfmInput(input: Z242AfmDistanceInput): void {
  if (!Number.isFinite(input.pressureAltitudeFt) ||
      !Number.isFinite(input.isaDeviationC) ||
      !Number.isFinite(input.massKg) || input.massKg <= 0) {
    throw new RangeError('AFM inputs must be finite and mass must be positive');
  }
}

/**
 * The supplied AFM pages are scanned raster nomograms. No reviewed numeric
 * control-point set was supplied, so this fail-closed boundary deliberately
 * refuses to manufacture operational distances from OCR or pixel estimates.
 */
export function calculateZ242TakeoffDistanceTo50Ft(input: Z242AfmDistanceInput): Z242AfmDistanceResult {
  validateAfmInput(input);
  return { status: 'unavailable', reason: 'reviewed-digitization-required' };
}

/** Uses Figure 5-26 Hot brakes only; Figure 5-25 is intentionally excluded. */
export function calculateZ242HotBrakesLandingDistanceFrom50Ft(input: Z242AfmDistanceInput): Z242AfmDistanceResult {
  validateAfmInput(input);
  return { status: 'unavailable', reason: 'reviewed-digitization-required' };
}
