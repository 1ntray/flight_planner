export const SLOW_CALCULATION_WARNING_MS = 100;
export const CALCULATION_BREADCRUMB_STORAGE_KEY =
  'flight-planner:calculation-breadcrumb:v1';

export type CalculationTimingContext = Readonly<Record<string, number>>;

export interface CalculationBreadcrumb {
  readonly version: 1;
  readonly id: string;
  readonly stage: string;
  readonly startedAtUtcMs: number;
  readonly context: CalculationTimingContext;
}

export interface CalculationBreadcrumbStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

let breadcrumbSequence = 0;

function getBrowserStorage(): CalculationBreadcrumbStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isCalculationBreadcrumb(value: unknown): value is CalculationBreadcrumb {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<CalculationBreadcrumb>;
  return candidate.version === 1 &&
    typeof candidate.id === 'string' &&
    candidate.id !== '' &&
    typeof candidate.stage === 'string' &&
    candidate.stage !== '' &&
    typeof candidate.startedAtUtcMs === 'number' &&
    Number.isFinite(candidate.startedAtUtcMs) &&
    typeof candidate.context === 'object' &&
    candidate.context !== null &&
    Object.values(candidate.context).every(
      (contextValue) =>
        typeof contextValue === 'number' && Number.isFinite(contextValue),
    );
}

export function readUnfinishedCalculationBreadcrumb(
  storage: CalculationBreadcrumbStorage | null = getBrowserStorage(),
): CalculationBreadcrumb | null {
  if (storage === null) {
    return null;
  }

  try {
    const serialized = storage.getItem(CALCULATION_BREADCRUMB_STORAGE_KEY);
    if (serialized === null) {
      return null;
    }

    const parsed: unknown = JSON.parse(serialized);
    if (isCalculationBreadcrumb(parsed)) {
      return parsed;
    }

    storage.removeItem(CALCULATION_BREADCRUMB_STORAGE_KEY);
  } catch {
    try {
      storage.removeItem(CALCULATION_BREADCRUMB_STORAGE_KEY);
    } catch {
      // Diagnostics must never prevent the planner from opening.
    }
  }

  return null;
}

export function clearCalculationBreadcrumb(
  storage: CalculationBreadcrumbStorage | null = getBrowserStorage(),
): void {
  try {
    storage?.removeItem(CALCULATION_BREADCRUMB_STORAGE_KEY);
  } catch {
    // Diagnostics are best-effort and cannot become an app dependency.
  }
}

function beginCalculationBreadcrumb(
  stage: string,
  context: CalculationTimingContext,
  storage: CalculationBreadcrumbStorage | null,
): CalculationBreadcrumb | null {
  if (storage === null) {
    return null;
  }

  const breadcrumb: CalculationBreadcrumb = {
    version: 1,
    id: `${Date.now()}-${breadcrumbSequence += 1}`,
    stage,
    startedAtUtcMs: Date.now(),
    context,
  };

  try {
    storage.setItem(
      CALCULATION_BREADCRUMB_STORAGE_KEY,
      JSON.stringify(breadcrumb),
    );
    return breadcrumb;
  } catch {
    return null;
  }
}

function finishCalculationBreadcrumb(
  breadcrumb: CalculationBreadcrumb | null,
  storage: CalculationBreadcrumbStorage | null,
): void {
  if (breadcrumb === null || storage === null) {
    return;
  }

  try {
    const current = readUnfinishedCalculationBreadcrumb(storage);
    if (current?.id === breadcrumb.id) {
      storage.removeItem(CALCULATION_BREADCRUMB_STORAGE_KEY);
    }
  } catch {
    // Diagnostics are best-effort and cannot become an app dependency.
  }
}

export function isSlowCalculationDuration(
  durationMs: number,
  thresholdMs = SLOW_CALCULATION_WARNING_MS,
): boolean {
  return Number.isFinite(durationMs) && durationMs >= thresholdMs;
}

/**
 * Persists the currently running synchronous stage so a force-closed renderer
 * can enter safe recovery mode on its next launch. Slow console timing remains
 * development-only.
 */
export function measureDevelopmentCalculation<T>(
  label: string,
  calculate: () => T,
  context: CalculationTimingContext,
  storage: CalculationBreadcrumbStorage | null = getBrowserStorage(),
): T {
  const breadcrumb = beginCalculationBreadcrumb(label, context, storage);
  const startedAtMs = import.meta.env.DEV ? performance.now() : null;

  try {
    return calculate();
  } finally {
    finishCalculationBreadcrumb(breadcrumb, storage);

    if (startedAtMs !== null) {
      const durationMs = performance.now() - startedAtMs;

      if (isSlowCalculationDuration(durationMs)) {
        console.warn(
          `[Flight Planner] ${label} took ${durationMs.toFixed(1)} ms`,
          context,
        );
      }
    }
  }
}
