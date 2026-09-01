import { useCallback, useMemo, useState } from 'react';

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
import type {
  AircraftDefinition,
  AircraftPerformancePlanInputs,
  FlightPlan,
} from '../../domain';
import { createSampledWindResolver } from '../../weather';
import type { ForecastLegWind } from '../../weather';
import { calculateNavigationSummaryRoute } from './calculateNavigationSummaryRoute';
import {
  clearCalculationBreadcrumb,
  measureDevelopmentCalculation,
  readUnfinishedCalculationBreadcrumb,
} from './calculationTiming';
import type { CalculationBreadcrumb } from './calculationTiming';
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

const NO_ADDITIONAL_PERFORMANCE_ROUTES:
  readonly CalculatedPerformanceRoute[] = [];
const EMPTY_CALCULATED_ROUTE: CalculatedNavigationRoute = {
  departureTimeUtcMs: null,
  legs: [],
  totalDistanceNm: 0,
  totalEetSeconds: null,
  estimatedArrivalTimeUtcMs: null,
};

function calculationContext(
  flightPlan: FlightPlan,
  performance?: AircraftPerformancePlanInputs,
): Readonly<Record<string, number>> {
  const plannedAltitudes = performance === undefined
    ? []
    : [
        performance.defaultAltitudeFtMsl,
        performance.departureElevationFtMsl,
        performance.destinationElevationFtMsl,
        ...performance.legAltitudePlans.flatMap((plan) => [
          ...(plan.altitudeFtMsl === undefined ? [] : [plan.altitudeFtMsl]),
          ...(plan.endAltitudeFtMsl === undefined
            ? []
            : [plan.endAltitudeFtMsl]),
        ]),
      ];

  return {
    waypointCount: flightPlan.waypoints.length,
    shapingPointCount: flightPlan.legShapes.reduce(
      (count, shape) => count + shape.points.length,
      0,
    ),
    altitudePlanCount: performance?.legAltitudePlans.length ?? 0,
    sectorCount: (flightPlan.sectorBoundaryWaypointIds?.length ?? 0) + 1,
    maximumPlannedAltitudeFt:
      plannedAltitudes.length === 0 ? 0 : Math.max(...plannedAltitudes),
  };
}

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
  calculationRecovery: CalculationBreadcrumb | null;
  calculationsSuspended: boolean;
  resumeCalculations: () => void;
  forecast: {
    winds: readonly ForecastLegWind[];
    status: RouteForecastStatus;
    canLoad: boolean;
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
  forecastRequestKey: number;
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
  forecastRequestKey,
}: UsePlanningCalculationsInput): PlanningCalculations {
  const [calculationRecovery, setCalculationRecovery] =
    useState<CalculationBreadcrumb | null>(
      () => readUnfinishedCalculationBreadcrumb(),
    );
  const calculationsSuspended = calculationRecovery !== null;
  const resumeCalculations = useCallback(() => {
    clearCalculationBreadcrumb();
    setCalculationRecovery(null);
  }, []);
  const parsedInputs = useMemo(
    () => parseNavigationInputDraft(navigationDraft),
    [navigationDraft],
  );
  const parsedOperational = useMemo(
    () => parseOperationalInputDraft(
      operationalDraft,
      aircraftDefinition,
      flightPlan.sectorBoundaryWaypointIds ?? [],
      [
        ...(flightPlan.sectorBoundaryWaypointIds ?? []),
        ...(flightPlan.waypoints.at(-1) === undefined
          ? []
          : [flightPlan.waypoints.at(-1)!.id]),
      ],
    ),
    [
      aircraftDefinition,
      flightPlan.sectorBoundaryWaypointIds,
      flightPlan.waypoints,
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
      calculationsSuspended ||
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
  }, [
    aircraftDefinition,
    calculationsSuspended,
    parsedInputs,
    parsedPerformance,
  ]);
  const manualWindRoute = useMemo(
    () => calculationsSuspended
      ? EMPTY_CALCULATED_ROUTE
      : measureDevelopmentCalculation(
          'manual navigation route',
          () => calculateNavigationRoute({ flightPlan, planning: legacyPlanning }),
          calculationContext(flightPlan),
        ),
    [calculationsSuspended, flightPlan, legacyPlanning],
  );
  const manualOperationalPlan = useMemo(() => {
    if (
      calculationsSuspended ||
      parsedInputs.status !== 'valid' ||
      parsedPerformance.status !== 'valid' ||
      parsedOperational.status !== 'valid'
    ) {
      return null;
    }

    return measureDevelopmentCalculation(
      'manual operational flight plan',
      () => calculateOperationalFlightPlan({
        flightPlan,
        navigation: parsedInputs.value,
        performance: parsedPerformance.value,
        aircraft: aircraftDefinition,
        operational: parsedOperational.value,
      }),
      calculationContext(flightPlan, parsedPerformance.value),
    );
  }, [
    aircraftDefinition,
    calculationsSuspended,
    flightPlan,
    parsedInputs,
    parsedOperational,
    parsedPerformance,
  ]);
  const manualPerformanceRoute = useMemo(() => {
    if (
      calculationsSuspended ||
      parsedInputs.status !== 'valid' ||
      parsedPerformance.status !== 'valid'
    ) {
      return null;
    }

    if (manualOperationalPlan?.status === 'ok') {
      return manualOperationalPlan.performanceRoute;
    }

    return measureDevelopmentCalculation(
      'manual performance route',
      () => calculatePerformanceRoute({
        flightPlan,
        navigation: parsedInputs.value,
        performance: parsedPerformance.value,
        profile: aircraftDefinition.performance,
      }),
      calculationContext(flightPlan, parsedPerformance.value),
    );
  }, [
    aircraftDefinition,
    calculationsSuspended,
    flightPlan,
    manualOperationalPlan,
    parsedInputs,
    parsedPerformance,
  ]);
  const legForecast = useOpenMeteoRouteWinds({
    enabled:
      !calculationsSuspended &&
      useForecastWinds &&
      parsedPerformance.status !== 'valid',
    flightPlan,
    planning: legacyPlanning,
    preliminaryRoute: manualWindRoute,
    requestKey: forecastRequestKey,
  });
  const performanceForecast = useOpenMeteoPerformanceWinds({
    enabled:
      !calculationsSuspended &&
      useForecastWinds &&
      parsedPerformance.status === 'valid',
    flightPlan,
    navigation: parsedInputs.status === 'valid' ? parsedInputs.value : null,
    performance:
      parsedPerformance.status === 'valid' ? parsedPerformance.value : null,
    profile: aircraftDefinition.performance,
    preliminaryRoute: manualPerformanceRoute,
    additionalPreliminaryRoutes: NO_ADDITIONAL_PERFORMANCE_ROUTES,
    requestKey: forecastRequestKey,
  });
  const selectedForecast = parsedPerformance.status === 'valid'
      ? performanceForecast
      : {
          winds:
            legForecast.status.status === 'success'
              ? legForecast.status.winds
              : [],
          status: legForecast.status,
          canLoad: legForecast.canLoad,
        };
  const forecast = calculationsSuspended
    ? {
        winds: [] as readonly ForecastLegWind[],
        status: { status: 'idle' as const },
        canLoad: false,
      }
    : selectedForecast;
  const baseCalculatedRoute = useMemo(
    () =>
      calculationsSuspended
        ? EMPTY_CALCULATED_ROUTE
        : measureDevelopmentCalculation(
            'navigation summary route',
            () => calculateNavigationSummaryRoute({
              flightPlan,
              planning: legacyPlanning,
              forecastWinds: forecast.winds,
              performancePlanActive: parsedPerformance.status === 'valid',
            }),
            calculationContext(flightPlan),
          ),
    [
      calculationsSuspended,
      flightPlan,
      forecast.winds,
      legacyPlanning,
      parsedPerformance.status,
    ],
  );
  const operationalPlan = useMemo(() => {
    if (
      calculationsSuspended ||
      parsedInputs.status !== 'valid' ||
      parsedPerformance.status !== 'valid' ||
      parsedOperational.status !== 'valid'
    ) {
      return null;
    }

    return calculateWithOptionalForecast(
      manualOperationalPlan,
      forecast.winds,
      () => measureDevelopmentCalculation(
        'forecast operational flight plan',
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
        calculationContext(flightPlan, parsedPerformance.value),
      ),
    );
  }, [
    aircraftDefinition,
    calculationsSuspended,
    flightPlan,
    forecast.winds,
    manualOperationalPlan,
    parsedInputs,
    parsedOperational,
    parsedPerformance,
  ]);
  const performanceRoute = useMemo(() => {
    if (
      calculationsSuspended ||
      parsedInputs.status !== 'valid' ||
      parsedPerformance.status !== 'valid'
    ) {
      return null;
    }

    if (operationalPlan?.status === 'ok') {
      return operationalPlan.performanceRoute;
    }

    return measureDevelopmentCalculation(
      'forecast performance route',
      () => calculatePerformanceRoute({
        flightPlan,
        navigation: parsedInputs.value,
        performance: parsedPerformance.value,
        profile: aircraftDefinition.performance,
        resolveWind: createSampledWindResolver(
          forecast.winds,
          parsedInputs.value.wind,
        ),
      }),
      calculationContext(flightPlan, parsedPerformance.value),
    );
  }, [
    aircraftDefinition,
    calculationsSuspended,
    flightPlan,
    forecast.winds,
    operationalPlan,
    parsedInputs,
    parsedPerformance,
  ]);
  const calculatedRoute = useMemo(() => {
    if (calculationsSuspended || parsedInputs.status !== 'valid') {
      return baseCalculatedRoute;
    }

    return measureDevelopmentCalculation(
      'route magnetic variation',
      () => applyLegMagneticVariations(
        baseCalculatedRoute,
        calculateRouteMagneticVariations({
          flightPlan,
          navigationRoute: baseCalculatedRoute,
          performanceRoute,
          mode: parsedInputs.value.magneticVariationMode,
          manualVariationDegEast: parsedInputs.value.magneticVariationDegEast,
          fallbackAltitudeFtMsl: legacyPlanning?.plannedAltitudeFtMsl ?? null,
        }),
      ),
      calculationContext(flightPlan),
    );
  }, [
    baseCalculatedRoute,
    calculationsSuspended,
    flightPlan,
    legacyPlanning?.plannedAltitudeFtMsl,
    parsedInputs,
    performanceRoute,
  ]);
  const alternateCalculatedRoute = useMemo(() => {
    if (
      calculationsSuspended ||
      parsedInputs.status !== 'valid' ||
      parsedPerformance.status !== 'valid' ||
      parsedOperational.status !== 'valid' ||
      legacyPlanning === null ||
      operationalPlan?.status !== 'ok'
    ) {
      return null;
    }
    const finalWaypoint = flightPlan.waypoints.at(-1);
    const alternate = parsedOperational.value.alternate;
    const alternateWaypoint = alternate?.waypoint;
    if (finalWaypoint === undefined || alternateWaypoint === undefined || alternate === null) {
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
    const environment = calculatePlanningEnvironment(
      parsedPerformance.value.departureWeather,
      parsedPerformance.value.destinationWeather,
    );
    const alternatePlanning = {
      ...legacyPlanning,
      trueAirspeedKt: calculateTasFromIas(
        aircraftDefinition.performance.cruise.iasKt,
        alternate.plannedAltitudeFtMsl,
        environment.qnhHpa,
        environment.isaDeviationC,
      ),
      plannedAltitudeFtMsl: alternate.plannedAltitudeFtMsl,
      departureTimeUtcMs: alternateDepartureTimeUtcMs ??
        legacyPlanning.departureTimeUtcMs,
    };
    const context = calculationContext(flightPlan, parsedPerformance.value);
    const baseRoute = measureDevelopmentCalculation(
      'alternate navigation route',
      () => calculateNavigationRoute({
        flightPlan: alternateFlightPlan,
        planning: alternatePlanning,
      }),
      context,
    );
    return measureDevelopmentCalculation(
      'alternate route magnetic variation',
      () => applyLegMagneticVariations(
        baseRoute,
        calculateRouteMagneticVariations({
          flightPlan: alternateFlightPlan,
          navigationRoute: baseRoute,
          mode: parsedInputs.value.magneticVariationMode,
          manualVariationDegEast: parsedInputs.value.magneticVariationDegEast,
          fallbackAltitudeFtMsl: alternatePlanning.plannedAltitudeFtMsl,
        }),
      ),
      context,
    );
  }, [
    calculationsSuspended,
    flightPlan.waypoints,
    legacyPlanning,
    baseCalculatedRoute.estimatedArrivalTimeUtcMs,
    operationalPlan,
    parsedInputs,
    parsedPerformance,
    parsedOperational,
    performanceRoute,
  ]);
  const alternateTrueAirspeedKt = useMemo(() => {
    if (
      calculationsSuspended ||
      parsedPerformance.status !== 'valid' ||
      parsedOperational.status !== 'valid' ||
      parsedOperational.value.alternate === null
    ) {
      return legacyPlanning?.trueAirspeedKt ?? null;
    }

    const environment = calculatePlanningEnvironment(
      parsedPerformance.value.departureWeather,
      parsedPerformance.value.destinationWeather,
    );
    return calculateTasFromIas(
      aircraftDefinition.performance.cruise.iasKt,
      parsedOperational.value.alternate.plannedAltitudeFtMsl,
      environment.qnhHpa,
      environment.isaDeviationC,
    );
  }, [
    aircraftDefinition,
    calculationsSuspended,
    legacyPlanning?.trueAirspeedKt,
    parsedOperational,
    parsedPerformance,
  ]);

  return {
    parsedInputs,
    parsedPerformance,
    parsedOperational,
    derivedTakeoffMassKg: derivedMassKg ?? null,
    calculatedRoute,
    alternateCalculatedRoute,
    alternateTrueAirspeedKt,
    performanceRoute,
    operationalPlan,
    calculationRecovery,
    calculationsSuspended,
    resumeCalculations,
    forecast,
  };
}
