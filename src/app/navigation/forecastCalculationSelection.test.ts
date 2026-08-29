import { describe, expect, it, vi } from 'vitest';

import { calculateWithOptionalForecast } from './forecastCalculationSelection';

describe('calculateWithOptionalForecast', () => {
  it('reuses the manual result when no forecast samples exist', () => {
    const manualResult = { source: 'manual' };
    const calculateWithForecast = vi.fn(() => ({ source: 'forecast' }));

    const result = calculateWithOptionalForecast(
      manualResult,
      [],
      calculateWithForecast,
    );

    expect(result).toBe(manualResult);
    expect(calculateWithForecast).not.toHaveBeenCalled();
  });

  it('calculates a forecast result when forecast samples exist', () => {
    const forecastResult = { source: 'forecast' };
    const calculateWithForecast = vi.fn(() => forecastResult);

    const result = calculateWithOptionalForecast(
      { source: 'manual' },
      [{}],
      calculateWithForecast,
    );

    expect(result).toBe(forecastResult);
    expect(calculateWithForecast).toHaveBeenCalledOnce();
  });
});
