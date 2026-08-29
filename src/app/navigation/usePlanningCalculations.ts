import { useMemo } from 'react';

import {
  calculateNavigationRoute,
  applyLegMagneticVariations,
  calculateRouteMagneticVariations,
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
import { calculateWithOptionalForecast } from './forecastCalculationSelection';
import {
  parseNavigationInputDraft,
} from './navigationInput';
import type {
  NavigationInputDraft,
  NavigationInputParseResult,
} from './navigationInput';
import { parsePerformanceInputDraft } from './performanceInput';
import type {
  PerformanceInputDefaults,
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
  alternateCalculatedRoute: CalculatedNavigationRoute | null;
  alternateTrueAirspeedKt: number | null;
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
  performanceInputDefaults: PerformanceInputDefaults;
  operationalDraft: OperationalInputDraft;
  useForecastWinds: boolean;
}

/** Central React orchestration for derived route, performance, and weather data. */
export function usePlanningCalculations({
  flightPlan,
  aircraftDefinition,
  navigationDraft,
  performanceDraft,
  performanceInputDefaults,
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
      performanceInputDefaults,
    ),
    [
      derivedMassKg,
      flightPlan.sectorBoundaryWaypointIds,
      performanceDraft,
      performanceInputDefaults,
    ],
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
  const performanceForecast = useOpenMeteoPerformanceWinds({
    enabled: useForecastWinds && parsedPerformance.status === 'valid',
    flightPlan,
    navigation: parsedInputs.status === 'valid' ? parsedInputs.value : null,
    performance:
      parsedPerformance.status === 'valid' ? parsedPerformance.value : null,
    profile: aircraftDefinition.performance,
    preliminaryRoute: manualPerformanceRoute,
    additionalPreliminaryRoutes: [],
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
  const baseCalculatedRoute = useMemo(
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

    return calculateWithOptionalForecast(
      manualOperationalPlan,
      forecast.winds,
      () => calculateOperationalFlightPlan({
        flightPlan,
        navigation: parsedInputs.value,
        performance: parsedPerformance.value,
        aircraft: aircraftDefinition,
        operational: parsedOperational.value,
        resolveWind: createSampledWindResolver(
          forecast.winds,
          parsedInputs.value.wind,
        ),
      }),
    );
  }, [
    aircraftDefinition,
    flightPlan,
    forecast.winds,
    manualOperationalPlan,
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
  const calculatedRoute = useMemo(() => {
    if (parsedInputs.status !== 'valid') {
      return baseCalculatedRoute;
    }

    return applyLegMagneticVariations(
      baseCalculatedRoute,
      calculateRouteMagneticVariations({
        flightPlan,
        navigationRoute: baseCalculatedRoute,
        performanceRoute,
        mode: parsedInputs.value.magneticVariationMode,
        manualVariationDegEast: parsedInputs.value.magneticVariationDegEast,
        fallbackAltitudeFtMsl: legacyPlanning?.plannedAltitudeFtMsl ?? null,
      }),
    );
  }, [
    baseCalculatedRoute,
    flightPlan,
    legacyPlanning?.plannedAltitudeFtMsl,
    parsedInputs,
    performanceRoute,
  ]);
  const alternateCalculatedRoute = useMemo(() => {
    if (
      parsedInputs.status !== 'valid' ||
      parsedOperational.status !== 'valid' ||
      legacyPlanning === null ||
      operationalPlan?.status !== 'ok'
    ) {
      return null;
    }
    const finalWaypoint = flightPlan.waypoints.at(-1);
    const alternateWaypoint = parsedOperational.value.alternate?.waypoint;
    if (finalWaypoint === undefined || alternateWaypoint === undefined) {
      return null;
    }

    const alternateFlightPlan: FlightPlan = {
      waypoints: [finalWaypoint, alternateWaypoint],
      legShapes: [],
      sectorBoundaryWaypointIds: [],
    };
    const alternateDepartureTimeUtcMs =
      performanceRoute?.status === 'ok'
        ? performanceRoute.estimatedArrivalTimeUtcMs
        : baseCalculatedRoute.estimatedArrivalTimeUtcMs;
    const baseRoute = calculateNavigationRoute({
      flightPlan: alternateFlightPlan,
      planning: {
        ...legacyPlanning,
        departureTimeUtcMs: alternateDepartureTimeUtcMs ??
          legacyPlanning.departureTimeUtcMs,
      },
    });
    return applyLegMagneticVariations(
      baseRoute,
      calculateRouteMagneticVariations({
        flightPlan: alternateFlightPlan,
        navigationRoute: baseRoute,
        mode: parsedInputs.value.magneticVariationMode,
        manualVariationDegEast: parsedInputs.value.magneticVariationDegEast,
        fallbackAltitudeFtMsl: legacyPlanning.plannedAltitudeFtMsl,
      }),
    );
  }, [
    flightPlan.waypoints,
    legacyPlanning,
    baseCalculatedRoute.estimatedArrivalTimeUtcMs,
    operationalPlan,
    parsedInputs,
    parsedOperational,
    performanceRoute,
  ]);

  return {
    parsedInputs,
    parsedPerformance,
    parsedOperational,
    derivedTakeoffMassKg: derivedMassKg ?? null,
    calculatedRoute,
    alternateCalculatedRoute,
    alternateTrueAirspeedKt: legacyPlanning?.trueAirspeedKt ?? null,
    performanceRoute,
    operationalPlan,
    forecast,
  };
}
