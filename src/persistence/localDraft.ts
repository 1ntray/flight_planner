import type { FlightPlanningDocument } from '../domain';
import {
  parseFlightPlanningDocumentJson,
  serializeFlightPlanningDocument,
} from './flightPlanningDocument';

export const LOCAL_DRAFT_STORAGE_KEY =
  'flight-planner:working-draft:v2';
export const LEGACY_LOCAL_DRAFT_STORAGE_KEY =
  'flight-planner:working-draft:v1';

export interface LocalDraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type LocalDraftLoadResult =
  | { status: 'empty' }
  | { status: 'loaded'; document: FlightPlanningDocument }
  | { status: 'error'; message: string };

export type LocalDraftWriteResult =
  | { status: 'success' }
  | { status: 'error'; message: string };

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function loadLocalDraft(
  storage: LocalDraftStorage,
): LocalDraftLoadResult {
  let serialized: string | null;

  try {
    serialized =
      storage.getItem(LOCAL_DRAFT_STORAGE_KEY) ??
      storage.getItem(LEGACY_LOCAL_DRAFT_STORAGE_KEY);
  } catch (error) {
    return {
      status: 'error',
      message: errorMessage(error, 'Local draft storage is unavailable'),
    };
  }

  if (serialized === null) {
    return { status: 'empty' };
  }

  try {
    return {
      status: 'loaded',
      document: parseFlightPlanningDocumentJson(serialized),
    };
  } catch (error) {
    return {
      status: 'error',
      message: `Saved local draft could not be restored: ${errorMessage(
        error,
        'invalid document',
      )}`,
    };
  }
}

export function saveLocalDraft(
  storage: LocalDraftStorage,
  document: FlightPlanningDocument,
): LocalDraftWriteResult {
  try {
    storage.setItem(
      LOCAL_DRAFT_STORAGE_KEY,
      serializeFlightPlanningDocument(document),
    );
    return { status: 'success' };
  } catch (error) {
    return {
      status: 'error',
      message: errorMessage(error, 'Local draft could not be saved'),
    };
  }
}

export function clearLocalDraft(
  storage: LocalDraftStorage,
): LocalDraftWriteResult {
  try {
    storage.removeItem(LOCAL_DRAFT_STORAGE_KEY);
    storage.removeItem(LEGACY_LOCAL_DRAFT_STORAGE_KEY);
    return { status: 'success' };
  } catch (error) {
    return {
      status: 'error',
      message: errorMessage(error, 'Local draft could not be removed'),
    };
  }
}
