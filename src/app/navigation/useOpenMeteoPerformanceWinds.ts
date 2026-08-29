import { useEffect, useMemo, useState } from 'react';

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
import type { RouteForecastStatus } from './useOpenMeteoRouteWinds';

const FORECAST_DEBOUNCE_MS = 300;

type StoredState =
  | { status: 'idle' }
  | { status: 'loading'; contextKey: string }
  | { status: 'success'; contextKey: string; winds: ForecastLegWind[]; refined: boolean }
  | { status: 'error'; contextKey: string; message: string };

export interface UseOpenMeteoPerformanceWindsInput {
  enabled: boolean;
  flightPlan: FlightPlan;
  navigation: RoutePlanningInputs | null;
  performance: AircraftPerformancePlanInputs | null;
  profile: AircraftPerformanceProfile;
  preliminaryRoute: CalculatedPerformanceRoute | null;
  additionalPreliminaryRoutes?: readonly CalculatedPerformanceRoute[];
}

export interface UseOpenMeteoPerformanceWindsResult {
  winds: readonly ForecastLegWind[];
  status: RouteForecastStatus;
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
}: UseOpenMeteoPerformanceWindsInput): UseOpenMeteoPerformanceWindsResult {
  const [stored, setStored] = useState<StoredState>({ status: 'idle' });
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

  useEffect(() => {
    if (
      !enabled ||
      navigation === null ||
      performance === null ||
      preliminaryRoute?.status !== 'ok'
    ) {
      setStored({ status: 'idle' });
      return;
    }

    const additionalRequests = additionalPreliminaryRoutes.flatMap((route) =>
      buildPerformanceWeatherSampleRequests(route),
    );
    const initialRequests = [
      ...buildPerformanceWeatherSampleRequests(preliminaryRoute),
      ...additionalRequests,
    ];

    if (initialRequests.length === 0) {
      setStored({ status: 'idle' });
      return;
    }

    const abortController = new AbortController();
    const timeoutId = window.setTimeout(() => {
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
            ...additionalRequests,
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
        }
      })();
    }, FORECAST_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
      abortController.abort();
    };
  }, [
    contextKey,
    enabled,
    flightPlan,
    navigation,
    performance,
    preliminaryRoute,
    additionalPreliminaryRoutes,
    profile,
  ]);

  if (!enabled || stored.status === 'idle' || stored.contextKey !== contextKey) {
    return { winds: [], status: { status: 'idle' } };
  }

  if (stored.status === 'success') {
    return {
      winds: stored.winds,
      status: { status: 'success', winds: stored.winds, refined: stored.refined },
    };
  }

  return {
    winds: [],
    status:
      stored.status === 'loading'
        ? { status: 'loading' }
        : { status: 'error', message: stored.message },
  };
}
