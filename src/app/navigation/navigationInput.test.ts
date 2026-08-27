import { describe, expect, it } from 'vitest';

import {
  DEFAULT_NAVIGATION_INPUT_DRAFT,
  parseNavigationInputDraft,
} from './navigationInput';

describe('parseNavigationInputDraft', () => {
  it('parses the default calm-wind planning inputs', () => {
    expect(parseNavigationInputDraft(DEFAULT_NAVIGATION_INPUT_DRAFT)).toEqual({
      status: 'valid',
      value: {
        trueAirspeedKt: 100,
        wind: { directionFromTrueDeg: 0, speedKt: 0 },
      },
    });
  });

  it('normalizes the entered wind direction', () => {
    expect(
      parseNavigationInputDraft({
        trueAirspeedKt: '115.5',
        windDirectionFromTrueDeg: '370',
        windSpeedKt: '12.5',
      }),
    ).toEqual({
      status: 'valid',
      value: {
        trueAirspeedKt: 115.5,
        wind: { directionFromTrueDeg: 10, speedKt: 12.5 },
      },
    });
  });

  it.each([
    {
      description: 'an empty true airspeed',
      draft: {
        trueAirspeedKt: '',
        windDirectionFromTrueDeg: '0',
        windSpeedKt: '0',
      },
      message: 'True airspeed is required',
    },
    {
      description: 'a zero true airspeed',
      draft: {
        trueAirspeedKt: '0',
        windDirectionFromTrueDeg: '0',
        windSpeedKt: '0',
      },
      message: 'True airspeed must be greater than zero',
    },
    {
      description: 'a non-numeric wind direction',
      draft: {
        trueAirspeedKt: '100',
        windDirectionFromTrueDeg: 'north',
        windSpeedKt: '0',
      },
      message: 'Wind direction must be a number',
    },
    {
      description: 'a negative wind speed',
      draft: {
        trueAirspeedKt: '100',
        windDirectionFromTrueDeg: '0',
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
