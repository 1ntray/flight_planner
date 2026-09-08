import type { CommunicationPreferences } from '../../calculations';
import { EMPTY_COMMUNICATION_PREFERENCES } from '../../calculations';

export const COMMUNICATION_PREFERENCES_STORAGE_KEY =
  'flight-planner:communication-preferences:v1';
export const COMMUNICATION_PREFERENCES_SCHEMA_VERSION = 1;

export interface CommunicationPreferencesStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface StoredCommunicationPreferences {
  readonly schemaVersion: typeof COMMUNICATION_PREFERENCES_SCHEMA_VERSION;
  readonly preferredFrequencyByServiceId: Readonly<Record<string, string>>;
}

function parseStoredPreferences(value: unknown): CommunicationPreferences {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Frequency preferences must be an object');
  }
  const candidate = value as Partial<StoredCommunicationPreferences>;
  if (candidate.schemaVersion !== COMMUNICATION_PREFERENCES_SCHEMA_VERSION) {
    throw new Error('Unsupported frequency-preference version');
  }
  if (
    typeof candidate.preferredFrequencyByServiceId !== 'object' ||
    candidate.preferredFrequencyByServiceId === null ||
    Array.isArray(candidate.preferredFrequencyByServiceId)
  ) {
    throw new Error('Frequency preference entries must be an object');
  }
  const entries = Object.entries(candidate.preferredFrequencyByServiceId);
  if (entries.some(([serviceId, frequency]) =>
    serviceId.trim() === '' ||
    typeof frequency !== 'string' ||
    !/^\d{3}\.\d{3}$/.test(frequency)
  )) {
    throw new Error('Frequency preference entry is malformed');
  }
  return { preferredFrequencyByServiceId: Object.fromEntries(entries) };
}

export function loadCommunicationPreferences(
  storage: CommunicationPreferencesStorage | null,
): CommunicationPreferences {
  if (storage === null) return EMPTY_COMMUNICATION_PREFERENCES;
  try {
    const serialized = storage.getItem(COMMUNICATION_PREFERENCES_STORAGE_KEY);
    return serialized === null
      ? EMPTY_COMMUNICATION_PREFERENCES
      : parseStoredPreferences(JSON.parse(serialized) as unknown);
  } catch {
    return EMPTY_COMMUNICATION_PREFERENCES;
  }
}

export function saveCommunicationPreferences(
  storage: CommunicationPreferencesStorage | null,
  preferences: CommunicationPreferences,
): boolean {
  if (storage === null) return false;
  try {
    storage.setItem(COMMUNICATION_PREFERENCES_STORAGE_KEY, JSON.stringify({
      schemaVersion: COMMUNICATION_PREFERENCES_SCHEMA_VERSION,
      preferredFrequencyByServiceId:
        preferences.preferredFrequencyByServiceId,
    } satisfies StoredCommunicationPreferences));
    return true;
  } catch {
    return false;
  }
}
