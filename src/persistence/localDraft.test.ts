import { describe, expect, it } from 'vitest';

import type { FlightPlanningDocument } from '../domain';
import { PROJECT_AIRCRAFT_DEFINITION } from '../domain';
import {
  clearLocalDraft,
  LEGACY_LOCAL_DRAFT_STORAGE_KEY,
  loadLocalDraft,
  LOCAL_DRAFT_STORAGE_KEY,
  saveLocalDraft,
} from './localDraft';
import type { LocalDraftStorage } from './localDraft';

const document: FlightPlanningDocument = {
  schemaVersion: 3,
  flightPlan: {
    waypoints: [
      {
        id: 'A',
        name: 'START',
        position: { latitude: 69, longitude: 18 },
      },
      {
        id: 'B',
        name: 'FINISH',
        position: { latitude: 69.4, longitude: 19 },
      },
    ],
    legShapes: [],
  },
  planningInputs: {
    departureTimeUtcMs: Date.UTC(2026, 7, 28, 10),
    magneticVariationDegEast: 8,
    wind: { directionFromTrueDeg: 230, speedKt: 15 },
  },
  aircraftDefinition: PROJECT_AIRCRAFT_DEFINITION,
  performanceInputs: null,
  useForecastWinds: false,
};

class MemoryStorage implements LocalDraftStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe('local flight-planning draft storage', () => {
  it('reports an empty store without writing anything', () => {
    const storage = new MemoryStorage();

    expect(loadLocalDraft(storage)).toEqual({ status: 'empty' });
    expect(storage.values.size).toBe(0);
  });

  it('saves and restores through the versioned document validator', () => {
    const storage = new MemoryStorage();

    expect(saveLocalDraft(storage, document)).toEqual({ status: 'success' });
    expect(loadLocalDraft(storage)).toEqual({
      status: 'loaded',
      document,
    });
    expect(storage.values.get(LOCAL_DRAFT_STORAGE_KEY)).toContain(
      '"schemaVersion": 3',
    );
  });

  it('restores and migrates a legacy schema-one draft from the old storage key', () => {
    const storage = new MemoryStorage();
    storage.values.set(LEGACY_LOCAL_DRAFT_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1,
      flightPlan: document.flightPlan,
      planningInputs: {
        ...document.planningInputs,
        trueAirspeedKt: 103,
        plannedAltitudeFtMsl: 4500,
      },
      useForecastWinds: false,
    }));

    const result = loadLocalDraft(storage);

    expect(result.status).toBe('loaded');
    expect(result.status === 'loaded' ? result.document.schemaVersion : null).toBe(3);
    expect(result.status === 'loaded' ? result.document.performanceInputs : 'missing').toBeNull();
  });

  it('reports malformed stored data without deleting or replacing it', () => {
    const storage = new MemoryStorage();
    storage.values.set(LOCAL_DRAFT_STORAGE_KEY, '{broken');

    const result = loadLocalDraft(storage);

    expect(result.status).toBe('error');
    expect(result).toMatchObject({
      message: expect.stringContaining('could not be restored'),
    });
    expect(storage.values.get(LOCAL_DRAFT_STORAGE_KEY)).toBe('{broken');
  });

  it('clears only the flight-planner working-draft key', () => {
    const storage = new MemoryStorage();
    storage.values.set(LOCAL_DRAFT_STORAGE_KEY, 'draft');
    storage.values.set(LEGACY_LOCAL_DRAFT_STORAGE_KEY, 'legacy draft');
    storage.values.set('unrelated', 'preserve');

    expect(clearLocalDraft(storage)).toEqual({ status: 'success' });
    expect(storage.values.has(LOCAL_DRAFT_STORAGE_KEY)).toBe(false);
    expect(storage.values.has(LEGACY_LOCAL_DRAFT_STORAGE_KEY)).toBe(false);
    expect(storage.values.get('unrelated')).toBe('preserve');
  });

  it.each(['getItem', 'setItem', 'removeItem'] as const)(
    'reports storage failures from %s',
    (method) => {
      const storage = new MemoryStorage();
      storage[method] = () => {
        throw new Error(`${method} failed`);
      };

      const result =
        method === 'getItem'
          ? loadLocalDraft(storage)
          : method === 'setItem'
            ? saveLocalDraft(storage, document)
            : clearLocalDraft(storage);

      expect(result).toEqual({
        status: 'error',
        message: `${method} failed`,
      });
    },
  );
});
