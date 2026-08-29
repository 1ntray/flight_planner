import type { AircraftDefinition, FlightPlan } from '../../domain';
import { SectorRouteTables } from '../route/SectorRouteTables';
import type { NavigationInputDraft } from './navigationInput';
import { AircraftPerformanceInputs } from './AircraftPerformanceInputs';
import { AircraftSelector } from './AircraftSelector';
import { LegAltitudeControls } from './LegAltitudeControls';
import { SectorStopControls } from './SectorStopControls';
import type { AltitudePlacementLeg } from './altitudePlanState';
import type { PerformanceInputDraft } from './performanceInput';
import type { OperationalInputDraft } from './operationalInput';
import { OperationalPlanningInputs } from './OperationalPlanningInputs';
import type { PlanningCalculations } from './usePlanningCalculations';
import {
  FORECAST_SOURCE_LABEL,
  formatForecastRetrievalTime,
  formatForecastValidTimeRange,
} from './weatherFormatting';

export interface NavigationLogProps {
  section?: 'all' | 'controls' | 'tables';
  flightPlan: FlightPlan;
  aircraftDefinition: AircraftDefinition;
  draft: NavigationInputDraft;
  performanceDraft: PerformanceInputDraft;
  operationalDraft: OperationalInputDraft;
  useForecastWinds: boolean;
  onDraftChange: (draft: NavigationInputDraft) => void;
  onAircraftDefinitionChange: (aircraft: AircraftDefinition) => void;
  onPerformanceDraftChange: (draft: PerformanceInputDraft) => void;
  onOperationalDraftChange: (draft: OperationalInputDraft) => void;
  onUseForecastWindsChange: (enabled: boolean) => void;
  altitudePlacementLeg: AltitudePlacementLeg | null;
  onAltitudePlacementLegChange: (leg: AltitudePlacementLeg | null) => void;
  calculations: PlanningCalculations;
}

export function NavigationLog({
  section = 'all',
  flightPlan,
  aircraftDefinition,
  draft,
  performanceDraft,
  operationalDraft,
  useForecastWinds,
  onDraftChange,
  onAircraftDefinitionChange,
  onPerformanceDraftChange,
  onOperationalDraftChange,
  onUseForecastWindsChange,
  altitudePlacementLeg,
  onAltitudePlacementLegChange,
  calculations,
}: NavigationLogProps) {
  const {
    parsedInputs,
    parsedPerformance,
    parsedOperational,
    derivedTakeoffMassKg,
    calculatedRoute,
    performanceRoute,
    operationalPlan,
    forecast,
  } = calculations;

  const updateDraft = <Field extends keyof NavigationInputDraft>(
    field: Field,
    value: NavigationInputDraft[Field],
  ) => {
    onDraftChange({ ...draft, [field]: value });
  };
  const showControls = section !== 'tables';
  const showTables = section !== 'controls';
  return (
    <>
      {showControls ? (
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

      <AircraftSelector
        aircraftDefinition={aircraftDefinition}
        onChange={onAircraftDefinitionChange}
      />

      <OperationalPlanningInputs
        aircraft={aircraftDefinition}
        draft={operationalDraft}
        {...(parsedOperational.status === 'invalid'
          ? { errorMessage: parsedOperational.message }
          : {})}
        {...(derivedTakeoffMassKg === null
          ? {}
          : {
              calculatedTakeoffMassKg: derivedTakeoffMassKg,
            })}
        onChange={onOperationalDraftChange}
      />

      <AircraftPerformanceInputs
        draft={performanceDraft}
        profile={aircraftDefinition.performance}
        {...(derivedTakeoffMassKg === null
          ? {}
          : { derivedMassKg: derivedTakeoffMassKg })}
        {...(parsedPerformance.status === 'invalid'
          ? { errorMessage: parsedPerformance.message }
          : {})}
        onChange={onPerformanceDraftChange}
      />

      <SectorStopControls
        flightPlan={flightPlan}
        draft={performanceDraft}
        operationalDraft={operationalDraft}
        onDraftChange={onPerformanceDraftChange}
        onOperationalDraftChange={onOperationalDraftChange}
      />

      <LegAltitudeControls
        flightPlan={flightPlan}
        draft={performanceDraft}
        placementLeg={altitudePlacementLeg}
        onDraftChange={onPerformanceDraftChange}
        onPlacementLegChange={onAltitudePlacementLegChange}
      />

        </>
      ) : null}

      {showTables ? (
        <>
      {performanceRoute?.status === 'no-solution' ? (
        <p className="navigation-inputs__error performance-route-error" role="alert">
          Performance profile unavailable for {performanceRoute.legFromId} →{' '}
          {performanceRoute.legToId}: {performanceRoute.message}.
        </p>
      ) : null}

      {operationalPlan?.status === 'no-solution' ? (
        <p className="navigation-inputs__error performance-route-error" role="alert">
          Operational plan unavailable: {operationalPlan.message}.
        </p>
      ) : null}

      <SectorRouteTables
        flightPlan={flightPlan}
        route={calculatedRoute}
        performanceRoute={performanceRoute}
        operationalPlan={operationalPlan}
        aircraftDefinition={aircraftDefinition}
        operationalInputs={
          parsedOperational.status === 'valid'
            ? parsedOperational.value
            : null
        }
        forecastWinds={
          forecast.status.status === 'success' ? forecast.status.winds : []
        }
      />
        </>
      ) : null}
    </>
  );
}
