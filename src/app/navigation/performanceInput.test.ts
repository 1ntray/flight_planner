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
    expect(parsePerformanceInputDraft(createEmptyPerformanceInputDraft())).toEqual({
      status: 'empty',
    });
  });

  it('round-trips semantic values and leg altitude plans', () => {
    expect(parsePerformanceInputDraft(createPerformanceInputDraft(inputs))).toEqual({
      status: 'valid',
      value: inputs,
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

  it('parses intermediate-airport data and requires every marked stop', () => {
    const draft = {
      ...createPerformanceInputDraft(inputs),
      sectorStopPlans: [{
        waypointId: 'B',
        elevationFtMsl: '350',
        qnhHpa: '1008',
        isaDeviationC: '3',
        onwardDepartureTimeUtc: '2026-08-28T12:30',
      }],
    };

    expect(parsePerformanceInputDraft(draft, ['B'])).toMatchObject({
      status: 'valid',
      value: {
        sectorStopPlans: [{
          waypointId: 'B',
          elevationFtMsl: 350,
          weather: { qnhHpa: 1008, isaDeviationC: 3 },
          onwardDepartureTimeUtcMs: Date.UTC(2026, 7, 28, 12, 30),
        }],
      },
    });
    expect(parsePerformanceInputDraft(draft, ['B', 'C'])).toMatchObject({
      status: 'invalid',
      message: expect.stringContaining('every intermediate airport'),
    });
  });
});
