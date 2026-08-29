import { describe, expect, it } from 'vitest';

import type { ForecastLegWind } from '../../weather';
import { resolveExplicitForecastStatus } from './explicitForecastState';

const wind = { fromId: 'A', toId: 'B' } as ForecastLegWind;

describe('resolveExplicitForecastStatus', () => {
  it('applies a successful forecast only to its matching input context', () => {
    const status = resolveExplicitForecastStatus(true, 'current', {
      status: 'success',
      contextKey: 'current',
      winds: [wind],
      refined: true,
    });

    expect(status).toEqual({
      status: 'success',
      winds: [wind],
      refined: true,
    });
  });

  it('marks loaded forecast data stale after planning inputs change', () => {
    const status = resolveExplicitForecastStatus(true, 'changed', {
      status: 'success',
      contextKey: 'loaded',
      winds: [wind],
      refined: false,
    });

    expect(status).toEqual({ status: 'stale' });
  });

  it('marks an in-flight request stale instead of reusing its result context', () => {
    expect(
      resolveExplicitForecastStatus(true, 'changed', {
        status: 'loading',
        contextKey: 'requested',
      }),
    ).toEqual({ status: 'stale' });
  });

  it('uses idle status whenever forecast use is disabled', () => {
    expect(
      resolveExplicitForecastStatus(false, 'current', {
        status: 'error',
        contextKey: 'current',
        message: 'Unavailable',
      }),
    ).toEqual({ status: 'idle' });
  });
});
