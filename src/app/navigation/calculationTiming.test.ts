import { describe, expect, it } from 'vitest';

import {
  CALCULATION_BREADCRUMB_STORAGE_KEY,
  clearCalculationBreadcrumb,
  isSlowCalculationDuration,
  measureDevelopmentCalculation,
  readUnfinishedCalculationBreadcrumb,
  SLOW_CALCULATION_WARNING_MS,
} from './calculationTiming';
import type { CalculationBreadcrumbStorage } from './calculationTiming';

function createMemoryStorage(): CalculationBreadcrumbStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

describe('calculation timing thresholds', () => {
  it('warns at and above the development threshold', () => {
    expect(isSlowCalculationDuration(SLOW_CALCULATION_WARNING_MS - 0.1))
      .toBe(false);
    expect(isSlowCalculationDuration(SLOW_CALCULATION_WARNING_MS)).toBe(true);
    expect(isSlowCalculationDuration(SLOW_CALCULATION_WARNING_MS + 1)).toBe(true);
  });

  it('does not classify non-finite durations as slow', () => {
    expect(isSlowCalculationDuration(Number.NaN)).toBe(false);
    expect(isSlowCalculationDuration(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it('persists the active stage while it runs and clears it after success', () => {
    const storage = createMemoryStorage();

    const result = measureDevelopmentCalculation(
      'manual operational flight plan',
      () => {
        expect(readUnfinishedCalculationBreadcrumb(storage)).toMatchObject({
          stage: 'manual operational flight plan',
          context: { waypointCount: 3 },
        });
        return 42;
      },
      { waypointCount: 3 },
      storage,
    );

    expect(result).toBe(42);
    expect(readUnfinishedCalculationBreadcrumb(storage)).toBeNull();
  });

  it('clears the breadcrumb when a calculation throws normally', () => {
    const storage = createMemoryStorage();

    expect(() => measureDevelopmentCalculation(
      'performance route',
      () => {
        throw new Error('calculation failed');
      },
      { waypointCount: 2 },
      storage,
    )).toThrow('calculation failed');
    expect(readUnfinishedCalculationBreadcrumb(storage)).toBeNull();
  });

  it('reads a valid unfinished breadcrumb and removes malformed data', () => {
    const storage = createMemoryStorage();
    storage.setItem(CALCULATION_BREADCRUMB_STORAGE_KEY, JSON.stringify({
      version: 1,
      id: 'test-run',
      stage: 'manual performance route',
      startedAtUtcMs: 123,
      context: { altitudePlanCount: 2 },
    }));

    expect(readUnfinishedCalculationBreadcrumb(storage)).toMatchObject({
      id: 'test-run',
      stage: 'manual performance route',
    });
    clearCalculationBreadcrumb(storage);
    expect(readUnfinishedCalculationBreadcrumb(storage)).toBeNull();

    storage.setItem(CALCULATION_BREADCRUMB_STORAGE_KEY, '{bad json');
    expect(readUnfinishedCalculationBreadcrumb(storage)).toBeNull();
    expect(storage.getItem(CALCULATION_BREADCRUMB_STORAGE_KEY)).toBeNull();
  });
});
