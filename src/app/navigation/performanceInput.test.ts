import { describe, expect, it } from 'vitest';

import {
  createEmptyPerformanceInputDraft,
  createPerformanceInputDraft,
  parsePerformanceInputDraft,
} from './performanceInput';

const inputs = {
  massKg: 820,
  defaultAltitudeFtMsl: 5000,
  departureElevationFtMsl: 100,
  destinationElevationFtMsl: 200,
  patternHeightAglFt: 1000,
  departureWeather: { qnhHpa: 1010, isaDeviationC: -2 },
  destinationWeather: { qnhHpa: 1020, isaDeviationC: 4 },
  legAltitudePlans: [{
    fromWaypointId: 'A',
    toWaypointId: 'B',
    altitudeFtMsl: 4500,
    targetPlacement: { mode: 'distance-along-leg' as const, distanceFromStartNm: 8 },
  }],
  sectorStopPlans: [],
};

describe('performance input parsing', () => {
  it('keeps a completely blank performance section optional', () => {
    const draft = createEmptyPerformanceInputDraft();
    expect(draft.defaultAltitudeFtMsl).toBe('2500');
    expect(draft.patternHeightAglFt).toBe('');
    expect(parsePerformanceInputDraft(draft)).toEqual({
      status: 'empty',
    });
  });

  it('round-trips semantic values and leg altitude plans', () => {
    expect(parsePerformanceInputDraft(createPerformanceInputDraft(inputs))).toEqual({
      status: 'valid',
      value: inputs,
    });
  });

  it('uses an aerodrome elevation default only while the user field is blank', () => {
    const blankElevationDraft = {
      ...createPerformanceInputDraft(inputs),
      departureElevationFtMsl: '',
      destinationElevationFtMsl: '',
    };

    expect(
      parsePerformanceInputDraft(blankElevationDraft, [], undefined, {
        departureElevationFtMsl: 254,
        destinationElevationFtMsl: 17,
      }),
    ).toMatchObject({
      status: 'valid',
      value: {
        departureElevationFtMsl: 254,
        destinationElevationFtMsl: 17,
      },
    });
    expect(blankElevationDraft.departureElevationFtMsl).toBe('');
    expect(blankElevationDraft.destinationElevationFtMsl).toBe('');
  });

  it('uses a user-entered elevation instead of an available default', () => {
    expect(
      parsePerformanceInputDraft(
        {
          ...createPerformanceInputDraft(inputs),
          departureElevationFtMsl: '300',
        },
        [],
        undefined,
        { departureElevationFtMsl: 254 },
      ),
    ).toMatchObject({
      status: 'valid',
      value: { departureElevationFtMsl: 300 },
    });
  });

  it('uses standard aerodrome weather while blank fields remain overridable', () => {
    const blankWeatherDraft = {
      ...createPerformanceInputDraft(inputs),
      departureQnhHpa: '',
      departureIsaDeviationC: '',
      destinationQnhHpa: '',
      destinationIsaDeviationC: '',
    };

    expect(parsePerformanceInputDraft(blankWeatherDraft)).toMatchObject({
      status: 'valid',
      value: {
        departureWeather: { qnhHpa: 1013, isaDeviationC: 0 },
        destinationWeather: { qnhHpa: 1013, isaDeviationC: 0 },
      },
    });
    expect(blankWeatherDraft.departureQnhHpa).toBe('');
    expect(blankWeatherDraft.destinationIsaDeviationC).toBe('');
  });

  it('uses the fixed standard pattern height regardless of legacy draft input', () => {
    const blankPatternHeightDraft = {
      ...createPerformanceInputDraft(inputs),
      patternHeightAglFt: '',
    };

    expect(parsePerformanceInputDraft(blankPatternHeightDraft)).toMatchObject({
      status: 'valid',
      value: { patternHeightAglFt: 1000 },
    });
    expect(blankPatternHeightDraft.patternHeightAglFt).toBe('');

    expect(parsePerformanceInputDraft({
      ...blankPatternHeightDraft,
      patternHeightAglFt: '1500',
    })).toMatchObject({
      status: 'valid',
      value: { patternHeightAglFt: 1000 },
    });
  });

  it('rejects invalid positive quantities and invalid leg targets explicitly', () => {
    expect(parsePerformanceInputDraft({
      ...createPerformanceInputDraft(inputs),
      massKg: '0',
    })).toMatchObject({ status: 'invalid', message: expect.stringContaining('greater than zero') });
    expect(parsePerformanceInputDraft({
      ...createPerformanceInputDraft(inputs),
      legAltitudePlans: [{
        fromWaypointId: 'A',
        toWaypointId: 'B',
        targetPlacement: { mode: 'distance-along-leg', distanceFromStartNm: -1 },
      }],
    })).toMatchObject({ status: 'invalid', message: expect.stringContaining('non-negative') });
  });

  it('rejects planning altitudes above the supported calculation range', () => {
    expect(parsePerformanceInputDraft({
      ...createPerformanceInputDraft(inputs),
      defaultAltitudeFtMsl: '60001',
    })).toMatchObject({
      status: 'invalid',
      message: expect.stringContaining('must not exceed 60000'),
    });
    expect(parsePerformanceInputDraft({
      ...createPerformanceInputDraft(inputs),
      legAltitudePlans: [{
        fromWaypointId: 'A',
        toWaypointId: 'B',
        altitudeFtMsl: 60001,
      }],
    })).toMatchObject({
      status: 'invalid',
      message: expect.stringContaining('between 0 and 60000'),
    });
    expect(parsePerformanceInputDraft({
      ...createPerformanceInputDraft(inputs),
      legAltitudePlans: [{
        fromWaypointId: 'A',
        toWaypointId: 'B',
        endAltitudeFtMsl: 60001,
      }],
    })).toMatchObject({
      status: 'invalid',
      message: expect.stringContaining('between 0 and 60000'),
    });
  });

  it('parses intermediate-airport data and requires every marked stop', () => {
    const draft = {
      ...createPerformanceInputDraft(inputs),
      sectorStopPlans: [{
        waypointId: 'B',
        elevationFtMsl: '350',
        qnhHpa: '1008',
        isaDeviationC: '3',
        stopDurationMinutes: '30',
      }],
    };

    expect(parsePerformanceInputDraft(draft, ['B'])).toMatchObject({
      status: 'valid',
      value: {
        sectorStopPlans: [{
          waypointId: 'B',
          elevationFtMsl: 350,
          weather: { qnhHpa: 1008, isaDeviationC: 3 },
          stopDurationMinutes: 30,
        }],
      },
    });
    expect(parsePerformanceInputDraft(draft, ['B', 'C'])).toMatchObject({
      status: 'invalid',
      message: expect.stringContaining('every intermediate airport'),
    });
  });

  it('uses an anchored intermediate aerodrome elevation and standard weather as defaults', () => {
    const draft = {
      ...createPerformanceInputDraft(inputs),
      sectorStopPlans: [{
        waypointId: 'B',
        elevationFtMsl: '',
        qnhHpa: '',
        isaDeviationC: '',
        stopDurationMinutes: '',
      }],
    };

    expect(
      parsePerformanceInputDraft(draft, ['B'], undefined, {
        sectorStopElevationFtMslByWaypointId: { B: 254 },
      }),
    ).toMatchObject({
      status: 'valid',
      value: {
        sectorStopPlans: [{
          waypointId: 'B',
          elevationFtMsl: 254,
          weather: { qnhHpa: 1013, isaDeviationC: 0 },
        }],
      },
    });
  });

  it('keeps an intermediate elevation and weather entered by the user', () => {
    const draft = {
      ...createPerformanceInputDraft(inputs),
      sectorStopPlans: [{
        waypointId: 'B',
        elevationFtMsl: '300',
        qnhHpa: '1002',
        isaDeviationC: '-5',
        stopDurationMinutes: '',
      }],
    };

    expect(
      parsePerformanceInputDraft(draft, ['B'], undefined, {
        sectorStopElevationFtMslByWaypointId: { B: 254 },
      }),
    ).toMatchObject({
      status: 'valid',
      value: {
        sectorStopPlans: [{
          elevationFtMsl: 300,
          weather: { qnhHpa: 1002, isaDeviationC: -5 },
        }],
      },
    });
  });

  it('rejects a negative intermediate-airport stop duration', () => {
    const draft = {
      ...createPerformanceInputDraft(inputs),
      sectorStopPlans: [{
        waypointId: 'B',
        elevationFtMsl: '350',
        qnhHpa: '1008',
        isaDeviationC: '3',
        stopDurationMinutes: '-1',
      }],
    };

    expect(parsePerformanceInputDraft(draft, ['B'])).toMatchObject({
      status: 'invalid',
      message: expect.stringContaining('at least 0'),
    });
  });
});
