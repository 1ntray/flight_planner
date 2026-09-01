import type { AircraftDefinition, FlightPlan } from '../../domain';
import { SectorRouteTables } from '../route/SectorRouteTables';
import { CollapsibleSection } from '../layout/CollapsibleSection';
import type { NavigationInputDraft } from './navigationInput';
import { AircraftSelector } from './AircraftSelector';
import { AirportInputs } from './AirportInputs';
import { LegAltitudeControls } from './LegAltitudeControls';
import type { AltitudePlacementLeg } from './altitudePlanState';
import type {
  PerformanceInputDefaults,
  PerformanceInputDraft,
} from './performanceInput';
import type { OperationalInputDraft } from './operationalInput';
import { OperationalPlanningInputs } from './OperationalPlanningInputs';
import type { PlanningCalculations } from './usePlanningCalculations';
import type { CommunicationChange } from '../../calculations';
import { formatPerformanceRouteFailureLeg } from './performanceRouteFormatting';
import {
  FORECAST_SOURCE_LABEL,
  formatForecastRetrievalTime,
  formatForecastValidTimeRange,
} from './weatherFormatting';

function withoutTrailingPunctuation(value: string): string {
  return value.replace(/[.!?]+$/, '');
}

function routeAirportSummary(flightPlan: FlightPlan): string {
  const boundaryIds = new Set(flightPlan.sectorBoundaryWaypointIds ?? []);
  const departure = flightPlan.waypoints[0];
  const destination = flightPlan.waypoints.at(-1);
  if (departure === undefined || destination === undefined) {
    return 'No route airports';
  }

  const intermediate = flightPlan.waypoints.filter(
    (waypoint) => boundaryIds.has(waypoint.id),
  );
  return [departure, ...intermediate, destination]
    .filter((waypoint, index, all) =>
      index === 0 || waypoint.id !== all[index - 1]?.id,
    )
    .map((waypoint) => waypoint.name)
    .join(' → ');
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
  onChooseAlternateByIcao: (icaoIdentifier: string) => Promise<string | null>;
  altitudePlacementLeg: AltitudePlacementLeg | null;
  onAltitudePlacementLegChange: (leg: AltitudePlacementLeg | null) => void;
  calculations: PlanningCalculations;
  communicationChangesByLeg?: ReadonlyMap<string, readonly CommunicationChange[]>;
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
  onChooseAlternateByIcao,
  altitudePlacementLeg,
  onAltitudePlacementLegChange,
  calculations,
  communicationChangesByLeg = new Map(),
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
    calculationRecovery,
    calculationsSuspended,
    resumeCalculations,
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
      {showControls && calculationsSuspended && calculationRecovery !== null ? (
        <section className="calculation-recovery" role="alert">
          <strong>Calculations paused after an unfinished stage</strong>
          <p>
            The previous page stopped while running{' '}
            <strong>{calculationRecovery.stage}</strong>. Route editing remains
            available, but performance, operational, forecast, and magnetic
            calculations are paused so the planner can reopen safely.
          </p>
          <p className="calculation-recovery__details">
            Recorded {new Date(calculationRecovery.startedAtUtcMs).toLocaleString()}
            {' · '}{calculationRecovery.context.waypointCount ?? 0} waypoint(s)
            {' · '}{calculationRecovery.context.altitudePlanCount ?? 0} leg altitude plan(s)
            {' · '}maximum recorded altitude{' '}
            {calculationRecovery.context.maximumPlannedAltitudeFt ?? 0} ft
          </p>
          <p>Edit the plan first if needed, then retry the calculations.</p>
          <button
            type="button"
            className="button"
            onClick={resumeCalculations}
          >
            Retry calculations
          </button>
        </section>
      ) : null}
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
        summary={aircraftDefinition.registration === undefined
          ? aircraftDefinition.displayName
          : `${aircraftDefinition.displayName} · ${aircraftDefinition.registration}`}
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
        onChooseAlternateByIcao={onChooseAlternateByIcao}
      />
      </CollapsibleSection>

      <CollapsibleSection
        title="Airports"
        summary={routeAirportSummary(flightPlan)}
        hasIssue={parsedPerformance.status === 'invalid'}
      >
      <AirportInputs
        flightPlan={flightPlan}
        aircraft={aircraftDefinition}
        draft={performanceDraft}
        operationalDraft={operationalDraft}
        defaults={performanceInputDefaults}
        onDraftChange={onPerformanceDraftChange}
        onOperationalDraftChange={onOperationalDraftChange}
      />
      </CollapsibleSection>

      <CollapsibleSection
        title="Altitude schedule"
        summary={`${performanceDraft.defaultAltitudeFtMsl || '—'} ft default · ${flightPlan.waypoints.length > 1 ? flightPlan.waypoints.length - 1 : 0} leg(s)`}
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
        legAltitudePlans={performanceDraft.legAltitudePlans}
        communicationChangesByLeg={communicationChangesByLeg}
      />
        </>
      ) : null}
    </>
  );
}
