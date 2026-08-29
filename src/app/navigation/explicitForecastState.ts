import type { ForecastLegWind } from '../../weather';

export type StoredForecastState =
  | { status: 'idle' }
  | { status: 'loading'; contextKey: string }
  | {
      status: 'success';
      contextKey: string;
      winds: ForecastLegWind[];
      refined: boolean;
    }
  | { status: 'error'; contextKey: string; message: string };

export type RouteForecastStatus =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'stale' }
  | { status: 'success'; winds: ForecastLegWind[]; refined: boolean }
  | { status: 'error'; message: string };

export function resolveExplicitForecastStatus(
  enabled: boolean,
  contextKey: string,
  stored: StoredForecastState,
): RouteForecastStatus {
  if (!enabled || stored.status === 'idle') {
    return { status: 'idle' };
  }

  if (stored.contextKey !== contextKey) {
    return { status: 'stale' };
  }

  if (stored.status === 'success') {
    return {
      status: 'success',
      winds: stored.winds,
      refined: stored.refined,
    };
  }

  return stored.status === 'loading'
    ? { status: 'loading' }
    : { status: 'error', message: stored.message };
}
