import { useMemo } from 'react';

import {
  calculateNavigationRoute,
  calculatePerformanceRoute,
  calculatePlanningEnvironment,
  calculateTasFromIas,
  PROJECT_AIRCRAFT_PERFORMANCE_PROFILE,
} from '../../calculations';
import type { FlightPlan } from '../../domain';
import { RouteTable } from '../route/RouteTable';
import {
  parseNavigationInputDraft,
} from './navigationInput';
import type { NavigationInputDraft } from './navigationInput';
import { AircraftPerformanceInputs } from './AircraftPerformanceInputs';
import { LegAltitudeControls } from './LegAltitudeControls';
import type { AltitudePlacementLeg } from './altitudePlanState';
import {
  parsePerformanceInputDraft,
} from './performanceInput';
import type { PerformanceInputDraft } from './performanceInput';
import { useOpenMeteoRouteWinds } from './useOpenMeteoRouteWinds';
import { useOpenMeteoPerformanceWinds } from './useOpenMeteoPerformanceWinds';
import { createSampledWindResolver } from '../../weather';
import {
  FORECAST_SOURCE_LABEL,
  formatForecastRetrievalTime,
  formatForecastValidTimeRange,
} from './weatherFormatting';

export interface NavigationLogProps {
  flightPlan: FlightPlan;
  draft: NavigationInputDraft;
  performanceDraft: PerformanceInputDraft;
  useForecastWinds: boolean;
  onDraftChange: (draft: NavigationInputDraft) => void;
  onPerformanceDraftChange: (draft: PerformanceInputDraft) => void;
  onUseForecastWindsChange: (enabled: boolean) => void;
  altitudePlacementLeg: AltitudePlacementLeg | null;
  onAltitudePlacementLegChange: (leg: AltitudePlacementLeg | null) => void;
}

export function NavigationLog({
  flightPlan,
  draft,
  performanceDraft,
  useForecastWinds,
  onDraftChange,
  onPerformanceDraftChange,
  onUseForecastWindsChange,
  altitudePlacementLeg,
  onAltitudePlacementLegChange,
}: NavigationLogProps) {
  const parsedInputs = useMemo(
    () => parseNavigationInputDraft(draft),
    [draft],
  );
  const parsedPerformance = useMemo(
    () => parsePerformanceInputDraft(performanceDraft),
    [performanceDraft],
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
        PROJECT_AIRCRAFT_PERFORMANCE_PROFILE.cruiseIasKt,
        parsedPerformance.value.defaultAltitudeFtMsl,
        environment.qnhHpa,
        environment.isaDeviationC,
      ),
      plannedAltitudeFtMsl:
        parsedPerformance.value.defaultAltitudeFtMsl,
    };
  }, [parsedInputs, parsedPerformance]);
  const manualWindRoute = useMemo(
    () =>
      calculateNavigationRoute({
        flightPlan,
        planning: legacyPlanning,
      }),
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
    });
  }, [flightPlan, parsedInputs, parsedPerformance]);
  const legForecast = useOpenMeteoRouteWinds({
    enabled: useForecastWinds && parsedPerformance.status !== 'valid',
    flightPlan,
    planning: legacyPlanning,
    preliminaryRoute: manualWindRoute,
  });
  const performanceForecast = useOpenMeteoPerformanceWinds({
    enabled: useForecastWinds && parsedPerformance.status === 'valid',
    flightPlan,
    navigation:
      parsedInputs.status === 'valid' ? parsedInputs.value : null,
    performance:
      parsedPerformance.status === 'valid'
        ? parsedPerformance.value
        : null,
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
      calculateNavigationRoute({
        flightPlan,
        planning: legacyPlanning,
        legWinds: forecast.winds,
      }),
    [flightPlan, forecast.winds, legacyPlanning],
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
      resolveWind: createSampledWindResolver(
        forecast.winds,
        parsedInputs.value.wind,
      ),
    });
  }, [flightPlan, forecast.winds, parsedInputs, parsedPerformance]);

  const updateDraft = <Field extends keyof NavigationInputDraft>(
    field: Field,
    value: NavigationInputDraft[Field],
  ) => {
    onDraftChange({ ...draft, [field]: value });
  };

  return (
    <>
      <fieldset className="navigation-inputs">
        <legend>Route planning inputs</legend>
        <p className="navigation-inputs__scope">
          Departure, variation, and manual fallback wind apply to the route.
        </p>

        <label className="navigation-inputs__departure">
          <span>Departure</span>
          <span className="navigation-inputs__control">
            <input
              type="datetime-local"
              step="60"
              value={draft.departureTimeUtc}
              aria-invalid={parsedInputs.status === 'invalid'}
              onChange={(event) =>
                updateDraft('departureTimeUtc', event.currentTarget.value)
              }
            />
            <span>UTC</span>
          </span>
        </label>

        <label>
          <span>Variation</span>
          <span className="navigation-inputs__control navigation-inputs__variation-control">
            <input
              type="number"
              min="0"
              max="180"
              step="0.1"
              value={draft.magneticVariationDeg}
              aria-invalid={parsedInputs.status === 'invalid'}
              onChange={(event) =>
                updateDraft(
                  'magneticVariationDeg',
                  event.currentTarget.value,
                )
              }
            />
            <select
              value={draft.magneticVariationDirection}
              aria-label="Magnetic variation direction"
              aria-invalid={parsedInputs.status === 'invalid'}
              onChange={(event) =>
                updateDraft(
                  'magneticVariationDirection',
                  event.currentTarget.value as 'E' | 'W',
                )
              }
            >
              <option value="E">°E</option>
              <option value="W">°W</option>
            </select>
          </span>
        </label>

        <label>
          <span>Wind from</span>
          <span className="navigation-inputs__control">
            <input
              type="number"
              step="1"
              value={draft.windDirectionFromTrueDeg}
              aria-invalid={parsedInputs.status === 'invalid'}
              onChange={(event) =>
                updateDraft(
                  'windDirectionFromTrueDeg',
                  event.currentTarget.value,
                )
              }
            />
            <span>°T</span>
          </span>
        </label>

        <label>
          <span>Wind speed</span>
          <span className="navigation-inputs__control">
            <input
              type="number"
              min="0"
              step="1"
              value={draft.windSpeedKt}
              aria-invalid={parsedInputs.status === 'invalid'}
              onChange={(event) =>
                updateDraft('windSpeedKt', event.currentTarget.value)
              }
            />
            <span>kt</span>
          </span>
        </label>

        <label className="navigation-inputs__forecast-toggle">
          <input
            type="checkbox"
            checked={useForecastWinds}
            onChange={(event) =>
              onUseForecastWindsChange(event.currentTarget.checked)
            }
          />
          <span>Use ECMWF upper-air winds</span>
        </label>

        {useForecastWinds &&
        forecast.status.status === 'loading' ? (
          <p className="navigation-inputs__weather-status" role="status">
            Loading Open-Meteo forecast…
          </p>
        ) : null}

        {useForecastWinds &&
        forecast.status.status === 'success' ? (
          <div className="navigation-inputs__weather-status" role="status">
            <p>
              {FORECAST_SOURCE_LABEL} winds applied from{' '}
              {forecast.status.winds.length}{' '}
              {forecast.status.winds.length === 1 ? 'sample' : 'samples'}
              {forecast.status.refined ? ' after one timing refinement' : ''}.
            </p>
            <p className="navigation-inputs__weather-detail">
              Valid {formatForecastValidTimeRange(forecast.status.winds)};
              retrieved {formatForecastRetrievalTime(forecast.status.winds)}.
              {forecast.status.winds.some((wind) => wind.altitudeClamped)
                ? ' Nearest usable pressure level used where needed.'
                : ''}{' '}
              <a
                href="https://open-meteo.com/"
                target="_blank"
                rel="noreferrer"
              >
                Source
              </a>
            </p>
          </div>
        ) : null}

        {useForecastWinds &&
        forecast.status.status === 'error' ? (
          <p className="navigation-inputs__error" role="alert">
            Open-Meteo unavailable: {forecast.status.message}. Using manual wind.
          </p>
        ) : null}

        {parsedInputs.status === 'invalid' ? (
          <p className="navigation-inputs__error" role="alert">
            {parsedInputs.message}
          </p>
        ) : null}
      </fieldset>

      <AircraftPerformanceInputs
        draft={performanceDraft}
        {...(parsedPerformance.status === 'invalid'
          ? { errorMessage: parsedPerformance.message }
          : {})}
        onChange={onPerformanceDraftChange}
      />

      <LegAltitudeControls
        flightPlan={flightPlan}
        draft={performanceDraft}
        placementLeg={altitudePlacementLeg}
        onDraftChange={onPerformanceDraftChange}
        onPlacementLegChange={onAltitudePlacementLegChange}
      />

      {performanceRoute?.status === 'no-solution' ? (
        <p className="navigation-inputs__error performance-route-error" role="alert">
          Performance profile unavailable for {performanceRoute.legFromId} →{' '}
          {performanceRoute.legToId}: {performanceRoute.message}.
        </p>
      ) : null}

      <RouteTable
        waypoints={flightPlan.waypoints}
        route={calculatedRoute}
        performanceRoute={performanceRoute}
        forecastWinds={
          forecast.status.status === 'success' ? forecast.status.winds : []
        }
      />
    </>
  );
}
