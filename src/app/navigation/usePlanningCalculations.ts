import { useMemo } from 'react';

import {
  calculateNavigationRoute,
  calculateInitialTakeoffLoading,
  calculateOperationalFlightPlan,
  calculatePerformanceRoute,
  calculatePlanningEnvironment,
  calculateTasFromIas,
} from '../../calculations';
import type {
  CalculatedNavigationRoute,
  CalculatedPerformanceRoute,
  CalculatedOperationalFlightPlan,
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
import {
  parseOperationalInputDraft,
} from './operationalInput';
import type {
  OperationalInputDraft,
  OperationalInputParseResult,
} from './operationalInput';
import { useOpenMeteoPerformanceWinds } from './useOpenMeteoPerformanceWinds';
import { useOpenMeteoRouteWinds } from './useOpenMeteoRouteWinds';
import type { RouteForecastStatus } from './useOpenMeteoRouteWinds';

export interface PlanningCalculations {
  parsedInputs: NavigationInputParseResult;
  parsedPerformance: PerformanceInputParseResult;
  parsedOperational: OperationalInputParseResult;
  derivedTakeoffMassKg: number | null;
  calculatedRoute: CalculatedNavigationRoute;
  performanceRoute: CalculatedPerformanceRoute | null;
  operationalPlan: CalculatedOperationalFlightPlan | null;
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
  operationalDraft: OperationalInputDraft;
  useForecastWinds: boolean;
}

/** Central React orchestration for derived route, performance, and weather data. */
export function usePlanningCalculations({
  flightPlan,
  aircraftDefinition,
  navigationDraft,
  performanceDraft,
  operationalDraft,
  useForecastWinds,
}: UsePlanningCalculationsInput): PlanningCalculations {
  const parsedInputs = useMemo(
    () => parseNavigationInputDraft(navigationDraft),
    [navigationDraft],
  );
  const parsedOperational = useMemo(
    () => parseOperationalInputDraft(
      operationalDraft,
      aircraftDefinition,
      flightPlan.sectorBoundaryWaypointIds ?? [],
    ),
    [
      aircraftDefinition,
      flightPlan.sectorBoundaryWaypointIds,
      operationalDraft,
    ],
  );
  const derivedMassKg = useMemo(
    () => {
      if (parsedOperational.status !== 'valid') {
        return undefined;
      }

      try {
        return calculateInitialTakeoffLoading(
          aircraftDefinition,
          parsedOperational.value,
        ).totalMassKg;
      } catch {
        return undefined;
      }
    },
    [aircraftDefinition, parsedOperational],
  );
  const parsedPerformance = useMemo(
    () => parsePerformanceInputDraft(
      performanceDraft,
      flightPlan.sectorBoundaryWaypointIds ?? [],
      derivedMassKg,
    ),
    [derivedMassKg, flightPlan.sectorBoundaryWaypointIds, performanceDraft],
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
  const manualOperationalPlan = useMemo(() => {
    if (
      parsedInputs.status !== 'valid' ||
      parsedPerformance.status !== 'valid' ||
      parsedOperational.status !== 'valid'
    ) {
      return null;
    }

    return calculateOperationalFlightPlan({
      flightPlan,
      navigation: parsedInputs.value,
      performance: parsedPerformance.value,
      aircraft: aircraftDefinition,
      operational: parsedOperational.value,
    });
  }, [
    aircraftDefinition,
    flightPlan,
    parsedInputs,
    parsedOperational,
    parsedPerformance,
  ]);
  const manualPerformanceRoute = useMemo(() => {
    if (
      parsedInputs.status !== 'valid' ||
      parsedPerformance.status !== 'valid'
    ) {
      return null;
    }

    if (manualOperationalPlan?.status === 'ok') {
      return manualOperationalPlan.performanceRoute;
    }

    return calculatePerformanceRoute({
      flightPlan,
      navigation: parsedInputs.value,
      performance: parsedPerformance.value,
      profile: aircraftDefinition.performance,
    });
  }, [
    aircraftDefinition,
    flightPlan,
    manualOperationalPlan,
    parsedInputs,
    parsedPerformance,
  ]);
  const legForecast = useOpenMeteoRouteWinds({
    enabled: useForecastWinds && parsedPerformance.status !== 'valid',
    flightPlan,
    planning: legacyPlanning,
    preliminaryRoute: manualWindRoute,
  });
  const additionalPreliminaryRoutes = useMemo(
    () =>
      manualOperationalPlan?.status === 'ok' &&
      manualOperationalPlan.alternatePerformanceRoute !== null
        ? [manualOperationalPlan.alternatePerformanceRoute]
        : [],
    [manualOperationalPlan],
  );
  const performanceForecast = useOpenMeteoPerformanceWinds({
    enabled: useForecastWinds && parsedPerformance.status === 'valid',
    flightPlan,
    navigation: parsedInputs.status === 'valid' ? parsedInputs.value : null,
    performance:
      parsedPerformance.status === 'valid' ? parsedPerformance.value : null,
    profile: aircraftDefinition.performance,
    preliminaryRoute: manualPerformanceRoute,
    additionalPreliminaryRoutes,
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
  const operationalPlan = useMemo(() => {
    if (
      parsedInputs.status !== 'valid' ||
      parsedPerformance.status !== 'valid' ||
      parsedOperational.status !== 'valid'
    ) {
      return null;
    }

    return calculateOperationalFlightPlan({
      flightPlan,
      navigation: parsedInputs.value,
      performance: parsedPerformance.value,
      aircraft: aircraftDefinition,
      operational: parsedOperational.value,
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
    parsedOperational,
    parsedPerformance,
  ]);
  const performanceRoute = useMemo(() => {
    if (
      parsedInputs.status !== 'valid' ||
      parsedPerformance.status !== 'valid'
    ) {
      return null;
    }

    if (operationalPlan?.status === 'ok') {
      return operationalPlan.performanceRoute;
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
    operationalPlan,
    parsedInputs,
    parsedPerformance,
  ]);

  return {
    parsedInputs,
    parsedPerformance,
    parsedOperational,
    derivedTakeoffMassKg: derivedMassKg ?? null,
    calculatedRoute,
    performanceRoute,
    operationalPlan,
    forecast,
  };
}
