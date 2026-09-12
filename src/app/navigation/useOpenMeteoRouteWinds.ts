import { useEffect, useMemo, useRef, useState } from 'react';

import { calculateNavigationRoute } from '../../calculations';
import type {
  CalculatedNavigationRoute,
  LegWindOverride,
} from '../../calculations';
import type { FlightPlan, ManualLegWindOverride, NavigationPlanInputs, WindForecastModelId } from '../../domain';
import {
  buildWeatherSampleRequests,
  createEffectiveLegWinds,
  getWindForecastProvider,
  weatherSampleRequestsMatch,
} from '../../weather';
import type { ForecastLegWind } from '../../weather';
import { resolveExplicitForecastStatus } from './explicitForecastState';
import type {
  RouteForecastStatus,
  StoredForecastState,
} from './explicitForecastState';

const NO_WINDS: readonly LegWindOverride[] = [];

export type { RouteForecastStatus } from './explicitForecastState';

export interface UseOpenMeteoRouteWindsInput {
  enabled: boolean;
  flightPlan: FlightPlan;
  planning: NavigationPlanInputs | null;
  preliminaryRoute: CalculatedNavigationRoute;
  requestKey: number;
  model: WindForecastModelId;
  manualOverrides?: readonly ManualLegWindOverride[];
}

export interface UseOpenMeteoRouteWindsResult {
  legWinds: readonly LegWindOverride[];
  status: RouteForecastStatus;
  canLoad: boolean;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown forecast error';
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function useForecastRouteWinds({
  enabled,
  flightPlan,
  planning,
  preliminaryRoute,
  requestKey,
  model,
  manualOverrides = [],
}: UseOpenMeteoRouteWindsInput): UseOpenMeteoRouteWindsResult {
  const [storedState, setStoredState] = useState<StoredForecastState>({
    status: 'idle',
  });
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeContextKeyRef = useRef<string | null>(null);
  const forecastPlanningContext = planning === null
    ? null
    : (() => {
        const { manualLegWindOverrides: _manualLegWindOverrides, ...rest } = planning;
        return rest;
      })();
  const contextKey = useMemo(
    () => {
      if (!enabled || requestKey <= 0) {
        return 'forecast-not-requested';
      }

      return JSON.stringify({
        model,
        planning: forecastPlanningContext,
        waypoints: flightPlan.waypoints.map(({ id, position }) => ({
          id,
          position,
        })),
        legShapes: flightPlan.legShapes,
      });
    },
    [enabled, flightPlan, forecastPlanningContext, model, requestKey],
  );
  const canLoad = planning !== null && preliminaryRoute.legs.length > 0;

  useEffect(() => {
    if (
      abortControllerRef.current !== null &&
      activeContextKeyRef.current !== contextKey
    ) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      activeContextKeyRef.current = null;
    }
  }, [contextKey]);

  useEffect(() => {
    if (!enabled) {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      activeContextKeyRef.current = null;
    }
  }, [enabled]);

  useEffect(() => {
    if (requestKey <= 0 || !enabled || !canLoad || planning === null) {
      return;
    }

    const initialRequests = buildWeatherSampleRequests(
      preliminaryRoute,
      planning.plannedAltitudeFtMsl,
    );

    if (initialRequests.length === 0) {
      return;
    }

    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    activeContextKeyRef.current = contextKey;
    setStoredState({ status: 'loading', contextKey });

    void (async () => {
      try {
        const provider = getWindForecastProvider(model);
        let winds = await provider.fetchWinds(
          model,
          initialRequests,
          abortController.signal,
        );
        const firstForecastRoute = calculateNavigationRoute({
          flightPlan,
          planning,
          legWinds: createEffectiveLegWinds(winds, manualOverrides),
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
          winds = await provider.fetchWinds(
            model,
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
          winds: [...winds],
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
      } finally {
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
          activeContextKeyRef.current = null;
        }
      }
    })();

    return () => {
      abortController.abort();
    };
    // A forecast request starts only when the user increments requestKey.
    // Changes to route/planning inputs are represented as stale data instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  const status = resolveExplicitForecastStatus(
    enabled,
    contextKey,
    storedState,
  );

  return {
    legWinds: status.status === 'success'
      ? createEffectiveLegWinds(status.winds, manualOverrides)
      : NO_WINDS,
    status,
    canLoad,
  };
}

/** @deprecated Use useForecastRouteWinds; retained for existing integrations. */
export const useOpenMeteoRouteWinds = useForecastRouteWinds;
