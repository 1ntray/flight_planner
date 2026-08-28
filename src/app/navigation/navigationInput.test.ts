import { describe, expect, it } from 'vitest';

import {
  createDefaultNavigationInputDraft,
  createNavigationInputDraft,
  formatUtcDateTimeInput,
  parseNavigationInputDraft,
} from './navigationInput';

const DEPARTURE_TIME_UTC_MS = Date.UTC(2026, 7, 27, 12, 5);
const validDraft = createDefaultNavigationInputDraft(DEPARTURE_TIME_UTC_MS);

describe('parseNavigationInputDraft', () => {
  it('parses the default calm-wind planning inputs', () => {
    expect(parseNavigationInputDraft(validDraft)).toEqual({
      status: 'valid',
      value: {
        departureTimeUtcMs: DEPARTURE_TIME_UTC_MS,
        magneticVariationDegEast: 0,
        wind: { directionFromTrueDeg: 0, speedKt: 0 },
      },
    });
  });

  it('normalizes the entered wind direction', () => {
    expect(
      parseNavigationInputDraft({
        ...validDraft,
        windDirectionFromTrueDeg: '370',
        windSpeedKt: '12.5',
      }),
    ).toEqual({
      status: 'valid',
      value: {
        departureTimeUtcMs: DEPARTURE_TIME_UTC_MS,
        magneticVariationDegEast: 0,
        wind: { directionFromTrueDeg: 10, speedKt: 12.5 },
      },
    });
  });

  it.each([
    { direction: 'E' as const, expected: 12.5 },
    { direction: 'W' as const, expected: -12.5 },
  ])('parses $direction variation into the east-positive convention', ({ direction, expected }) => {
    const result = parseNavigationInputDraft({
      ...validDraft,
      magneticVariationDeg: '12.5',
      magneticVariationDirection: direction,
    });

    expect(result.status).toBe('valid');
    if (result.status === 'valid') {
      expect(result.value.magneticVariationDegEast).toBe(expected);
    }
  });

  it.each([
    {
      description: 'an invalid departure time',
      draft: {
        ...validDraft,
        departureTimeUtc: '2026-02-30T12:00',
      },
      message: 'Departure time must be a valid UTC date and time',
    },
    {
      description: 'a non-numeric wind direction',
      draft: {
        ...validDraft,
        windDirectionFromTrueDeg: 'north',
      },
      message: 'Wind direction must be a number',
    },
    {
      description: 'a negative magnetic variation magnitude',
      draft: {
        ...validDraft,
        magneticVariationDeg: '-1',
      },
      message: 'Magnetic variation must be between 0 and 180 degrees',
    },
    {
      description: 'an excessive magnetic variation magnitude',
      draft: {
        ...validDraft,
        magneticVariationDeg: '181',
      },
      message: 'Magnetic variation must be between 0 and 180 degrees',
    },
    {
      description: 'a negative wind speed',
      draft: {
        ...validDraft,
        windSpeedKt: '-1',
      },
      message: 'Wind speed must not be negative',
    },
  ])('rejects $description', ({ draft, message }) => {
    expect(parseNavigationInputDraft(draft)).toEqual({
      status: 'invalid',
      message,
    });
  });
});

describe('departure-time input helpers', () => {
  it('rounds the default departure up to the next five UTC minutes', () => {
    const draft = createDefaultNavigationInputDraft(
      Date.UTC(2026, 7, 27, 12, 2, 30),
    );

    expect(draft.departureTimeUtc).toBe('2026-08-27T12:05');
    expect(draft.magneticVariationDeg).toBe('0');
    expect(draft.magneticVariationDirection).toBe('E');
  });

  it('formats a UTC timestamp for a datetime-local control', () => {
    expect(formatUtcDateTimeInput(DEPARTURE_TIME_UTC_MS)).toBe(
      '2026-08-27T12:05',
    );
  });

  it('formats semantic planning inputs back into an editable draft', () => {
    const draft = createNavigationInputDraft({
      departureTimeUtcMs: DEPARTURE_TIME_UTC_MS,
      magneticVariationDegEast: -8.2,
      wind: { directionFromTrueDeg: 275, speedKt: 16.5 },
    });

    expect(draft).toEqual({
      departureTimeUtc: '2026-08-27T12:05',
      magneticVariationDeg: '8.2',
      magneticVariationDirection: 'W',
      windDirectionFromTrueDeg: '275',
      windSpeedKt: '16.5',
    });
    expect(parseNavigationInputDraft(draft)).toEqual({
      status: 'valid',
      value: {
        departureTimeUtcMs: DEPARTURE_TIME_UTC_MS,
        magneticVariationDegEast: -8.2,
        wind: { directionFromTrueDeg: 275, speedKt: 16.5 },
      },
    });
  });
});
