import { describe, expect, it } from 'vitest';

import {
  calculateLandingDistanceSequence,
  calculateRunwayPerformanceWorksheet,
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
  interpolateZ242NomogramAxis,
  resolveRunwayDirection,
  runwayDesignatorHeadingDeg,
  Z242L_RUNWAY_PERFORMANCE_PROVENANCE,
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

  it('provides the reviewed default runway state for RCC 6 and RCC 5', () => {
    expect(getRccPerformanceRule(6).runwayCondition).toBe('DRY');
    expect(getRccPerformanceRule(5).runwayCondition).toBe('WET');
  });

  it('keeps the personal value when instructor mode is switched', () => {
    expect(effectiveCrosswindLimitKt(9, false, 2)).toBe(9);
    expect(effectiveCrosswindLimitKt(9, true, 2)).toBe(7);
    expect(effectiveCrosswindLimitKt(9, false, 2)).toBe(9);
  });
});

describe('runway wind components', () => {
  it('converts runway designators to the nominal OFP heading', () => {
    expect(runwayDesignatorHeadingDeg('10')).toBe(100);
    expect(runwayDesignatorHeadingDeg('28L')).toBe(280);
    expect(runwayDesignatorHeadingDeg('36')).toBe(360);
    expect(runwayDesignatorHeadingDeg('00')).toBeNull();
    expect(runwayDesignatorHeadingDeg('north')).toBeNull();
  });

  it('uses the nominal runway heading and rounds components to whole knots', () => {
    expect(calculateRunwayWindComponents(90, { kind: 'fixed', directionFromTrueDeg: 90, speedKt: 12 })).toMatchObject({ status: 'available', components: { parallelKt: 12, crosswindKt: 0 } });
    expect(calculateRunwayWindComponents(90, { kind: 'fixed', directionFromTrueDeg: 270, speedKt: 12 })).toMatchObject({ status: 'available', components: { parallelKt: -12 } });
    const cross = calculateRunwayWindComponents(90, { kind: 'fixed', directionFromTrueDeg: 180, speedKt: 12 });
    expect(cross.status).toBe('available');
    if (cross.status === 'available') expect(Math.abs(cross.components.crosswindKt)).toBe(12);
    const quartering = calculateRunwayWindComponents(90, { kind: 'fixed', directionFromTrueDeg: 135, speedKt: Math.SQRT2 * 10 });
    expect(quartering.status).toBe('available');
    if (quartering.status === 'available') {
      expect(quartering.components.parallelKt).toBe(10);
      expect(quartering.components.crosswindKt).toBe(10);
    }
    expect(calculateRunwayWindComponents(100, { kind: 'fixed', directionFromTrueDeg: 150, speedKt: 20 })).toMatchObject({
      status: 'available',
      components: { parallelKt: 13, crosswindKt: 15 },
    });
  });

  it('keeps base and gust components separate', () => {
    const result = calculateRunwayWindComponents(0, { kind: 'fixed', directionFromTrueDeg: 90, speedKt: 8, gustKt: 15 });
    expect(result).toMatchObject({ status: 'available' });
    if (result.status === 'available') {
      expect(Math.abs(result.components.crosswindKt)).toBe(8);
      expect(Math.abs(result.components.gustCrosswindKt!)).toBe(15);
    }
  });

  it('does not invent a direction for variable wind', () => {
    expect(calculateRunwayWindComponents(0, { kind: 'variable', speedKt: 8 })).toEqual({
      status: 'unavailable', reason: 'variable-wind',
    });
  });
});

describe('runway source resolution', () => {
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

});

describe('OFP runway-performance worksheet', () => {
  const runways = [{
    identifier: '10/28', lengthM: 2000,
    directions: [
      { designator: '10', trueBearingDeg: 104, declaredDistances: { toraM: 1900, todaM: 2000, asdaM: 1900, ldaM: 1800 } },
      { designator: '28', trueBearingDeg: 284, declaredDistances: { toraM: 1800, todaM: 1900, asdaM: 1800, ldaM: null } },
    ],
  }];

  it('reuses the reviewed chain and leaves only unavailable worksheet fields blank', () => {
    const worksheet = calculateRunwayPerformanceWorksheet({
      kind: 'takeoff',
      runways,
      elevationFt: 250,
      qnhHpa: 1013,
      temperatureC: 15,
      wind: { kind: 'fixed', directionFromTrueDeg: 104, speedKt: 10 },
      runwayDesignator: '10',
      runwayCondition: 'DRY',
      rcc: 6,
      massKg: 950,
      modelSupported: true,
    });

    expect(worksheet).toMatchObject({
      headwindKt: 10,
      runwayState: 'DRY',
      rcc: 6,
      correctionPercent: 0,
      performanceFactorPercent: 25,
      availableDistanceM: 2000,
    });
    expect(worksheet.uncorrectedDistanceM).toBeTypeOf('number');
    expect(worksheet.correctedDistanceM).toBeTypeOf('number');
    expect(worksheet.requiredDistanceM).toBeTypeOf('number');
  });

  it('does not fabricate performance distances when authoritative inputs are absent', () => {
    const worksheet = calculateRunwayPerformanceWorksheet({
      kind: 'landing',
      runways,
      elevationFt: 250,
      qnhHpa: 1013,
      temperatureC: null,
      wind: undefined,
      runwayDesignator: '10',
      runwayCondition: undefined,
      rcc: undefined,
      massKg: 900,
      modelSupported: true,
    });

    expect(worksheet).toMatchObject({
      uncorrectedDistanceM: null,
      headwindKt: null,
      rcc: null,
      correctedDistanceM: null,
      requiredDistanceM: null,
      availableDistanceM: 1800,
    });
  });
});

describe('reviewed Z242L AFM nomogram interpolation', () => {
  const takeoffCases = [
    [0, 20, 1050, 534],
    [3000, 15, 1050, 666],
    [3000, 0, 1000, 541],
    [6000, 0, 1000, 700],
    [9000, -10, 950, 757],
    [12000, -20, 900, 823],
  ] as const;
  const landingCases = [
    [0, 20, 1050, 546],
    [3000, 15, 1050, 605],
    [3000, 0, 1000, 544],
    [6000, 0, 1000, 616],
    [9000, -10, 950, 639],
    [12000, -20, 900, 662],
  ] as const;

  it.each(takeoffCases)(
    'matches Figure 5-10 at PA %i ft, OAT %i C, mass %i kg',
    (pressureAltitudeFt, temperatureC, massKg, expectedDistanceM) => {
      const result = calculateZ242TakeoffDistanceTo50Ft({
        pressureAltitudeFt,
        temperatureC,
        massKg,
      });
      expect(result.status).toBe('available');
      if (result.status === 'available') {
        expect(Math.abs(result.distanceM - expectedDistanceM)).toBeLessThanOrEqual(10);
      }
    },
  );

  it.each(landingCases)(
    'matches Figure 5-26 Hot brakes at PA %i ft, OAT %i C, mass %i kg',
    (pressureAltitudeFt, temperatureC, massKg, expectedDistanceM) => {
      const result = calculateZ242HotBrakesLandingDistanceFrom50Ft({
        pressureAltitudeFt,
        temperatureC,
        massKg,
      });
      expect(result.status).toBe('available');
      if (result.status === 'available') {
        expect(Math.abs(result.distanceM - expectedDistanceM)).toBeLessThanOrEqual(10);
      }
    },
  );

  it('reproduces exact axis nodes and interpolates paired values in either direction', () => {
    expect(interpolateZ242NomogramAxis(0, [0, 10, 20], [100, 80, 50])).toBe(100);
    expect(interpolateZ242NomogramAxis(10, [0, 10, 20], [100, 80, 50])).toBe(80);
    expect(interpolateZ242NomogramAxis(20, [0, 10, 20], [100, 80, 50])).toBe(50);
    expect(interpolateZ242NomogramAxis(5, [0, 10, 20], [100, 80, 50])).toBe(90);
    expect(interpolateZ242NomogramAxis(15, [0, 10, 20], [100, 80, 50])).toBe(65);
    expect(interpolateZ242NomogramAxis(-1, [0, 10], [100, 80])).toBeNull();
  });

  it('interpolates between temperature ticks, pressure-altitude lines, and mass ticks', () => {
    const betweenTemperatureTicks = calculateZ242TakeoffDistanceTo50Ft({ pressureAltitudeFt: 3000, temperatureC: 5, massKg: 1000 });
    const betweenPressureAltitudeLines = calculateZ242TakeoffDistanceTo50Ft({ pressureAltitudeFt: 4500, temperatureC: 0, massKg: 1000 });
    const betweenMassTicks = calculateZ242TakeoffDistanceTo50Ft({ pressureAltitudeFt: 3000, temperatureC: 0, massKg: 975 });
    expect(betweenTemperatureTicks).toMatchObject({ status: 'available' });
    expect(betweenPressureAltitudeLines).toMatchObject({ status: 'available' });
    expect(betweenMassTicks).toMatchObject({ status: 'available' });
    if (betweenTemperatureTicks.status === 'available') {
      expect(betweenTemperatureTicks.distanceM).toBeCloseTo(563.0753885515359, 10);
    }
    if (betweenPressureAltitudeLines.status === 'available') {
      expect(betweenPressureAltitudeLines.distanceM).toBeCloseTo(623.6314872904723, 10);
    }
    if (betweenMassTicks.status === 'available') {
      expect(betweenMassTicks.distanceM).toBeCloseTo(512.7768201652495, 10);
    }
  });

  it.each([
    [-61, 'temperature'],
    [51, 'temperature'],
  ] as const)('rejects takeoff temperature %i C outside the chart', (temperatureC, boundary) => {
    expect(calculateZ242TakeoffDistanceTo50Ft({ pressureAltitudeFt: 3000, temperatureC, massKg: 1000 })).toEqual({
      status: 'unavailable', reason: 'outside-reviewed-envelope', boundary,
    });
  });

  it.each([-51, 51])('rejects landing temperature %i C outside the chart', (temperatureC) => {
    expect(calculateZ242HotBrakesLandingDistanceFrom50Ft({ pressureAltitudeFt: 3000, temperatureC, massKg: 1000 })).toEqual({
      status: 'unavailable', reason: 'outside-reviewed-envelope', boundary: 'temperature',
    });
  });

  it.each([-1, 12001])('rejects pressure altitude %i ft outside the chart', (pressureAltitudeFt) => {
    expect(calculateZ242TakeoffDistanceTo50Ft({ pressureAltitudeFt, temperatureC: 0, massKg: 1000 })).toEqual({
      status: 'unavailable', reason: 'outside-reviewed-envelope', boundary: 'pressure-altitude',
    });
  });

  it.each([
    [calculateZ242TakeoffDistanceTo50Ft, 799],
    [calculateZ242TakeoffDistanceTo50Ft, 1101],
    [calculateZ242HotBrakesLandingDistanceFrom50Ft, 849],
    [calculateZ242HotBrakesLandingDistanceFrom50Ft, 1051],
  ] as const)('rejects mass outside the figure-specific chart', (calculate, massKg) => {
    expect(calculate({ pressureAltitudeFt: 3000, temperatureC: 0, massKg })).toEqual({
      status: 'unavailable', reason: 'outside-reviewed-envelope', boundary: 'mass',
    });
  });

  it('rejects an entry coordinate outside the printed distance frame', () => {
    expect(calculateZ242TakeoffDistanceTo50Ft({ pressureAltitudeFt: 12000, temperatureC: 50, massKg: 1100 })).toEqual({
      status: 'unavailable', reason: 'outside-reviewed-envelope', boundary: 'entry-frame',
    });
  });

  it('rejects a weight-adjusted coordinate outside the printed distance frame', () => {
    expect(calculateZ242TakeoffDistanceTo50Ft({ pressureAltitudeFt: 0, temperatureC: 0, massKg: 800 })).toEqual({
      status: 'unavailable', reason: 'outside-reviewed-envelope', boundary: 'final-frame',
    });
  });

  it('continues the nearest reviewed guide slope only inside the printed frame', () => {
    expect(interpolateZ242NomogramAxis(0, [10, 20, 30], [1, 2, 4], true)).toBe(0);
    expect(interpolateZ242NomogramAxis(40, [10, 20, 30], [1, 2, 4], true)).toBe(6);
    expect(calculateZ242TakeoffDistanceTo50Ft({ pressureAltitudeFt: 0, temperatureC: 0, massKg: 1100 }).status).toBe('available');
    expect(calculateZ242HotBrakesLandingDistanceFrom50Ft({ pressureAltitudeFt: 12000, temperatureC: 0, massKg: 1050 }).status).toBe('available');
  });

  it('rejects invalid numeric inputs without returning NaN or infinity', () => {
    expect(() => calculateZ242TakeoffDistanceTo50Ft({ pressureAltitudeFt: Number.NaN, temperatureC: 0, massKg: 1000 })).toThrow(RangeError);
    expect(() => calculateZ242TakeoffDistanceTo50Ft({ pressureAltitudeFt: 0, temperatureC: Number.POSITIVE_INFINITY, massKg: 1000 })).toThrow(RangeError);
    expect(() => calculateZ242TakeoffDistanceTo50Ft({ pressureAltitudeFt: 0, temperatureC: 0, massKg: 0 })).toThrow(RangeError);
    for (const [pressureAltitudeFt, temperatureC, massKg] of [...takeoffCases, ...landingCases]) {
      const result = calculateZ242TakeoffDistanceTo50Ft({ pressureAltitudeFt, temperatureC, massKg });
      if (result.status === 'available') expect(Number.isFinite(result.distanceM)).toBe(true);
    }
  });

  it('records the reviewed representation revisions and excludes Figure 5-25', () => {
    expect(Z242L_RUNWAY_PERFORMANCE_PROVENANCE.takeoffRepresentationRevision).toBe('z242l-afm-fig-5-10-v1');
    expect(Z242L_RUNWAY_PERFORMANCE_PROVENANCE.landingRepresentationRevision).toBe('z242l-afm-fig-5-26-hot-brakes-v1');
    expect(Z242L_RUNWAY_PERFORMANCE_PROVENANCE.landingSource).toContain('Figure 5-26');
    expect(Z242L_RUNWAY_PERFORMANCE_PROVENANCE.landingSource).not.toContain('Figure 5-25');
  });
});
