import { useEffect, useMemo, useRef, useState } from 'react';

import { calculatePerformanceRoute } from '../../calculations';
import type { CalculatedPerformanceRoute } from '../../calculations';
import type {
  AircraftPerformancePlanInputs,
  AircraftPerformanceProfile,
  FlightPlan,
  RoutePlanningInputs,
} from '../../domain';
import {
  buildPerformanceWeatherSampleRequests,
  createSampledWindResolver,
  fetchOpenMeteoLegWinds,
  weatherSampleRequestsMatch,
} from '../../weather';
import type { ForecastLegWind } from '../../weather';
import { resolveExplicitForecastStatus } from './explicitForecastState';
import type {
  RouteForecastStatus,
  StoredForecastState,
} from './explicitForecastState';

export interface UseOpenMeteoPerformanceWindsInput {
  enabled: boolean;
  flightPlan: FlightPlan;
  navigation: RoutePlanningInputs | null;
  performance: AircraftPerformancePlanInputs | null;
  profile: AircraftPerformanceProfile;
  preliminaryRoute: CalculatedPerformanceRoute | null;
  additionalPreliminaryRoutes?: readonly CalculatedPerformanceRoute[];
  requestKey: number;
}

export interface UseOpenMeteoPerformanceWindsResult {
  winds: readonly ForecastLegWind[];
  status: RouteForecastStatus;
  canLoad: boolean;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown forecast error';
}

export function useOpenMeteoPerformanceWinds({
  enabled,
  flightPlan,
  navigation,
  performance,
  profile,
  preliminaryRoute,
  additionalPreliminaryRoutes = [],
  requestKey,
}: UseOpenMeteoPerformanceWindsInput): UseOpenMeteoPerformanceWindsResult {
  const [stored, setStored] = useState<StoredForecastState>({ status: 'idle' });
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeContextKeyRef = useRef<string | null>(null);
  const contextKey = useMemo(
    () => JSON.stringify({
      flightPlan,
      navigation,
      performance,
      profile,
      additionalPreliminaryRoutes,
    }),
    [
      additionalPreliminaryRoutes,
      flightPlan,
      navigation,
      performance,
      profile,
    ],
  );
  const initialRequests = useMemo(() => {
    if (preliminaryRoute?.status !== 'ok') {
      return [];
    }

    return [
      ...buildPerformanceWeatherSampleRequests(preliminaryRoute),
      ...additionalPreliminaryRoutes.flatMap((route) =>
        buildPerformanceWeatherSampleRequests(route),
      ),
    ];
  }, [additionalPreliminaryRoutes, preliminaryRoute]);
  const canLoad =
    navigation !== null &&
    performance !== null &&
    initialRequests.length > 0;

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
    if (
      requestKey <= 0 ||
      !enabled ||
      !canLoad ||
      navigation === null ||
      performance === null
    ) {
      return;
    }

    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    activeContextKeyRef.current = contextKey;
    setStored({ status: 'loading', contextKey });

    void (async () => {
      try {
        let winds = await fetchOpenMeteoLegWinds(
          initialRequests,
          abortController.signal,
        );
        const firstRoute = calculatePerformanceRoute({
          flightPlan,
          navigation,
          performance,
          profile,
          resolveWind: createSampledWindResolver(winds, navigation.wind),
        });
        const refinedRequests = [
          ...buildPerformanceWeatherSampleRequests(firstRoute),
          ...additionalPreliminaryRoutes.flatMap((route) =>
            buildPerformanceWeatherSampleRequests(route),
          ),
        ];
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

        if (!abortController.signal.aborted) {
          setStored({ status: 'success', contextKey, winds, refined });
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setStored({ status: 'error', contextKey, message: errorMessage(error) });
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

  const status = resolveExplicitForecastStatus(enabled, contextKey, stored);

  return {
    winds: status.status === 'success' ? status.winds : [],
    status,
    canLoad,
  };
}
