import { describe, expect, it } from 'vitest';

import {
  createDefaultNavigationInputDraft,
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
        trueAirspeedKt: 100,
        plannedAltitudeFtMsl: 3000,
        wind: { directionFromTrueDeg: 0, speedKt: 0 },
      },
    });
  });

  it('normalizes the entered wind direction', () => {
    expect(
      parseNavigationInputDraft({
        ...validDraft,
        trueAirspeedKt: '115.5',
        windDirectionFromTrueDeg: '370',
        windSpeedKt: '12.5',
      }),
    ).toEqual({
      status: 'valid',
      value: {
        departureTimeUtcMs: DEPARTURE_TIME_UTC_MS,
        trueAirspeedKt: 115.5,
        plannedAltitudeFtMsl: 3000,
        wind: { directionFromTrueDeg: 10, speedKt: 12.5 },
      },
    });
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
      description: 'an empty true airspeed',
      draft: {
        ...validDraft,
        trueAirspeedKt: '',
      },
      message: 'True airspeed is required',
    },
    {
      description: 'a zero true airspeed',
      draft: {
        ...validDraft,
        trueAirspeedKt: '0',
      },
      message: 'True airspeed must be greater than zero',
    },
    {
      description: 'a negative planned altitude',
      draft: {
        ...validDraft,
        plannedAltitudeFtMsl: '-1',
      },
      message: 'Planned altitude must not be negative',
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
  });

  it('formats a UTC timestamp for a datetime-local control', () => {
    expect(formatUtcDateTimeInput(DEPARTURE_TIME_UTC_MS)).toBe(
      '2026-08-27T12:05',
    );
  });
});
