import { useEffect, useMemo, useState } from 'react';

import { calculateNavigationRoute } from '../../calculations';
import type {
  CalculatedNavigationRoute,
  LegWindOverride,
} from '../../calculations';
import type { FlightPlan, NavigationPlanInputs } from '../../domain';
import {
  buildWeatherSampleRequests,
  fetchOpenMeteoLegWinds,
  weatherSampleRequestsMatch,
} from '../../weather';
import type { ForecastLegWind } from '../../weather';

const FORECAST_DEBOUNCE_MS = 300;
const NO_WINDS: readonly LegWindOverride[] = [];

type StoredForecastState =
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
  | { status: 'success'; winds: ForecastLegWind[]; refined: boolean }
  | { status: 'error'; message: string };

export interface UseOpenMeteoRouteWindsInput {
  enabled: boolean;
  flightPlan: FlightPlan;
  planning: NavigationPlanInputs | null;
  preliminaryRoute: CalculatedNavigationRoute;
}

export interface UseOpenMeteoRouteWindsResult {
  legWinds: readonly LegWindOverride[];
  status: RouteForecastStatus;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown forecast error';
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function useOpenMeteoRouteWinds({
  enabled,
  flightPlan,
  planning,
  preliminaryRoute,
}: UseOpenMeteoRouteWindsInput): UseOpenMeteoRouteWindsResult {
  const [storedState, setStoredState] = useState<StoredForecastState>({
    status: 'idle',
  });
  const contextKey = useMemo(
    () =>
      JSON.stringify({
        planning,
        waypoints: flightPlan.waypoints.map(({ id, position }) => ({
          id,
          position,
        })),
        legShapes: flightPlan.legShapes,
      }),
    [flightPlan, planning],
  );

  useEffect(() => {
    if (!enabled || planning === null) {
      setStoredState({ status: 'idle' });
      return;
    }

    const initialRequests = buildWeatherSampleRequests(
      preliminaryRoute,
      planning.plannedAltitudeFtMsl,
    );

    if (initialRequests.length === 0) {
      setStoredState({ status: 'idle' });
      return;
    }

    const abortController = new AbortController();
    const timeoutId = window.setTimeout(() => {
      setStoredState({ status: 'loading', contextKey });

      void (async () => {
        try {
          let winds = await fetchOpenMeteoLegWinds(
            initialRequests,
            abortController.signal,
          );
          const firstForecastRoute = calculateNavigationRoute({
            flightPlan,
            planning,
            legWinds: winds,
          });
          const refinedRequests = buildWeatherSampleRequests(
            firstForecastRoute,
            planning.plannedAltitudeFtMsl,
          );
          let refined = false;

          if (
            refinedRequests.length > 0 &&
            !weatherSampleRequestsMatch(initialRequests, refinedRequests)
          ) {
            winds = await fetchOpenMeteoLegWinds(
              refinedRequests,
              abortController.signal,
            );
            refined = true;
          }

          if (abortController.signal.aborted) {
            return;
          }

          setStoredState({
            status: 'success',
            contextKey,
            winds,
            refined,
          });
        } catch (error) {
          if (!isAbortError(error)) {
            setStoredState({
              status: 'error',
              contextKey,
              message: getErrorMessage(error),
            });
          }
        }
      })();
    }, FORECAST_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
      abortController.abort();
    };
  }, [contextKey, enabled, flightPlan, planning, preliminaryRoute]);

  if (
    !enabled ||
    storedState.status === 'idle' ||
    storedState.contextKey !== contextKey
  ) {
    return { legWinds: NO_WINDS, status: { status: 'idle' } };
  }

  if (storedState.status === 'success') {
    return {
      legWinds: storedState.winds,
      status: {
        status: 'success',
        winds: storedState.winds,
        refined: storedState.refined,
      },
    };
  }

  return {
    legWinds: NO_WINDS,
    status:
      storedState.status === 'loading'
        ? { status: 'loading' }
        : { status: 'error', message: storedState.message },
  };
}
