import { describe, expect, it } from 'vitest';

import { PROJECT_AIRCRAFT_PERFORMANCE_PROFILE } from '../domain';

import {
  calculateClimbRate,
  calculateClimbTime,
  calculateDescentTime,
  calculatePhaseFuel,
  calculatePlanningEnvironment,
  calculateTasFromIas,
  createDescentIntervals,
} from './aircraftPerformance';

const climbRateModel = PROJECT_AIRCRAFT_PERFORMANCE_PROFILE.climb.rateModel;
const climbRate = (altitudeFt: number, isaDeviationC: number, massKg: number) =>
  calculateClimbRate(altitudeFt, isaDeviationC, massKg, climbRateModel);
const climbTime = (
  startAltitudeFt: number,
  endAltitudeFt: number,
  isaDeviationC: number,
  massKg: number,
) => calculateClimbTime(
  startAltitudeFt,
  endAltitudeFt,
  isaDeviationC,
  massKg,
  climbRateModel,
);

describe('project aircraft performance', () => {
  describe('calculateClimbRate', () => {
    it('uses the supplied 820 kg ISA reference formula', () => {
      expect(climbRate(0, 0, 820)).toBe(1210);
      expect(climbRate(5000, 0, 820)).toBe(975);
    });

    it('reduces ROC with altitude, mass, and positive ISA deviation', () => {
      const reference = climbRate(3000, 0, 820);

      expect(climbRate(5000, 0, 820)).toBeLessThan(reference);
      expect(climbRate(3000, 0, 900)).toBeLessThan(reference);
      expect(climbRate(3000, 10, 820)).toBeLessThan(reference);
      expect(climbRate(3000, -10, 820)).toBeGreaterThan(reference);
    });

    it('returns zero or negative ROC without clamping', () => {
      expect(climbRate(30_000, 0, 820)).toBeLessThan(0);
    });

    it('uses the supplied aircraft coefficients rather than hidden constants', () => {
      expect(calculateClimbRate(0, 0, 820, {
        ...climbRateModel,
        baseRateFtPerMin: 900,
      })).toBe(900);
    });

    it('rejects an invalid aircraft coefficient explicitly', () => {
      expect(() => calculateClimbRate(0, 0, 820, {
        ...climbRateModel,
        altitudeCoefficientPerFt: Number.NaN,
      })).toThrow('Climb-rate altitude coefficient must be a finite number');
    });
  });

  describe('calculateClimbTime', () => {
    it('returns zero for no altitude gain', () => {
      expect(climbTime(3000, 3000, 0, 820)).toEqual({
        status: 'ok',
        timeMinutes: 0,
        intervals: [],
      });
    });

    it('uses a partial final interval without overshooting', () => {
      const result = climbTime(0, 250, 0, 820);

      expect(result.status).toBe('ok');
      if (result.status === 'ok') {
        expect(result.intervals.map((interval) => interval.endAltitudeFt))
          .toEqual([100, 200, 250]);
        expect(result.intervals.at(-1)?.durationMinutes).toBe(
          50 / climbRate(200, 0, 820),
        );
      }
    });

    it('takes longer with greater mass and positive ISA deviation', () => {
      const reference = climbTime(0, 5000, 0, 820);
      const heavy = climbTime(0, 5000, 0, 900);
      const hot = climbTime(0, 5000, 10, 820);

      expect(reference.status).toBe('ok');
      expect(heavy.status).toBe('ok');
      expect(hot.status).toBe('ok');
      if (
        reference.status === 'ok' &&
        heavy.status === 'ok' &&
        hot.status === 'ok'
      ) {
        expect(heavy.timeMinutes).toBeGreaterThan(reference.timeMinutes);
        expect(hot.timeMinutes).toBeGreaterThan(reference.timeMinutes);
      }
    });

    it('returns an explicit impossible result instead of Infinity or NaN', () => {
      const result = climbTime(29_000, 31_000, 0, 820);

      expect(result).toMatchObject({
        status: 'impossible',
        reason: 'non-positive-climb-rate',
      });
      if (result.status === 'impossible') {
        expect(Number.isFinite(result.rocFtPerMin)).toBe(true);
      }
    });
  });

  describe('calculateTasFromIas', () => {
    it('returns IAS at the sea-level ISA reference case', () => {
      expect(calculateTasFromIas(80, 0, 1013.25, 0)).toBeCloseTo(80, 12);
    });

    it('increases TAS with altitude for equal IAS', () => {
      expect(calculateTasFromIas(103, 8000, 1013.25, 0)).toBeGreaterThan(
        calculateTasFromIas(103, 2000, 1013.25, 0),
      );
    });

    it('responds to QNH and ISA deviation using the supplied formula', () => {
      const reference = calculateTasFromIas(103, 5000, 1013.25, 0);

      expect(calculateTasFromIas(103, 5000, 990, 0)).not.toBeCloseTo(
        reference,
        10,
      );
      expect(calculateTasFromIas(103, 5000, 1013.25, 10)).toBeGreaterThan(
        reference,
      );
    });

    it('uses the authoritative IAS values for every phase', () => {
      const profile = PROJECT_AIRCRAFT_PERFORMANCE_PROFILE;

      expect(profile.climb.iasKt).toBe(80);
      expect(profile.cruise.iasKt).toBe(103);
      expect(profile.descent.iasKt).toBe(103);
      expect(calculateTasFromIas(profile.climb.iasKt, 3000, 1013.25, 0))
        .toBeLessThan(
          calculateTasFromIas(profile.cruise.iasKt, 3000, 1013.25, 0),
        );
    });
  });

  describe('environment, descent, and fuel', () => {
    it('averages departure and destination weather arithmetically', () => {
      expect(
        calculatePlanningEnvironment(
          { qnhHpa: 1000, isaDeviationC: -4 },
          { qnhHpa: 1020, isaDeviationC: 8 },
        ),
      ).toEqual({ qnhHpa: 1010, isaDeviationC: 2 });
      expect(
        calculatePlanningEnvironment(
          { qnhHpa: 1013, isaDeviationC: 3 },
          { qnhHpa: 1013, isaDeviationC: 3 },
        ),
      ).toEqual({ qnhHpa: 1013, isaDeviationC: 3 });
    });

    it('calculates descent time and its final partial interval', () => {
      expect(calculateDescentTime(2000, 1000, 500)).toBe(2);
      expect(calculateDescentTime(1000, 1000, 500)).toBe(0);
      expect(createDescentIntervals(1250, 1000, 500).map((interval) =>
        interval.endAltitudeFt)).toEqual([1150, 1050, 1000]);
    });

    it.each([
      ['climb', 61],
      ['cruise', 36],
      ['descent', 26.5],
    ])('calculates 60 minutes of %s fuel', (_phase, flowLph) => {
      expect(calculatePhaseFuel(60, flowLph)).toBe(flowLph);
    });
  });
});
