import { describe, expect, it } from 'vitest';

import {
  COMMUNICATION_PREFERENCES_STORAGE_KEY,
  loadCommunicationPreferences,
  saveCommunicationPreferences,
} from './communicationPreferences';

class MemoryStorage {
  readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe('communication preference storage', () => {
  it('round-trips remembered service frequencies', () => {
    const storage = new MemoryStorage();
    const preferences = {
      preferredFrequencyByServiceId: {
        'communication:enr21:bardufoss-tma:approach:bardufoss-approach-radar':
          '125.855',
      },
    };
    expect(saveCommunicationPreferences(storage, preferences)).toBe(true);
    expect(loadCommunicationPreferences(storage)).toEqual(preferences);
  });

  it('safely ignores malformed or unsupported stored values', () => {
    const storage = new MemoryStorage();
    storage.values.set(COMMUNICATION_PREFERENCES_STORAGE_KEY, '{broken');
    expect(loadCommunicationPreferences(storage).preferredFrequencyByServiceId)
      .toEqual({});
    storage.values.set(COMMUNICATION_PREFERENCES_STORAGE_KEY, JSON.stringify({
      schemaVersion: 99,
      preferredFrequencyByServiceId: { service: '125.855' },
    }));
    expect(loadCommunicationPreferences(storage).preferredFrequencyByServiceId)
      .toEqual({});
  });
});
