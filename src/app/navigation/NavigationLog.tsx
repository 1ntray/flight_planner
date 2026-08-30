import type { AircraftDefinition, FlightPlan } from '../../domain';
import { SectorRouteTables } from '../route/SectorRouteTables';
import { CollapsibleSection } from '../layout/CollapsibleSection';
import type { NavigationInputDraft } from './navigationInput';
import { AircraftPerformanceInputs } from './AircraftPerformanceInputs';
import { AircraftSelector } from './AircraftSelector';
import { LegAltitudeControls } from './LegAltitudeControls';
import { SectorStopControls } from './SectorStopControls';
import type { AltitudePlacementLeg } from './altitudePlanState';
import type {
  PerformanceInputDefaults,
  PerformanceInputDraft,
} from './performanceInput';
import type { OperationalInputDraft } from './operationalInput';
import { OperationalPlanningInputs } from './OperationalPlanningInputs';
import type { PlanningCalculations } from './usePlanningCalculations';
import { formatPerformanceRouteFailureLeg } from './performanceRouteFormatting';
import {
  FORECAST_SOURCE_LABEL,
  formatForecastRetrievalTime,
  formatForecastValidTimeRange,
} from './weatherFormatting';

function withoutTrailingPunctuation(value: string): string {
  return value.replace(/[.!?]+$/, '');
}

export interface NavigationLogProps {
  section?: 'all' | 'controls' | 'tables';
  flightPlan: FlightPlan;
  aircraftDefinition: AircraftDefinition;
  draft: NavigationInputDraft;
  performanceDraft: PerformanceInputDraft;
  performanceInputDefaults: PerformanceInputDefaults;
  operationalDraft: OperationalInputDraft;
  useForecastWinds: boolean;
  onDraftChange: (draft: NavigationInputDraft) => void;
  onAircraftDefinitionChange: (aircraft: AircraftDefinition) => void;
  onPerformanceDraftChange: (draft: PerformanceInputDraft) => void;
  onOperationalDraftChange: (draft: OperationalInputDraft) => void;
  onUseForecastWindsChange: (enabled: boolean) => void;
  onLoadForecastWinds: () => void;
  onChooseAlternateOnMap: () => void;
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
  performanceInputDefaults,
  operationalDraft,
  useForecastWinds,
  onDraftChange,
  onAircraftDefinitionChange,
  onPerformanceDraftChange,
  onOperationalDraftChange,
  onUseForecastWindsChange,
  onLoadForecastWinds,
  onChooseAlternateOnMap,
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
    alternateCalculatedRoute,
    alternateTrueAirspeedKt,
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
      <CollapsibleSection
        title="Route and weather"
        summary={useForecastWinds ? 'Forecast wind' : 'Manual wind'}
        hasIssue={parsedInputs.status === 'invalid' || forecast.status.status === 'error'}
        defaultOpen
      >
      <fieldset className="navigation-inputs">
        <legend>Route planning inputs</legend>
        <p className="navigation-inputs__scope">
          Departure and manual fallback wind apply to the route. Magnetic variation is calculated per leg.
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
          <span>Variation mode</span>
          <select
            value={draft.magneticVariationMode}
            onChange={(event) =>
              updateDraft(
                'magneticVariationMode',
                event.currentTarget.value as 'automatic-wmm2025' | 'manual',
              )
            }
          >
            <option value="automatic-wmm2025">Automatic (WMM2025)</option>
            <option value="manual">Manual</option>
          </select>
        </label>

        {draft.magneticVariationMode === 'manual' ? (
        <label>
          <span>Manual variation</span>
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
        ) : (
          <p className="navigation-inputs__scope">
            WMM2025 samples each leg’s direct midpoint, midpoint UTC time, and representative altitude.
          </p>
        )}

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

        <div className="navigation-inputs__forecast-actions">
          <button
            type="button"
            className="button"
            disabled={
              !forecast.canLoad || forecast.status.status === 'loading'
            }
            onClick={onLoadForecastWinds}
          >
            {forecast.status.status === 'loading'
              ? 'Loading forecast…'
              : forecast.status.status === 'success'
                ? 'Refresh forecast winds'
                : forecast.status.status === 'stale'
                  ? 'Reload forecast winds'
                  : forecast.status.status === 'error'
                    ? 'Retry forecast winds'
                    : 'Load forecast winds'}
          </button>
          {useForecastWinds ? (
            <button
              type="button"
              className="button"
              onClick={() => onUseForecastWindsChange(false)}
            >
              Use manual wind
            </button>
          ) : null}
        </div>

        {!forecast.canLoad ? (
          <p className="navigation-inputs__weather-status">
            Complete the route and valid planning inputs before loading
            forecast winds.
          </p>
        ) : null}

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
            Open-Meteo unavailable:{' '}
            {withoutTrailingPunctuation(forecast.status.message)}. Using manual
            wind.
          </p>
        ) : null}

        {useForecastWinds && forecast.status.status === 'stale' ? (
          <p className="navigation-inputs__weather-status" role="status">
            The route or planning inputs changed. Forecast winds are not
            applied; load them again when the plan is ready.
          </p>
        ) : null}

        {useForecastWinds && forecast.status.status === 'idle' &&
        forecast.canLoad ? (
          <p className="navigation-inputs__weather-status">
            Forecast winds are not loaded for this session. Manual wind is
            used until you load them.
          </p>
        ) : null}

        {parsedInputs.status === 'invalid' ? (
          <p className="navigation-inputs__error" role="alert">
            {parsedInputs.message}
          </p>
        ) : null}
      </fieldset>
      </CollapsibleSection>

      <CollapsibleSection
        title="Aircraft"
        summary={aircraftDefinition.displayName}
      >
      <AircraftSelector
        aircraftDefinition={aircraftDefinition}
        onChange={onAircraftDefinitionChange}
      />
      </CollapsibleSection>

      <CollapsibleSection
        title="Fuel and mass & balance"
        summary={`${operationalDraft.fuelOnboardLitres || '—'} L onboard`}
        hasIssue={parsedOperational.status === 'invalid' || operationalPlan?.status === 'no-solution'}
      >
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
        onChooseAlternateOnMap={onChooseAlternateOnMap}
      />
      </CollapsibleSection>

      <CollapsibleSection
        title="Performance"
        summary={`${performanceDraft.defaultAltitudeFtMsl || '—'} ft default`}
        hasIssue={parsedPerformance.status === 'invalid'}
      >
      <AircraftPerformanceInputs
        draft={performanceDraft}
        defaults={performanceInputDefaults}
        profile={aircraftDefinition.performance}
        {...(derivedTakeoffMassKg === null
          ? {}
          : { derivedMassKg: derivedTakeoffMassKg })}
        {...(parsedPerformance.status === 'invalid'
          ? { errorMessage: parsedPerformance.message }
          : {})}
        onChange={onPerformanceDraftChange}
      />
      </CollapsibleSection>

      <CollapsibleSection
        title="Intermediate airports"
        summary={(flightPlan.sectorBoundaryWaypointIds?.length ?? 0) === 0 ? 'None' : `${flightPlan.sectorBoundaryWaypointIds!.length} landing(s)`}
        hasIssue={parsedPerformance.status === 'invalid' && (flightPlan.sectorBoundaryWaypointIds?.length ?? 0) > 0}
      >
      <SectorStopControls
        flightPlan={flightPlan}
        draft={performanceDraft}
        operationalDraft={operationalDraft}
        defaults={performanceInputDefaults}
        onDraftChange={onPerformanceDraftChange}
        onOperationalDraftChange={onOperationalDraftChange}
      />
      </CollapsibleSection>

      <CollapsibleSection
        title="Altitude schedule"
        summary={`${flightPlan.waypoints.length > 1 ? flightPlan.waypoints.length - 1 : 0} leg(s)`}
        hasIssue={performanceRoute?.status === 'no-solution'}
      >
      <LegAltitudeControls
        flightPlan={flightPlan}
        draft={performanceDraft}
        placementLeg={altitudePlacementLeg}
        onDraftChange={onPerformanceDraftChange}
        onPlacementLegChange={onAltitudePlacementLegChange}
      />
      </CollapsibleSection>

        </>
      ) : null}

      {showTables ? (
        <>
      {performanceRoute?.status === 'no-solution' ? (
        <p className="navigation-inputs__error performance-route-error" role="alert">
          Performance profile unavailable for{' '}
          {formatPerformanceRouteFailureLeg(flightPlan, performanceRoute)}:{' '}
          {performanceRoute.message}.
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
        alternateNavigationRoute={alternateCalculatedRoute}
        alternateTrueAirspeedKt={alternateTrueAirspeedKt}
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
