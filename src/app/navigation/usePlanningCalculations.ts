import { useMemo } from 'react';

import {
  calculateNavigationRoute,
  calculatePerformanceRoute,
  calculatePlanningEnvironment,
  calculateTasFromIas,
} from '../../calculations';
import type {
  CalculatedNavigationRoute,
  CalculatedPerformanceRoute,
} from '../../calculations';
import type { AircraftDefinition, FlightPlan } from '../../domain';
import { createSampledWindResolver } from '../../weather';
import type { ForecastLegWind } from '../../weather';
import { calculateNavigationSummaryRoute } from './calculateNavigationSummaryRoute';
import {
  parseNavigationInputDraft,
} from './navigationInput';
import type {
  NavigationInputDraft,
  NavigationInputParseResult,
} from './navigationInput';
import { parsePerformanceInputDraft } from './performanceInput';
import type {
  PerformanceInputDraft,
  PerformanceInputParseResult,
} from './performanceInput';
import { useOpenMeteoPerformanceWinds } from './useOpenMeteoPerformanceWinds';
import { useOpenMeteoRouteWinds } from './useOpenMeteoRouteWinds';
import type { RouteForecastStatus } from './useOpenMeteoRouteWinds';

export interface PlanningCalculations {
  parsedInputs: NavigationInputParseResult;
  parsedPerformance: PerformanceInputParseResult;
  calculatedRoute: CalculatedNavigationRoute;
  performanceRoute: CalculatedPerformanceRoute | null;
  forecast: {
    winds: readonly ForecastLegWind[];
    status: RouteForecastStatus;
  };
}

export interface UsePlanningCalculationsInput {
  flightPlan: FlightPlan;
  aircraftDefinition: AircraftDefinition;
  navigationDraft: NavigationInputDraft;
  performanceDraft: PerformanceInputDraft;
  useForecastWinds: boolean;
}

/** Central React orchestration for derived route, performance, and weather data. */
export function usePlanningCalculations({
  flightPlan,
  aircraftDefinition,
  navigationDraft,
  performanceDraft,
  useForecastWinds,
}: UsePlanningCalculationsInput): PlanningCalculations {
  const parsedInputs = useMemo(
    () => parseNavigationInputDraft(navigationDraft),
    [navigationDraft],
  );
  const parsedPerformance = useMemo(
    () => parsePerformanceInputDraft(
      performanceDraft,
      flightPlan.sectorBoundaryWaypointIds ?? [],
    ),
    [flightPlan.sectorBoundaryWaypointIds, performanceDraft],
  );
  const legacyPlanning = useMemo(() => {
    if (
      parsedInputs.status !== 'valid' ||
      parsedPerformance.status !== 'valid'
    ) {
      return null;
    }

    const environment = calculatePlanningEnvironment(
      parsedPerformance.value.departureWeather,
      parsedPerformance.value.destinationWeather,
    );

    return {
      ...parsedInputs.value,
      trueAirspeedKt: calculateTasFromIas(
        aircraftDefinition.performance.cruise.iasKt,
        parsedPerformance.value.defaultAltitudeFtMsl,
        environment.qnhHpa,
        environment.isaDeviationC,
      ),
      plannedAltitudeFtMsl: parsedPerformance.value.defaultAltitudeFtMsl,
    };
  }, [aircraftDefinition, parsedInputs, parsedPerformance]);
  const manualWindRoute = useMemo(
    () => calculateNavigationRoute({ flightPlan, planning: legacyPlanning }),
    [flightPlan, legacyPlanning],
  );
  const manualPerformanceRoute = useMemo(() => {
    if (
      parsedInputs.status !== 'valid' ||
      parsedPerformance.status !== 'valid'
    ) {
      return null;
    }

    return calculatePerformanceRoute({
      flightPlan,
      navigation: parsedInputs.value,
      performance: parsedPerformance.value,
      profile: aircraftDefinition.performance,
    });
  }, [aircraftDefinition, flightPlan, parsedInputs, parsedPerformance]);
  const legForecast = useOpenMeteoRouteWinds({
    enabled: useForecastWinds && parsedPerformance.status !== 'valid',
    flightPlan,
    planning: legacyPlanning,
    preliminaryRoute: manualWindRoute,
  });
  const performanceForecast = useOpenMeteoPerformanceWinds({
    enabled: useForecastWinds && parsedPerformance.status === 'valid',
    flightPlan,
    navigation: parsedInputs.status === 'valid' ? parsedInputs.value : null,
    performance:
      parsedPerformance.status === 'valid' ? parsedPerformance.value : null,
    profile: aircraftDefinition.performance,
    preliminaryRoute: manualPerformanceRoute,
  });
  const forecast =
    parsedPerformance.status === 'valid'
      ? performanceForecast
      : {
          winds:
            legForecast.status.status === 'success'
              ? legForecast.status.winds
              : [],
          status: legForecast.status,
        };
  const calculatedRoute = useMemo(
    () =>
      calculateNavigationSummaryRoute({
        flightPlan,
        planning: legacyPlanning,
        forecastWinds: forecast.winds,
        performancePlanActive: parsedPerformance.status === 'valid',
      }),
    [flightPlan, forecast.winds, legacyPlanning, parsedPerformance.status],
  );
  const performanceRoute = useMemo(() => {
    if (
      parsedInputs.status !== 'valid' ||
      parsedPerformance.status !== 'valid'
    ) {
      return null;
    }

    return calculatePerformanceRoute({
      flightPlan,
      navigation: parsedInputs.value,
      performance: parsedPerformance.value,
      profile: aircraftDefinition.performance,
      resolveWind: createSampledWindResolver(
        forecast.winds,
        parsedInputs.value.wind,
      ),
    });
  }, [
    aircraftDefinition,
    flightPlan,
    forecast.winds,
    parsedInputs,
    parsedPerformance,
  ]);

  return {
    parsedInputs,
    parsedPerformance,
    calculatedRoute,
    performanceRoute,
    forecast,
  };
}
