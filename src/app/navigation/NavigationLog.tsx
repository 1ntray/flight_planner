import { useMemo, useState } from 'react';

import { calculateNavigationRoute } from '../../calculations';
import type { FlightPlan } from '../../domain';
import { RouteTable } from '../route/RouteTable';
import {
  createDefaultNavigationInputDraft,
  parseNavigationInputDraft,
} from './navigationInput';
import type { NavigationInputDraft } from './navigationInput';
import { useOpenMeteoRouteWinds } from './useOpenMeteoRouteWinds';
import {
  FORECAST_SOURCE_LABEL,
  formatForecastRetrievalTime,
  formatForecastValidTimeRange,
} from './weatherFormatting';

export interface NavigationLogProps {
  flightPlan: FlightPlan;
}

export function NavigationLog({ flightPlan }: NavigationLogProps) {
  const [draft, setDraft] = useState<NavigationInputDraft>(
    createDefaultNavigationInputDraft,
  );
  const [useForecastWinds, setUseForecastWinds] = useState(false);
  const parsedInputs = useMemo(
    () => parseNavigationInputDraft(draft),
    [draft],
  );
  const manualWindRoute = useMemo(
    () =>
      calculateNavigationRoute({
        flightPlan,
        planning:
          parsedInputs.status === 'valid' ? parsedInputs.value : null,
      }),
    [flightPlan, parsedInputs],
  );
  const forecast = useOpenMeteoRouteWinds({
    enabled: useForecastWinds,
    flightPlan,
    planning: parsedInputs.status === 'valid' ? parsedInputs.value : null,
    preliminaryRoute: manualWindRoute,
  });
  const calculatedRoute = useMemo(
    () =>
      calculateNavigationRoute({
        flightPlan,
        planning:
          parsedInputs.status === 'valid' ? parsedInputs.value : null,
        legWinds: forecast.legWinds,
      }),
    [flightPlan, forecast.legWinds, parsedInputs],
  );

  const updateDraft = (field: keyof NavigationInputDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  return (
    <>
      <fieldset className="navigation-inputs">
        <legend>Route planning inputs</legend>
        <p className="navigation-inputs__scope">
          TAS and altitude are route-wide. Manual wind is the forecast fallback.
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
          <span>TAS</span>
          <span className="navigation-inputs__control">
            <input
              type="number"
              min="0.1"
              step="1"
              value={draft.trueAirspeedKt}
              aria-invalid={parsedInputs.status === 'invalid'}
              onChange={(event) =>
                updateDraft('trueAirspeedKt', event.currentTarget.value)
              }
            />
            <span>kt</span>
          </span>
        </label>

        <label>
          <span>Planned altitude</span>
          <span className="navigation-inputs__control">
            <input
              type="number"
              min="0"
              step="100"
              value={draft.plannedAltitudeFtMsl}
              aria-invalid={parsedInputs.status === 'invalid'}
              onChange={(event) =>
                updateDraft(
                  'plannedAltitudeFtMsl',
                  event.currentTarget.value,
                )
              }
            />
            <span>ft MSL</span>
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
              setUseForecastWinds(event.currentTarget.checked)
            }
          />
          <span>Use ECMWF upper-air winds at each leg midpoint</span>
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
              {FORECAST_SOURCE_LABEL} winds applied to{' '}
              {forecast.status.winds.length}{' '}
              {forecast.status.winds.length === 1 ? 'leg' : 'legs'}
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

      <RouteTable
        waypoints={flightPlan.waypoints}
        route={calculatedRoute}
        forecastWinds={
          forecast.status.status === 'success' ? forecast.status.winds : []
        }
      />
    </>
  );
}
