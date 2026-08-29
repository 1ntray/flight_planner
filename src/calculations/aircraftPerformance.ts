import type {
  AerodromePlanningWeather,
  ClimbRateModel,
  PlanningEnvironment,
} from '../domain';

export const PERFORMANCE_ALTITUDE_STEP_FT = 100;
export const PATTERN_ALTITUDE_ROUNDING_FT = 100;

export interface VerticalInterval {
  readonly startAltitudeFt: number;
  readonly endAltitudeFt: number;
  readonly representativeAltitudeFt: number;
  readonly durationMinutes: number;
}

export interface ClimbCalculation {
  readonly status: 'ok';
  readonly timeMinutes: number;
  readonly intervals: readonly VerticalInterval[];
}

export interface ImpossibleClimbCalculation {
  readonly status: 'impossible';
  readonly reason: 'non-positive-climb-rate';
  readonly altitudeFt: number;
  readonly rocFtPerMin: number;
}

export type ClimbCalculationResult =
  | ClimbCalculation
  | ImpossibleClimbCalculation;

function requireFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be a finite number`);
  }
}

function validateClimbRateModel(model: ClimbRateModel): void {
  requireFinite(
    model.isaAltitudeFactorFtPerC,
    'Climb-rate ISA altitude factor',
  );
  requireFinite(model.referenceMassKg, 'Climb-rate reference mass');
  requireFinite(model.baseRateFtPerMin, 'Climb-rate base rate');
  requireFinite(
    model.altitudeCoefficientPerFt,
    'Climb-rate altitude coefficient',
  );
  requireFinite(
    model.massCoefficientPerKg,
    'Climb-rate mass coefficient',
  );
  requireFinite(
    model.altitudeMassCoefficientPerFtKg,
    'Climb-rate altitude-mass coefficient',
  );

  if (model.referenceMassKg <= 0) {
    throw new RangeError('Climb-rate reference mass must be greater than zero');
  }
}

export function calculatePatternAltitudeFtMsl(
  aerodromeElevationFtMsl: number,
  patternHeightAglFt: number,
): number {
  requireFinite(aerodromeElevationFtMsl, 'Aerodrome elevation');
  requireFinite(patternHeightAglFt, 'Pattern height');

  return Math.round(
    (aerodromeElevationFtMsl + patternHeightAglFt) /
      PATTERN_ALTITUDE_ROUNDING_FT,
  ) * PATTERN_ALTITUDE_ROUNDING_FT;
}

export function calculateClimbRate(
  altitudeFt: number,
  isaDeviationC: number,
  massKg: number,
  model: ClimbRateModel,
): number {
  requireFinite(altitudeFt, 'Altitude');
  requireFinite(isaDeviationC, 'ISA deviation');
  requireFinite(massKg, 'Aircraft mass');
  validateClimbRateModel(model);

  if (massKg <= 0) {
    throw new RangeError('Aircraft mass must be greater than zero');
  }

  const effectiveAltitudeFt =
    altitudeFt + model.isaAltitudeFactorFtPerC * isaDeviationC;
  const massDifferenceKg = massKg - model.referenceMassKg;

  return (
    model.baseRateFtPerMin +
    model.altitudeCoefficientPerFt * effectiveAltitudeFt +
    model.massCoefficientPerKg * massDifferenceKg +
    model.altitudeMassCoefficientPerFtKg *
      effectiveAltitudeFt *
      massDifferenceKg
  );
}

export function calculateClimbTime(
  startAltitudeFt: number,
  endAltitudeFt: number,
  isaDeviationC: number,
  massKg: number,
  model: ClimbRateModel,
): ClimbCalculationResult {
  requireFinite(startAltitudeFt, 'Start altitude');
  requireFinite(endAltitudeFt, 'End altitude');
  requireFinite(isaDeviationC, 'ISA deviation');
  requireFinite(massKg, 'Aircraft mass');

  if (endAltitudeFt <= startAltitudeFt) {
    return { status: 'ok', timeMinutes: 0, intervals: [] };
  }

  const intervals: VerticalInterval[] = [];
  let altitudeFt = startAltitudeFt;
  let timeMinutes = 0;

  while (altitudeFt < endAltitudeFt) {
    const rocFtPerMin = calculateClimbRate(
      altitudeFt,
      isaDeviationC,
      massKg,
      model,
    );

    if (rocFtPerMin <= 0) {
      return {
        status: 'impossible',
        reason: 'non-positive-climb-rate',
        altitudeFt,
        rocFtPerMin,
      };
    }

    const altitudeGainFt = Math.min(
      PERFORMANCE_ALTITUDE_STEP_FT,
      endAltitudeFt - altitudeFt,
    );
    const intervalEndAltitudeFt = altitudeFt + altitudeGainFt;
    const durationMinutes = altitudeGainFt / rocFtPerMin;

    intervals.push({
      startAltitudeFt: altitudeFt,
      endAltitudeFt: intervalEndAltitudeFt,
      representativeAltitudeFt:
        altitudeFt + altitudeGainFt / 2,
      durationMinutes,
    });
    timeMinutes += durationMinutes;
    altitudeFt = intervalEndAltitudeFt;
  }

  return { status: 'ok', timeMinutes, intervals };
}

export function calculateTasFromIas(
  iasKt: number,
  altitudeFt: number,
  qnhHpa: number,
  isaDeviationC: number,
): number {
  requireFinite(iasKt, 'IAS');
  requireFinite(altitudeFt, 'Altitude');
  requireFinite(qnhHpa, 'QNH');
  requireFinite(isaDeviationC, 'ISA deviation');

  if (iasKt <= 0) {
    throw new RangeError('IAS must be greater than zero');
  }

  if (qnhHpa <= 0) {
    throw new RangeError('QNH must be greater than zero');
  }

  const pressureBase = 1 - altitudeFt / 145366.45;

  if (pressureBase <= 0) {
    throw new RangeError('Altitude is outside the supplied IAS-to-TAS model');
  }

  const pressureRatio =
    (qnhHpa / 1013.25) * pressureBase ** 5.25588;
  const pressureAltitudeFt =
    145366.45 * (1 - pressureRatio ** (1 / 5.25588));
  const temperatureK =
    288.15 - 0.0019812 * pressureAltitudeFt + isaDeviationC;
  const densityRatio = pressureRatio * 288.15 / temperatureK;

  if (temperatureK <= 0 || densityRatio <= 0 || !Number.isFinite(densityRatio)) {
    throw new RangeError('IAS-to-TAS conditions produce an invalid air density');
  }

  return iasKt / Math.sqrt(densityRatio);
}

export function calculateDescentTime(
  startAltitudeFt: number,
  endAltitudeFt: number,
  descentRateFtPerMin: number,
): number {
  requireFinite(startAltitudeFt, 'Start altitude');
  requireFinite(endAltitudeFt, 'End altitude');
  requireFinite(descentRateFtPerMin, 'Descent rate');

  if (descentRateFtPerMin <= 0) {
    throw new RangeError('Descent rate must be greater than zero');
  }

  return startAltitudeFt <= endAltitudeFt
    ? 0
    : (startAltitudeFt - endAltitudeFt) / descentRateFtPerMin;
}

export function createDescentIntervals(
  startAltitudeFt: number,
  endAltitudeFt: number,
  descentRateFtPerMin: number,
): VerticalInterval[] {
  const totalTimeMinutes = calculateDescentTime(
    startAltitudeFt,
    endAltitudeFt,
    descentRateFtPerMin,
  );

  if (totalTimeMinutes === 0) {
    return [];
  }

  const intervals: VerticalInterval[] = [];
  let altitudeFt = startAltitudeFt;

  while (altitudeFt > endAltitudeFt) {
    const altitudeLossFt = Math.min(
      PERFORMANCE_ALTITUDE_STEP_FT,
      altitudeFt - endAltitudeFt,
    );
    const intervalEndAltitudeFt = altitudeFt - altitudeLossFt;

    intervals.push({
      startAltitudeFt: altitudeFt,
      endAltitudeFt: intervalEndAltitudeFt,
      representativeAltitudeFt:
        altitudeFt - altitudeLossFt / 2,
      durationMinutes: altitudeLossFt / descentRateFtPerMin,
    });
    altitudeFt = intervalEndAltitudeFt;
  }

  return intervals;
}

export function calculatePhaseFuel(
  timeMinutes: number,
  fuelFlowLph: number,
): number {
  requireFinite(timeMinutes, 'Phase time');
  requireFinite(fuelFlowLph, 'Fuel flow');

  if (timeMinutes < 0) {
    throw new RangeError('Phase time must not be negative');
  }

  if (fuelFlowLph < 0) {
    throw new RangeError('Fuel flow must not be negative');
  }

  return timeMinutes / 60 * fuelFlowLph;
}

export function calculatePlanningEnvironment(
  departure: AerodromePlanningWeather,
  destination: AerodromePlanningWeather,
): PlanningEnvironment {
  requireFinite(departure.qnhHpa, 'Departure QNH');
  requireFinite(destination.qnhHpa, 'Destination QNH');
  requireFinite(departure.isaDeviationC, 'Departure ISA deviation');
  requireFinite(destination.isaDeviationC, 'Destination ISA deviation');

  if (departure.qnhHpa <= 0 || destination.qnhHpa <= 0) {
    throw new RangeError('Aerodrome QNH must be greater than zero');
  }

  return {
    qnhHpa: (departure.qnhHpa + destination.qnhHpa) / 2,
    isaDeviationC:
      (departure.isaDeviationC + destination.isaDeviationC) / 2,
  };
}
