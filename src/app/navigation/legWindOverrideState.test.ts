import { describe, expect, it } from 'vitest';

import {
  createLegWindDefaults,
  findManualLegWindOverride,
  setManualLegWindOverride,
} from './legWindOverrideState';

describe('manual leg wind override state', () => {
  it('adds, replaces, normalizes, finds, and removes an override by adjacency', () => {
    const added = setManualLegWindOverride([], 'A', 'B', {
      directionFromTrueDeg: 370,
      speedKt: 18,
    });
    expect(findManualLegWindOverride(added, 'A', 'B')).toEqual({
      fromWaypointId: 'A',
      toWaypointId: 'B',
      wind: { directionFromTrueDeg: 10, speedKt: 18 },
    });

    const replaced = setManualLegWindOverride(added, 'A', 'B', {
      directionFromTrueDeg: -10,
      speedKt: 12,
    });
    expect(replaced).toHaveLength(1);
    expect(replaced[0]?.wind).toEqual({ directionFromTrueDeg: 350, speedKt: 12 });
    expect(setManualLegWindOverride(replaced, 'A', 'B', null)).toEqual([]);
  });

  it('rejects malformed override values', () => {
    expect(() => setManualLegWindOverride([], 'A', 'B', {
      directionFromTrueDeg: Number.NaN,
      speedKt: 10,
    })).toThrow(RangeError);
    expect(() => setManualLegWindOverride([], 'A', 'B', {
      directionFromTrueDeg: 180,
      speedKt: -1,
    })).toThrow(RangeError);
  });

  it('uses a loaded forecast when available and otherwise uses manual wind', () => {
    const legs = [{ fromId: 'A', toId: 'B' }, { fromId: 'B', toId: 'C' }];
    const forecasts = [{
      fromId: 'A',
      toId: 'B',
      wind: { directionFromTrueDeg: 220, speedKt: 16 },
      source: 'forecast' as const,
      provider: 'open-meteo' as const,
      model: 'ecmwf_ifs025' as const,
      modelLabel: 'ECMWF IFS 0.25°',
      providerLabel: 'Open-Meteo',
      retrievedAtUtcMs: 0,
      sampledPosition: { latitude: 69, longitude: 19 },
      sampledTimeUtcMs: 0,
      altitudeFtMsl: 2500,
      effectiveAltitudeMetersMsl: 762,
      altitudeClamped: false,
      pressureLevelRangeHpa: [900, 925] as const,
      geopotentialHeightRangeMetersMsl: [700, 900] as const,
    }];
    const defaults = createLegWindDefaults(
      legs,
      { directionFromTrueDeg: 180, speedKt: 8 },
      true,
      forecasts,
      null,
    );
    expect(defaults.get('A\u0000B')).toEqual({
      wind: { directionFromTrueDeg: 220, speedKt: 16 },
      source: 'forecast',
    });
    expect(defaults.get('B\u0000C')).toEqual({
      wind: { directionFromTrueDeg: 180, speedKt: 8 },
      source: 'manual',
    });
  });
});
