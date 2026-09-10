import { useEffect, useMemo, useRef, useState } from 'react';

import {
  calculateAerodromePatternAltitudeFtMsl,
  DEFAULT_PATTERN_HEIGHT_AGL_FT,
} from '../../calculations';
import type { AircraftDefinition, FlightPlan } from '../../domain';
import {
  MANUAL_AIRPORT_WEATHER_SELECTION,
  fetchAirportOperationalWeather,
  resolveEffectiveAirportPlanningEnvironment,
  resolveTafWind,
} from '../../weather';
import type {
  AirportOperationalWeather,
  AirportWeatherSelection,
  AirportWind,
} from '../../weather';
import {
  createEmptyAerodromePatternInputDraft,
  createEmptySectorOperationInputDraft,
} from './operationalInput';
import type {
  AerodromePatternInputDraft,
  OperationalInputDraft,
  SectorOperationInputDraft,
} from './operationalInput';
import {
  createEmptySectorStopInputDraft,
  DEFAULT_PLANNING_ISA_DEVIATION_C,
  DEFAULT_PLANNING_QNH_HPA,
} from './performanceInput';
import type {
  PerformanceInputDefaults,
  PerformanceInputDraft,
  SectorStopInputDraft,
} from './performanceInput';

type AirportTab =
  | { readonly key: 'departure'; readonly waypointId: string; readonly name: string }
  | { readonly key: 'destination'; readonly waypointId: string; readonly name: string }
  | { readonly key: `stop:${string}`; readonly waypointId: string; readonly name: string };

export interface AirportInputsProps {
  flightPlan: FlightPlan;
  aircraft: AircraftDefinition;
  draft: PerformanceInputDraft;
  operationalDraft: OperationalInputDraft;
  defaults: PerformanceInputDefaults;
  plannedTimeUtcMsByWaypointId?: ReadonlyMap<string, number>;
  onEffectivePlanningEnvironmentChange?: (
    waypointId: string,
    override: { readonly qnhHpa?: number; readonly isaDeviationC?: number } | null,
  ) => void;
  onDraftChange: (draft: PerformanceInputDraft) => void;
  onOperationalDraftChange: (draft: OperationalInputDraft) => void;
}

function formatWind(wind: AirportWind | undefined): string {
  if (wind === undefined) return 'Unavailable';
  if (wind.kind === 'calm') return 'Calm';
  const direction = wind.kind === 'variable' ? 'VRB' : `${Math.round(wind.directionFromTrueDeg).toString().padStart(3, '0')}°`;
  return `${direction} / ${Math.round(wind.speedKt)} kt${wind.gustKt === undefined ? '' : ` G${Math.round(wind.gustKt)}`}`;
}
function formatUtc(value: number | undefined): string { return value === undefined ? 'time unavailable' : new Date(value).toISOString().slice(11, 16) + 'Z'; }
function formatTafValidity(value: { readonly validFromUtcMs?: number; readonly validToUtcMs?: number }): string {
  return value.validFromUtcMs === undefined || value.validToUtcMs === undefined
    ? 'validity unavailable'
    : `valid ${new Date(value.validFromUtcMs).toISOString().slice(5, 16)}Z–${new Date(value.validToUtcMs).toISOString().slice(5, 16)}Z`;
}

/** Keep TAC verbatim in content while grouping its logical change sections. */
function formatTac(rawTac: string): string {
  const tokens = rawTac.trim().replace(/=$/, '').split(/\s+/);
  return tokens.reduce<string>((formatted, token, index) => {
    const startsNewGroup = index > 0 && (
      index === 7 || token === 'TEMPO' || token === 'BECMG' ||
      token === 'RMK' || /^FM\d{6}$/.test(token) || /^PROB(?:30|40)$/.test(token)
    );
    return `${formatted}${index === 0 ? '' : startsNewGroup ? '\n' : ' '}${token}`;
  }, '') + (rawTac.trim().endsWith('=') ? '=' : '');
}

// Locationforecast is hourly and a weather-driven TAS adjustment can move a
// calculated ETA by seconds. Treat only a material schedule/context change as
// stale so the selected source cannot create its own invalidation loop.
const WEATHER_CONTEXT_STALE_TOLERANCE_MS = 5 * 60 * 1000;

function NumberField({
  label,
  value,
  placeholder,
  unit,
  min,
  step = '1',
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string | undefined;
  unit: string;
  min?: string;
  step?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <span className="navigation-inputs__control">
        <input
          type="number"
          value={value}
          {...(placeholder === undefined ? {} : { placeholder })}
          {...(min === undefined ? {} : { min })}
          step={step}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
        <span>{unit}</span>
      </span>
    </label>
  );
}

function patternAltitude(
  elevationDraft: string,
  defaultElevationFtMsl: number | undefined,
  identifier: string | undefined,
): string {
  const elevationFtMsl = elevationDraft.trim() === ''
    ? defaultElevationFtMsl
    : Number(elevationDraft);
  if (elevationFtMsl === undefined || !Number.isFinite(elevationFtMsl)) {
    return 'Aerodrome elevation required';
  }
  return `${calculateAerodromePatternAltitudeFtMsl(
    elevationFtMsl,
    DEFAULT_PATTERN_HEIGHT_AGL_FT,
    identifier,
  )} ft MSL`;
}

export function AirportInputs({
  flightPlan,
  aircraft,
  draft,
  operationalDraft,
  defaults,
  plannedTimeUtcMsByWaypointId = new Map(),
  onEffectivePlanningEnvironmentChange,
  onDraftChange,
  onOperationalDraftChange,
}: AirportInputsProps) {
  const tabs = useMemo<readonly AirportTab[]>(() => {
    const departure = flightPlan.waypoints[0];
    const destination = flightPlan.waypoints.at(-1);
    if (departure === undefined || destination === undefined) return [];
    const boundaryIds = new Set(flightPlan.sectorBoundaryWaypointIds ?? []);
    const stops = flightPlan.waypoints.slice(1, -1).flatMap((waypoint) =>
      boundaryIds.has(waypoint.id)
        ? [{ key: `stop:${waypoint.id}` as const, waypointId: waypoint.id, name: waypoint.name }]
        : [],
    );
    return [
      { key: 'departure', waypointId: departure.id, name: departure.name },
      ...stops,
      { key: 'destination', waypointId: destination.id, name: destination.name },
    ];
  }, [flightPlan.sectorBoundaryWaypointIds, flightPlan.waypoints]);
  const [activeKey, setActiveKey] = useState<AirportTab['key']>('departure');
  const [weatherByWaypointId, setWeatherByWaypointId] = useState<ReadonlyMap<string, AirportOperationalWeather>>(new Map());
  const [weatherSelections, setWeatherSelections] = useState<ReadonlyMap<string, AirportWeatherSelection>>(new Map());
  const weatherAbort = useRef<AbortController | null>(null);
  const [weatherLoadInProgress, setWeatherLoadInProgress] = useState(false);
  useEffect(() => () => weatherAbort.current?.abort(), []);
  const active = tabs.find((tab) => tab.key === activeKey) ?? tabs[0];

  useEffect(() => {
    if (active !== undefined && !tabs.some((tab) => tab.key === activeKey)) {
      setActiveKey(active.key);
    }
  }, [active, activeKey, tabs]);

  if (active === undefined) return null;

  const airportWeatherRequest = (tab: AirportTab) => {
    const candidate = flightPlan.waypoints.find((item) => item.id === tab.waypointId);
    const airportIdentifier = candidate?.anchor?.publishedIdentifier;
    const elevationFtMsl = tab.key === 'departure'
      ? defaults.departureElevationFtMsl
      : tab.key === 'destination'
        ? defaults.destinationElevationFtMsl
        : defaults.sectorStopElevationFtMslByWaypointId?.[tab.waypointId];
    const plannedTimeUtcMs = plannedTimeUtcMsByWaypointId.get(tab.waypointId);
    if (candidate?.anchor?.feature.featureKind !== 'aerodrome' || airportIdentifier === undefined || elevationFtMsl === undefined || plannedTimeUtcMs === undefined) return null;
    return {
      airportKey: tab.waypointId,
      icaoIdentifier: airportIdentifier,
      position: candidate.position,
      elevationFtMsl,
      plannedTimeUtcMs,
      context: tab.key === 'departure' ? 'departure' as const : tab.key === 'destination' ? 'destination' as const : 'arrival' as const,
    };
  };
  const loadableAirportCount = tabs.filter((tab) => airportWeatherRequest(tab) !== null).length;
  const loadRouteWeather = async (refresh = false) => {
    weatherAbort.current?.abort();
    const controller = new AbortController();
    weatherAbort.current = controller;
    setWeatherLoadInProgress(true);
    try {
      // Deliberately sequential: a route may contain many stops and MET Norway
      // asks clients to avoid bursts of concurrent requests.
      for (const tab of tabs) {
        const request = airportWeatherRequest(tab);
        if (request === null) continue;
        setWeatherByWaypointId((current) => new Map(current).set(tab.waypointId, {
          request, metar: { status: 'loading' }, taf: { status: 'loading' }, forecast: { status: 'loading' },
        }));
        try {
          const value = await fetchAirportOperationalWeather(request, controller.signal, refresh);
          if (!controller.signal.aborted) setWeatherByWaypointId((current) => new Map(current).set(tab.waypointId, value));
        } catch (error) {
          if (!controller.signal.aborted) setWeatherByWaypointId((current) => new Map(current).set(tab.waypointId, {
            request,
            metar: { status: 'error', message: error instanceof Error ? error.message : 'Weather request failed' },
            taf: { status: 'error', message: error instanceof Error ? error.message : 'Weather request failed' },
            forecast: { status: 'error', message: error instanceof Error ? error.message : 'Weather request failed' },
          }));
        }
      }
    } finally {
      if (weatherAbort.current === controller) setWeatherLoadInProgress(false);
    }
  };

  const waypoint = flightPlan.waypoints.find(
    (candidate) => candidate.id === active.waypointId,
  );
  const identifier = waypoint?.anchor?.publishedIdentifier;
  const isStop = active.key.startsWith('stop:');
  const stop = isStop
    ? draft.sectorStopPlans.find((candidate) => candidate.waypointId === active.waypointId) ??
      createEmptySectorStopInputDraft(active.waypointId)
    : null;
  const operation = isStop
    ? operationalDraft.sectorOperations.find(
        (candidate) => candidate.waypointId === active.waypointId,
      ) ?? createEmptySectorOperationInputDraft(active.waypointId)
    : null;
  const pattern = active.key === 'departure'
    ? null
    : operationalDraft.patternPlans.find(
        (candidate) => candidate.waypointId === active.waypointId,
      ) ?? createEmptyAerodromePatternInputDraft(active.waypointId);
  const hasAerodromeArrival =
    pattern !== null &&
    waypoint?.anchor?.feature.featureKind === 'aerodrome';
  const arrivalBufferEnabled = pattern?.arrivalBufferEnabled ?? true;
  const defaultElevation = active.key === 'departure'
    ? defaults.departureElevationFtMsl
    : active.key === 'destination'
      ? defaults.destinationElevationFtMsl
      : defaults.sectorStopElevationFtMslByWaypointId?.[active.waypointId];
  const elevationValue = active.key === 'departure'
    ? draft.departureElevationFtMsl
    : active.key === 'destination'
      ? draft.destinationElevationFtMsl
      : stop!.elevationFtMsl;
  const qnhValue = active.key === 'departure'
    ? draft.departureQnhHpa
    : active.key === 'destination'
      ? draft.destinationQnhHpa
      : stop!.qnhHpa;
  const isaValue = active.key === 'departure'
    ? draft.departureIsaDeviationC
    : active.key === 'destination'
      ? draft.destinationIsaDeviationC
      : stop!.isaDeviationC;
  const selection = weatherSelections.get(active.waypointId) ?? MANUAL_AIRPORT_WEATHER_SELECTION;
  const weather = weatherByWaypointId.get(active.waypointId);
  const plannedTimeUtcMs = plannedTimeUtcMsByWaypointId.get(active.waypointId);
  const weatherIsStale = weather !== undefined && plannedTimeUtcMs !== undefined &&
    Math.abs(weather.request.plannedTimeUtcMs - plannedTimeUtcMs) > WEATHER_CONTEXT_STALE_TOLERANCE_MS;
  const canLoadWeather = waypoint?.anchor?.feature.featureKind === 'aerodrome' &&
    identifier !== undefined && defaultElevation !== undefined && plannedTimeUtcMs !== undefined;
  const manualQnh = qnhValue.trim() === '' ? DEFAULT_PLANNING_QNH_HPA : Number(qnhValue);
  const manualIsa = isaValue.trim() === '' ? DEFAULT_PLANNING_ISA_DEVIATION_C : Number(isaValue);
  const effectiveWeather = weather === undefined || weatherIsStale || !Number.isFinite(manualQnh) || !Number.isFinite(manualIsa)
    ? undefined
    : resolveEffectiveAirportPlanningEnvironment({ qnhHpa: manualQnh, isaDeviationC: manualIsa }, weather, selection);
  const selectedPressurePlaceholder = selection.pressure === 'metar' && effectiveWeather !== undefined
    ? `${effectiveWeather.qnhHpa.toFixed(0)} (METAR QNH)`
    : selection.pressure === 'forecast' && effectiveWeather !== undefined
      ? `${effectiveWeather.qnhHpa.toFixed(0)} (MET Norway forecast)`
      : `${DEFAULT_PLANNING_QNH_HPA} (standard)`;
  const selectedIsaPlaceholder = selection.temperature === 'metar' && effectiveWeather !== undefined
    ? `${effectiveWeather.isaDeviationC.toFixed(1)} (METAR temperature)`
    : selection.temperature === 'forecast' && effectiveWeather !== undefined
      ? `${effectiveWeather.isaDeviationC.toFixed(1)} (MET Norway forecast)`
      : `${DEFAULT_PLANNING_ISA_DEVIATION_C} (standard)`;
  useEffect(() => {
    if (effectiveWeather === undefined) {
      onEffectivePlanningEnvironmentChange?.(active.waypointId, null);
      return;
    }
    const override = {
      ...(selection.pressure === 'manual' || effectiveWeather.unavailable.some((message) => message.includes('pressure')) ? {} : { qnhHpa: effectiveWeather.qnhHpa }),
      ...(selection.temperature === 'manual' || effectiveWeather.unavailable.some((message) => message.includes('temperature')) ? {} : { isaDeviationC: effectiveWeather.isaDeviationC }),
    };
    onEffectivePlanningEnvironmentChange?.(active.waypointId, Object.keys(override).length === 0 ? null : override);
  }, [active.waypointId, effectiveWeather, onEffectivePlanningEnvironmentChange, selection.pressure, selection.temperature]);

  const setSelection = (field: keyof AirportWeatherSelection, value: AirportWeatherSelection[typeof field]) => setWeatherSelections((current) => new Map(current).set(active.waypointId, { ...selection, [field]: value }));

  const updateAirport = (
    field: 'elevation' | 'qnh' | 'isa',
    value: string,
  ) => {
    if (active.key === 'departure') {
      onDraftChange({
        ...draft,
        ...(field === 'elevation' ? { departureElevationFtMsl: value } : {}),
        ...(field === 'qnh' ? { departureQnhHpa: value } : {}),
        ...(field === 'isa' ? { departureIsaDeviationC: value } : {}),
      });
      return;
    }
    if (active.key === 'destination') {
      onDraftChange({
        ...draft,
        ...(field === 'elevation' ? { destinationElevationFtMsl: value } : {}),
        ...(field === 'qnh' ? { destinationQnhHpa: value } : {}),
        ...(field === 'isa' ? { destinationIsaDeviationC: value } : {}),
      });
      return;
    }

    const updated: SectorStopInputDraft = {
      ...stop!,
      ...(field === 'elevation' ? { elevationFtMsl: value } : {}),
      ...(field === 'qnh' ? { qnhHpa: value } : {}),
      ...(field === 'isa' ? { isaDeviationC: value } : {}),
    };
    onDraftChange({
      ...draft,
      sectorStopPlans: draft.sectorStopPlans.some(
        (candidate) => candidate.waypointId === active.waypointId,
      )
        ? draft.sectorStopPlans.map((candidate) =>
            candidate.waypointId === active.waypointId ? updated : candidate,
          )
        : [...draft.sectorStopPlans, updated],
    });
  };

  const updateStopOperation = (
    field: Exclude<keyof SectorOperationInputDraft, 'waypointId'>,
    value: string,
  ) => {
    const updated: SectorOperationInputDraft = { ...operation!, [field]: value };
    onOperationalDraftChange({
      ...operationalDraft,
      sectorOperations: operationalDraft.sectorOperations.some(
        (candidate) => candidate.waypointId === active.waypointId,
      )
        ? operationalDraft.sectorOperations.map((candidate) =>
            candidate.waypointId === active.waypointId ? updated : candidate,
          )
        : [...operationalDraft.sectorOperations, updated],
    });
  };

  const updatePattern = (value: string) => {
    const updated: AerodromePatternInputDraft = {
      ...pattern!,
      patternCount: value,
    };
    onOperationalDraftChange({
      ...operationalDraft,
      patternPlans: operationalDraft.patternPlans.some(
        (candidate) => candidate.waypointId === active.waypointId,
      )
        ? operationalDraft.patternPlans.map((candidate) =>
            candidate.waypointId === active.waypointId ? updated : candidate,
          )
        : [...operationalDraft.patternPlans, updated],
    });
  };

  const updateArrivalBuffer = (enabled: boolean) => {
    const updated: AerodromePatternInputDraft = {
      ...pattern!,
      arrivalBufferEnabled: enabled,
    };
    onOperationalDraftChange({
      ...operationalDraft,
      patternPlans: operationalDraft.patternPlans.some(
        (candidate) => candidate.waypointId === active.waypointId,
      )
        ? operationalDraft.patternPlans.map((candidate) =>
            candidate.waypointId === active.waypointId ? updated : candidate,
          )
        : [...operationalDraft.patternPlans, updated],
    });
  };

  return (
    <section className="airport-inputs" aria-label="Airport planning inputs">
      <div className="airport-inputs__tabs" role="tablist" aria-label="Route airports">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={tab.key === active.key}
            className={`button${tab.key === active.key ? ' button--active' : ''}`}
            onClick={() => setActiveKey(tab.key)}
          >
            {tab.key === 'departure' ? 'DEP' : tab.key === 'destination' ? 'DEST' : 'STOP'} {tab.name}
          </button>
        ))}
      </div>
      <p className="airport-inputs__weather-action">
        <button
          type="button"
          className="button"
          disabled={weatherLoadInProgress || loadableAirportCount === 0}
          onClick={() => { void loadRouteWeather(weatherByWaypointId.size > 0); }}
        >
          {weatherLoadInProgress
            ? 'Loading route weather…'
            : weatherByWaypointId.size > 0
              ? 'Refresh route weather'
              : `Load weather for ${loadableAirportCount} airport${loadableAirportCount === 1 ? '' : 's'}`}
        </button>
      </p>
      <fieldset className="navigation-inputs airport-inputs__fields">
        <legend>{active.name}</legend>
        <p className="navigation-inputs__scope">
          Pattern altitude: {patternAltitude(elevationValue, defaultElevation, identifier)}. Standard is 1000 ft AGL; ENDU uses 1500 ft MSL.
        </p>
        <NumberField
          label="Elevation"
          value={elevationValue}
          placeholder={defaultElevation === undefined ? undefined : `${defaultElevation} (aerodrome)`}
          unit="ft MSL"
          min="0"
          onChange={(value) => updateAirport('elevation', value)}
        />
        <NumberField
          label="QNH"
          value={selection.pressure === 'manual' ? qnhValue : ''}
          placeholder={selectedPressurePlaceholder}
          unit="hPa"
          min="0.1"
          step="0.1"
          onChange={(value) => { if (selection.pressure !== 'manual') setSelection('pressure', 'manual'); updateAirport('qnh', value); }}
        />
        <NumberField
          label="ISA deviation"
          value={selection.temperature === 'manual' ? isaValue : ''}
          placeholder={selectedIsaPlaceholder}
          unit="°C"
          step="0.1"
          onChange={(value) => { if (selection.temperature !== 'manual') setSelection('temperature', 'manual'); updateAirport('isa', value); }}
        />
        {pattern === null ? null : <NumberField
          label="Patterns"
          value={pattern.patternCount}
          placeholder="0 (standard)"
          unit="rounds"
          min="0"
          step="1"
          onChange={updatePattern}
        />}
        {!hasAerodromeArrival ? null : (
          <label className="airport-inputs__arrival-buffer">
            <span>Arrival buffer</span>
            <span className="airport-inputs__arrival-buffer-control">
              <input
                type="checkbox"
                checked={arrivalBufferEnabled}
                onChange={(event) => updateArrivalBuffer(event.currentTarget.checked)}
              />
              <span>Include 3 min / {(3 / 60 * aircraft.performance.cruise.fuelFlowLph).toFixed(1)} L</span>
            </span>
          </label>
        )}
        {pattern === null || Number(pattern.patternCount) <= 0 ? null : (
          <p className="navigation-inputs__scope">
            {Number(pattern.patternCount) * 5} min and {(
              Number(pattern.patternCount) * 5 / 60 * aircraft.performance.cruise.fuelFlowLph
            ).toFixed(1)} L at the current cruise fuel flow.
          </p>
        )}
        {isStop ? <>
          <label>
            <span>Operation</span>
            <select
              value={operation!.kind}
              onChange={(event) => updateStopOperation('kind', event.currentTarget.value)}
            >
              <option value="touch-and-go">Touch and go</option>
              <option value="full-stop">Full stop</option>
            </select>
          </label>
          <NumberField
            label="Stop duration"
            value={stop!.stopDurationMinutes}
            placeholder="0"
            unit="min"
            min="0"
            step="5"
            onChange={(value) => {
              const updated = { ...stop!, stopDurationMinutes: value };
              onDraftChange({
                ...draft,
                sectorStopPlans: draft.sectorStopPlans.some((candidate) => candidate.waypointId === active.waypointId)
                  ? draft.sectorStopPlans.map((candidate) => candidate.waypointId === active.waypointId ? updated : candidate)
                  : [...draft.sectorStopPlans, updated],
              });
            }}
          />
          {operation!.kind === 'full-stop' ? <NumberField
            label="Fuel before taxi"
            value={operation!.departureFuelOnboardLitres}
            placeholder="Carry arrival fuel"
            unit="L"
            min="0"
            step="0.1"
            onChange={(value) => updateStopOperation('departureFuelOnboardLitres', value)}
          /> : null}
        </> : null}
        <section className="airport-inputs__weather" aria-label={`Operational weather for ${active.name}`}>
          <h3>Weather{identifier === undefined ? '' : ` — ${identifier}`}</h3>
          <p className="navigation-inputs__scope">Planned {active.key === 'departure' ? 'departure' : active.key === 'destination' ? 'arrival' : 'arrival'}: {formatUtc(plannedTimeUtcMs)}. Weather data: MET Norway.</p>
          {canLoadWeather ? null : <p className="navigation-inputs__scope">Operational weather is available only for an anchored aerodrome with an ICAO identifier, elevation, and planned time.</p>}
          {weather === undefined ? null : <>
            {weatherIsStale ? <p className="navigation-inputs__error" role="status">Weather is stale for the changed planned time. Refresh before selecting it for calculations.</p> : null}
            <div className="airport-inputs__weather-sources">
              <label><span>Wind source</span><select value={selection.wind} onChange={(event) => setSelection('wind', event.currentTarget.value as AirportWeatherSelection['wind'])}>
                <option value="manual">Manual (not configured)</option>
                <option value="metar" disabled={weather.metar.status !== 'available' || weather.metar.value.wind === undefined}>METAR — {weather.metar.status === 'available' ? `${formatWind(weather.metar.value.wind)} · ${formatUtc(weather.metar.value.observationTimeUtcMs)}` : 'Unavailable'}</option>
                <option value="taf" disabled={weather.taf.status !== 'available' || resolveTafWind(weather.taf.value, weather.request.plannedTimeUtcMs).status !== 'available'}>TAF — {weather.taf.status === 'available' ? (() => { const resolved = resolveTafWind(weather.taf.value, weather.request.plannedTimeUtcMs); return resolved.status === 'available' ? `${formatWind(resolved.wind)} · ${formatTafValidity(weather.taf.value)}` : resolved.message; })() : 'Unavailable'}</option>
              </select></label>
              <label><span>Pressure source</span><select value={selection.pressure} onChange={(event) => setSelection('pressure', event.currentTarget.value as AirportWeatherSelection['pressure'])}>
                <option value="manual">Manual — {manualQnh} hPa</option>
                <option value="metar" disabled={weather.metar.status !== 'available' || weather.metar.value.qnhHpa === undefined}>METAR QNH — {weather.metar.status === 'available' && weather.metar.value.qnhHpa !== undefined ? `${weather.metar.value.qnhHpa.toFixed(0)} hPa` : 'Unavailable'}</option>
                <option value="forecast" disabled={weather.forecast.status !== 'available' || weather.forecast.value.pressureMslHpa === undefined}>Forecast MSL — {weather.forecast.status === 'available' && weather.forecast.value.pressureMslHpa !== undefined ? `${weather.forecast.value.pressureMslHpa.toFixed(0)} hPa` : 'Unavailable'}</option>
              </select></label>
              <label><span>Temperature source</span><select value={selection.temperature} onChange={(event) => setSelection('temperature', event.currentTarget.value as AirportWeatherSelection['temperature'])}>
                <option value="manual">Manual ISA — {manualIsa}°C</option>
                <option value="metar" disabled={weather.metar.status !== 'available' || weather.metar.value.temperatureC === undefined}>METAR — {weather.metar.status === 'available' && weather.metar.value.temperatureC !== undefined ? `${weather.metar.value.temperatureC}°C` : 'Unavailable'}</option>
                <option value="forecast" disabled={weather.forecast.status !== 'available' || weather.forecast.value.temperatureC === undefined}>Forecast — {weather.forecast.status === 'available' && weather.forecast.value.temperatureC !== undefined ? `${weather.forecast.value.temperatureC.toFixed(1)}°C` : 'Unavailable'}</option>
              </select></label>
            </div>
            {effectiveWeather === undefined ? null : <p className="navigation-inputs__scope">Effective planning environment: wind {formatWind(effectiveWeather.wind)}; pressure {effectiveWeather.qnhHpa.toFixed(0)} hPa; ISA deviation {effectiveWeather.isaDeviationC.toFixed(1)}°C.{effectiveWeather.unavailable.length === 0 ? '' : ` Review required: ${effectiveWeather.unavailable.join('; ')}.`}</p>}
            {weather.metar.status === 'available' ? <section><h4>METAR · observed {formatUtc(weather.metar.value.observationTimeUtcMs)}</h4><pre>{formatTac(weather.metar.value.rawTac)}</pre></section> : null}
            {weather.taf.status === 'available' ? <section><h4>TAF · {formatTafValidity(weather.taf.value)}</h4><pre>{formatTac(weather.taf.value.rawTac)}</pre></section> : null}
          </>}
        </section>
      </fieldset>
    </section>
  );
}
