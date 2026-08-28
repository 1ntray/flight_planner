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
});
