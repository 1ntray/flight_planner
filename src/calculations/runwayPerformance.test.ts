import { describe, expect, it } from 'vitest';

import {
  calculateLandingDistanceSequence,
  calculateRunwayWindComponents,
  calculateTakeoffDistanceSequence,
  calculateUtsaDensityAltitudeFt,
  calculateUtsaIsaDeviationC,
  calculateUtsaPressureAltitudeFt,
  calculateUtsaWindDistanceCorrection,
  calculateZ242HotBrakesLandingDistanceFrom50Ft,
  calculateZ242TakeoffDistanceTo50Ft,
  effectiveCrosswindLimitKt,
  getRccPerformanceRule,
  resolveRunwayDirection,
} from './runwayPerformance';

describe('UTSA runway atmosphere', () => {
  it('matches the supplied pressure and density altitude example', () => {
    const pressureAltitudeFt = calculateUtsaPressureAltitudeFt(250, 1003);
    const isaDeviationC = calculateUtsaIsaDeviationC(11);
    expect(pressureAltitudeFt).toBe(520);
    expect(isaDeviationC).toBe(-4);
    expect(calculateUtsaDensityAltitudeFt(pressureAltitudeFt, isaDeviationC)).toBe(40);
  });

  it('rounds ISA deviation before density altitude and handles QNH either side of 1013', () => {
    expect(calculateUtsaIsaDeviationC(16.49)).toBe(1);
    expect(calculateUtsaIsaDeviationC(16.5)).toBe(2);
    expect(calculateUtsaPressureAltitudeFt(100, 1023)).toBe(-170);
    expect(calculateUtsaPressureAltitudeFt(100, 1003)).toBe(370);
  });
});

describe('UTSA discrete wind distance correction', () => {
  it.each([
    [8.99, 1], [9, 0.9], [17.99, 0.9], [18, 0.8],
    [-8.99, 1], [-9, 1.1], [-18, 1.2],
  ])('maps parallel component %s kt to factor %s', (component, expected) => {
    expect(calculateUtsaWindDistanceCorrection(component)).toMatchObject({
      status: 'available', factor: expected,
    });
  });

  it('fails closed for a nonsensical extreme headwind', () => {
    expect(calculateUtsaWindDistanceCorrection(90)).toEqual({
      status: 'unavailable', reason: 'nonsensical-extreme-headwind',
    });
  });
});

describe('distance correction order', () => {
  it('applies tailwind then the takeoff factor', () => {
    const result = calculateTakeoffDistanceSequence(400, -12);
    expect(result.status).toBe('available');
    if (result.status === 'available') {
      expect(result.afterWindM).toBeCloseTo(440, 10);
      expect(result.correctedDistanceM).toBeCloseTo(440, 10);
      expect(result.requiredDistanceM).toBeCloseTo(550, 10);
    }
  });

  it('applies tailwind, whole-distance RCC correction, then landing factor', () => {
    const result = calculateLandingDistanceSequence(400, -12, 3);
    expect(result.status).toBe('available');
    if (result.status === 'available') {
      expect(result.afterWindM).toBeCloseTo(440, 10);
      expect(result.correctedDistanceM).toBeCloseTo(528, 10);
      expect(result.requiredDistanceM).toBeCloseTo(755.04, 10);
    }
  });
});

describe('RCC and crosswind limits', () => {
  it.each([
    [6, 0, 20], [5, 0, 20], [4, 0.1, 16], [3, 0.2, 13],
    [2, 0.5, 7], [1, 1, 4],
  ] as const)('maps RCC %s', (rcc, correction, crosswind) => {
    expect(getRccPerformanceRule(rcc)).toMatchObject({
      supported: true,
      landingCorrectionFraction: correction,
      instructorCrosswindLimitKt: crosswind,
    });
  });

  it('makes RCC 0 unsupported', () => {
    expect(getRccPerformanceRule(0)).toMatchObject({ supported: false });
    expect(calculateLandingDistanceSequence(400, 0, 0)).toEqual({
      status: 'unsupported', reason: 'rcc-0',
    });
  });

  it('keeps the personal value when instructor mode is switched', () => {
    expect(effectiveCrosswindLimitKt(9, false, 2)).toBe(9);
    expect(effectiveCrosswindLimitKt(9, true, 2)).toBe(7);
    expect(effectiveCrosswindLimitKt(9, false, 2)).toBe(9);
  });
});

describe('runway wind components', () => {
  it('uses true runway bearing for headwind, tailwind, crosswind and quartering wind', () => {
    expect(calculateRunwayWindComponents(90, { kind: 'fixed', directionFromTrueDeg: 90, speedKt: 12 })).toMatchObject({ status: 'available', components: { parallelKt: 12, crosswindKt: 0 } });
    expect(calculateRunwayWindComponents(90, { kind: 'fixed', directionFromTrueDeg: 270, speedKt: 12 })).toMatchObject({ status: 'available', components: { parallelKt: -12 } });
    const cross = calculateRunwayWindComponents(90, { kind: 'fixed', directionFromTrueDeg: 180, speedKt: 12 });
    expect(cross.status).toBe('available');
    if (cross.status === 'available') expect(Math.abs(cross.components.crosswindKt)).toBeCloseTo(12);
    const quartering = calculateRunwayWindComponents(90, { kind: 'fixed', directionFromTrueDeg: 135, speedKt: Math.SQRT2 * 10 });
    expect(quartering.status).toBe('available');
    if (quartering.status === 'available') {
      expect(quartering.components.parallelKt).toBeCloseTo(10);
      expect(quartering.components.crosswindKt).toBeCloseTo(10);
    }
  });

  it('keeps base and gust components separate', () => {
    const result = calculateRunwayWindComponents(0, { kind: 'fixed', directionFromTrueDeg: 90, speedKt: 8, gustKt: 15 });
    expect(result).toMatchObject({ status: 'available' });
    if (result.status === 'available') {
      expect(Math.abs(result.components.crosswindKt)).toBeCloseTo(8);
      expect(Math.abs(result.components.gustCrosswindKt!)).toBeCloseTo(15);
    }
  });

  it('does not invent a direction for variable wind', () => {
    expect(calculateRunwayWindComponents(0, { kind: 'variable', speedKt: 8 })).toEqual({
      status: 'unavailable', reason: 'variable-wind',
    });
  });
});

describe('runway source resolution and AFM safety boundary', () => {
  const runways = [{
    identifier: '10/28', lengthM: 2000,
    directions: [
      { designator: '10', trueBearingDeg: 104, declaredDistances: { toraM: 1900, todaM: 2000, asdaM: 1900, ldaM: 1800 } },
      { designator: '28', trueBearingDeg: 284, declaredDistances: { toraM: 1800, todaM: 1900, asdaM: 1800, ldaM: null } },
    ],
  }];

  it('resolves the exact published direction and never substitutes physical length', () => {
    expect(resolveRunwayDirection(runways, '10')?.direction).toMatchObject({ trueBearingDeg: 104, declaredDistances: { todaM: 2000, ldaM: 1800 } });
    expect(resolveRunwayDirection(runways, '28')?.direction.declaredDistances.ldaM).toBeNull();
  });

  it('fails closed until reviewed AFM graph values exist', () => {
    const input = { pressureAltitudeFt: 500, isaDeviationC: -4, massKg: 900 };
    expect(calculateZ242TakeoffDistanceTo50Ft(input)).toEqual({ status: 'unavailable', reason: 'reviewed-digitization-required' });
    expect(calculateZ242HotBrakesLandingDistanceFrom50Ft(input)).toEqual({ status: 'unavailable', reason: 'reviewed-digitization-required' });
  });
});
