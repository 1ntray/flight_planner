import { describe, expect, it } from 'vitest';

import { calculateWindAdjustedLeg, SECONDS_PER_HOUR } from './navigation';

describe('calculateWindAdjustedLeg', () => {
  it('keeps heading and groundspeed equal to track and TAS in calm wind', () => {
    const result = calculateWindAdjustedLeg({
      trueTrackDeg: 45,
      distanceNm: 50,
      trueAirspeedKt: 100,
      wind: { directionFromTrueDeg: 0, speedKt: 0 },
    });

    expect(result).toEqual({
      status: 'ok',
      windCorrectionDeg: 0,
      trueHeadingDeg: 45,
      groundSpeedKt: 100,
      eetSeconds: (50 / 100) * SECONDS_PER_HOUR,
    });
  });

  it('subtracts a direct headwind from groundspeed', () => {
    const result = calculateWindAdjustedLeg({
      trueTrackDeg: 0,
      distanceNm: 60,
      trueAirspeedKt: 100,
      wind: { directionFromTrueDeg: 0, speedKt: 20 },
    });

    expect(result).toEqual({
      status: 'ok',
      windCorrectionDeg: 0,
      trueHeadingDeg: 0,
      groundSpeedKt: 80,
      eetSeconds: 2700,
    });
  });

  it('adds a direct tailwind to groundspeed', () => {
    const result = calculateWindAdjustedLeg({
      trueTrackDeg: 0,
      distanceNm: 60,
      trueAirspeedKt: 100,
      wind: { directionFromTrueDeg: 180, speedKt: 20 },
    });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.windCorrectionDeg).toBeCloseTo(0, 12);
      expect(result.trueHeadingDeg).toBeCloseTo(0, 12);
      expect(result.groundSpeedKt).toBeCloseTo(120, 12);
      expect(result.eetSeconds).toBeCloseTo(1800, 12);
    }
  });

  it('crabs right for a wind from the right', () => {
    const result = calculateWindAdjustedLeg({
      trueTrackDeg: 0,
      distanceNm: 60,
      trueAirspeedKt: 100,
      wind: { directionFromTrueDeg: 90, speedKt: 20 },
    });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.windCorrectionDeg).toBeCloseTo(11.536959, 6);
      expect(result.trueHeadingDeg).toBeCloseTo(11.536959, 6);
      expect(result.groundSpeedKt).toBeCloseTo(Math.sqrt(9600), 10);
      expect(result.eetSeconds).toBeCloseTo(
        (60 / Math.sqrt(9600)) * SECONDS_PER_HOUR,
        10,
      );
    }
  });

  it('crabs left for a wind from the left', () => {
    const result = calculateWindAdjustedLeg({
      trueTrackDeg: 0,
      distanceNm: 60,
      trueAirspeedKt: 100,
      wind: { directionFromTrueDeg: 270, speedKt: 20 },
    });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.windCorrectionDeg).toBeCloseTo(-11.536959, 6);
      expect(result.trueHeadingDeg).toBeCloseTo(348.463041, 6);
      expect(result.groundSpeedKt).toBeCloseTo(Math.sqrt(9600), 10);
    }
  });

  it('normalizes a wind-adjusted heading across north', () => {
    const result = calculateWindAdjustedLeg({
      trueTrackDeg: 355,
      distanceNm: 25,
      trueAirspeedKt: 100,
      wind: { directionFromTrueDeg: 85, speedKt: 20 },
    });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.windCorrectionDeg).toBeGreaterThan(0);
      expect(result.trueHeadingDeg).toBeCloseTo(6.536959, 6);
    }
  });

  it('returns no solution when crosswind exceeds true airspeed', () => {
    expect(
      calculateWindAdjustedLeg({
        trueTrackDeg: 0,
        distanceNm: 10,
        trueAirspeedKt: 100,
        wind: { directionFromTrueDeg: 90, speedKt: 101 },
      }),
    ).toEqual({
      status: 'no-solution',
      reason: 'crosswind-exceeds-true-airspeed',
    });
  });

  it('returns no solution when a headwind prevents forward progress', () => {
    expect(
      calculateWindAdjustedLeg({
        trueTrackDeg: 0,
        distanceNm: 10,
        trueAirspeedKt: 100,
        wind: { directionFromTrueDeg: 0, speedKt: 100 },
      }),
    ).toEqual({
      status: 'no-solution',
      reason: 'non-positive-groundspeed',
    });
  });

  it('returns zero EET for a zero-distance leg with a valid track solution', () => {
    const result = calculateWindAdjustedLeg({
      trueTrackDeg: 270,
      distanceNm: 0,
      trueAirspeedKt: 100,
      wind: { directionFromTrueDeg: 0, speedKt: 0 },
    });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.eetSeconds).toBe(0);
    }
  });

  it.each([
    {
      description: 'a non-finite track',
      input: {
        trueTrackDeg: Number.NaN,
        distanceNm: 10,
        trueAirspeedKt: 100,
        wind: { directionFromTrueDeg: 0, speedKt: 0 },
      },
    },
    {
      description: 'a negative distance',
      input: {
        trueTrackDeg: 0,
        distanceNm: -1,
        trueAirspeedKt: 100,
        wind: { directionFromTrueDeg: 0, speedKt: 0 },
      },
    },
    {
      description: 'a non-positive true airspeed',
      input: {
        trueTrackDeg: 0,
        distanceNm: 10,
        trueAirspeedKt: 0,
        wind: { directionFromTrueDeg: 0, speedKt: 0 },
      },
    },
    {
      description: 'a negative wind speed',
      input: {
        trueTrackDeg: 0,
        distanceNm: 10,
        trueAirspeedKt: 100,
        wind: { directionFromTrueDeg: 0, speedKt: -1 },
      },
    },
  ])('rejects $description', ({ input }) => {
    expect(() => calculateWindAdjustedLeg(input)).toThrow(RangeError);
  });
});
