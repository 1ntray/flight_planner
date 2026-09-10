import { useEffect, useMemo, useRef, useState } from 'react';

import {
  calculateAerodromePatternAltitudeFtMsl,
  DEFAULT_PATTERN_HEIGHT_AGL_FT,
  deriveFlightPlanSectors,
} from '../../calculations';
import { runwayOperationKey } from '../../domain';
import type { AircraftDefinition, FlightPlan, RunwayOperationKind } from '../../domain';
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
  EffectiveAirportPlanningEnvironment,
} from '../../weather';
import {
  createEmptyAerodromePatternInputDraft,
  createEmptySectorOperationInputDraft,
  createRunwayPerformanceOperationInputDraft,
  runwayPerformanceOperationDraftKey,
} from './operationalInput';
import type {
  AerodromePatternInputDraft,
  OperationalInputDraft,
  SectorOperationInputDraft,
  RunwayPerformanceOperationInputDraft,
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
import {
  shouldPublishAirportEnvironment,
} from './airportEnvironmentPublication';
import type {
  PublishedAirportEnvironment,
} from './airportEnvironmentPublication';

type AirportTab = {
  readonly key: string;
  readonly kind: RunwayOperationKind;
  readonly sectorFromWaypointId: string;
  readonly sectorToWaypointId: string;
  readonly waypointId: string;
  readonly name: string;
  readonly role: 'departure' | 'arrival' | 'onward-departure' | 'destination';
};

export interface AirportInputsProps {
  flightPlan: FlightPlan;
  aircraft: AircraftDefinition;
  draft: PerformanceInputDraft;
  operationalDraft: OperationalInputDraft;
  defaults: PerformanceInputDefaults;
  plannedTimeUtcMsByOperationKey?: ReadonlyMap<string, number>;
  onEffectivePlanningEnvironmentChange?: (
    operationKey: string,
    waypointId: string,
    environment: EffectiveAirportPlanningEnvironment | null,
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
  plannedTimeUtcMsByOperationKey = new Map(),
  onEffectivePlanningEnvironmentChange,
  onDraftChange,
  onOperationalDraftChange,
}: AirportInputsProps) {
  const tabs = useMemo<readonly AirportTab[]>(() => {
    const sectors = deriveFlightPlanSectors(flightPlan);
    return sectors.flatMap((sector, index) => {
      const from = sector.flightPlan.waypoints[0]!;
      const to = sector.flightPlan.waypoints.at(-1)!;
      return [
        {
          key: runwayOperationKey('takeoff', from.id, to.id), kind: 'takeoff' as const,
          sectorFromWaypointId: from.id, sectorToWaypointId: to.id,
          waypointId: from.id, name: from.name,
          role: index === 0 ? 'departure' as const : 'onward-departure' as const,
        },
        {
          key: runwayOperationKey('landing', from.id, to.id), kind: 'landing' as const,
          sectorFromWaypointId: from.id, sectorToWaypointId: to.id,
          waypointId: to.id, name: to.name,
          role: index === sectors.length - 1 ? 'destination' as const : 'arrival' as const,
        },
      ];
    });
  }, [flightPlan.sectorBoundaryWaypointIds, flightPlan.waypoints]);
  const [activeKey, setActiveKey] = useState<string>('');
  const [weatherByOperationKey, setWeatherByOperationKey] = useState<ReadonlyMap<string, AirportOperationalWeather>>(new Map());
  const [weatherSelections, setWeatherSelections] = useState<ReadonlyMap<string, AirportWeatherSelection>>(new Map());
  const weatherAbort = useRef<AbortController | null>(null);
  const publishedEnvironments = useRef<
    ReadonlyMap<string, PublishedAirportEnvironment>
  >(new Map());
  const [weatherLoadInProgress, setWeatherLoadInProgress] = useState(false);
  useEffect(() => () => weatherAbort.current?.abort(), []);
  const airportWeatherRequest = (tab: AirportTab) => {
    const candidate = flightPlan.waypoints.find((item) => item.id === tab.waypointId);
    const airportIdentifier = candidate?.anchor?.publishedIdentifier;
    const stopDraft = draft.sectorStopPlans.find((candidate) => candidate.waypointId === tab.waypointId);
    const enteredElevation = tab.role === 'departure'
      ? draft.departureElevationFtMsl
      : tab.role === 'destination'
        ? draft.destinationElevationFtMsl
        : stopDraft?.elevationFtMsl ?? '';
    const defaultForTab = tab.role === 'departure'
      ? defaults.departureElevationFtMsl
      : tab.role === 'destination'
        ? defaults.destinationElevationFtMsl
        : defaults.sectorStopElevationFtMslByWaypointId?.[tab.waypointId];
    const elevationFtMsl = enteredElevation.trim() === ''
      ? defaultForTab
      : Number(enteredElevation);
    const plannedTimeUtcMs = plannedTimeUtcMsByOperationKey.get(tab.key);
    if (candidate?.anchor?.feature.featureKind !== 'aerodrome' || airportIdentifier === undefined || elevationFtMsl === undefined || !Number.isFinite(elevationFtMsl) || plannedTimeUtcMs === undefined) return null;
    return {
      airportKey: tab.key,
      icaoIdentifier: airportIdentifier,
      position: candidate.position,
      elevationFtMsl,
      plannedTimeUtcMs,
      context: tab.role,
    };
  };
  useEffect(() => {
    if (onEffectivePlanningEnvironmentChange === undefined) {
      publishedEnvironments.current = new Map();
      return;
    }

    const nextPublished = new Map<string, PublishedAirportEnvironment>();
    for (const tab of tabs) {
      const stopDraft = draft.sectorStopPlans.find((candidate) => candidate.waypointId === tab.waypointId);
      const qnhDraft = tab.role === 'departure' ? draft.departureQnhHpa : tab.role === 'destination' ? draft.destinationQnhHpa : stopDraft?.qnhHpa ?? '';
      const isaDraft = tab.role === 'departure' ? draft.departureIsaDeviationC : tab.role === 'destination' ? draft.destinationIsaDeviationC : stopDraft?.isaDeviationC ?? '';
      const tabQnh = qnhDraft.trim() === '' ? DEFAULT_PLANNING_QNH_HPA : Number(qnhDraft);
      const tabIsa = isaDraft.trim() === '' ? DEFAULT_PLANNING_ISA_DEVIATION_C : Number(isaDraft);
      const tabOperation = operationalDraft.runwayPerformanceOperations.find((candidate) => runwayPerformanceOperationDraftKey(candidate) === tab.key)
        ?? createRunwayPerformanceOperationInputDraft(tab.kind, tab.sectorFromWaypointId, tab.sectorToWaypointId, tab.waypointId);
      const tabOat = tabOperation.manualOatC.trim() === '' ? undefined : Number(tabOperation.manualOatC);
      const tabWind = tabOperation.manualWindDirectionFromTrueDeg.trim() === '' || tabOperation.manualWindSpeedKt.trim() === '' ? undefined : {
        kind: 'fixed' as const,
        directionFromTrueDeg: Number(tabOperation.manualWindDirectionFromTrueDeg),
        speedKt: Number(tabOperation.manualWindSpeedKt),
        ...(tabOperation.manualWindGustKt.trim() === '' ? {} : { gustKt: Number(tabOperation.manualWindGustKt) }),
      };
      const tabRequest = airportWeatherRequest(tab);
      const tabLoadedWeather = weatherByOperationKey.get(tab.key);
      const tabSelection = weatherSelections.get(tab.key) ?? MANUAL_AIRPORT_WEATHER_SELECTION;
      const tabWeather = tabLoadedWeather ?? (tabRequest === null ? undefined : {
        request: tabRequest,
        metar: { status: 'unavailable' as const, message: 'Not loaded' },
        taf: { status: 'unavailable' as const, message: 'Not loaded' },
        forecast: { status: 'unavailable' as const, message: 'Not loaded' },
      });
      const stale = tabLoadedWeather !== undefined &&
        Math.abs(tabLoadedWeather.request.plannedTimeUtcMs - (plannedTimeUtcMsByOperationKey.get(tab.key) ?? tabLoadedWeather.request.plannedTimeUtcMs)) > WEATHER_CONTEXT_STALE_TOLERANCE_MS;
      const environment = tabWeather === undefined || stale || !Number.isFinite(tabQnh) || !Number.isFinite(tabIsa)
        ? null
        : resolveEffectiveAirportPlanningEnvironment({
            qnhHpa: tabQnh,
            isaDeviationC: tabIsa,
            ...(tabOat === undefined || !Number.isFinite(tabOat) ? {} : { temperatureC: tabOat }),
            ...(tabWind === undefined ? {} : { wind: tabWind }),
          }, tabWeather, tabSelection);
      nextPublished.set(tab.key, {
        waypointId: tab.waypointId,
        environment,
      });
      const previous = publishedEnvironments.current.get(tab.key);
      if (shouldPublishAirportEnvironment(
        previous,
        tab.waypointId,
        environment,
      )) {
        onEffectivePlanningEnvironmentChange(
          tab.key,
          tab.waypointId,
          environment,
        );
      }
    }

    for (const [operationKey, previous] of publishedEnvironments.current) {
      if (!nextPublished.has(operationKey)) {
        onEffectivePlanningEnvironmentChange(
          operationKey,
          previous.waypointId,
          null,
        );
      }
    }

    publishedEnvironments.current = nextPublished;
  }, [draft, onEffectivePlanningEnvironmentChange, operationalDraft.runwayPerformanceOperations, plannedTimeUtcMsByOperationKey, tabs, weatherByOperationKey, weatherSelections]);

  const active = tabs.find((tab) => tab.key === activeKey) ?? tabs[0];

  useEffect(() => {
    if (active !== undefined && !tabs.some((tab) => tab.key === activeKey)) {
      setActiveKey(active.key);
    }
  }, [active, activeKey, tabs]);

  if (active === undefined) return null;

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
        setWeatherByOperationKey((current) => new Map(current).set(tab.key, {
          request, metar: { status: 'loading' }, taf: { status: 'loading' }, forecast: { status: 'loading' },
        }));
        try {
          const value = await fetchAirportOperationalWeather(request, controller.signal, refresh);
          if (!controller.signal.aborted) setWeatherByOperationKey((current) => new Map(current).set(tab.key, value));
        } catch (error) {
          if (!controller.signal.aborted) setWeatherByOperationKey((current) => new Map(current).set(tab.key, {
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
  const isStop = active.role === 'arrival' || active.role === 'onward-departure';
  const stop = isStop
    ? draft.sectorStopPlans.find((candidate) => candidate.waypointId === active.waypointId) ??
      createEmptySectorStopInputDraft(active.waypointId)
    : null;
  const operation = isStop
    ? operationalDraft.sectorOperations.find(
        (candidate) => candidate.waypointId === active.waypointId,
      ) ?? createEmptySectorOperationInputDraft(active.waypointId)
    : null;
  const pattern = active.kind === 'takeoff'
    ? null
    : operationalDraft.patternPlans.find(
        (candidate) => candidate.waypointId === active.waypointId,
      ) ?? createEmptyAerodromePatternInputDraft(active.waypointId);
  const hasAerodromeArrival =
    pattern !== null &&
    waypoint?.anchor?.feature.featureKind === 'aerodrome';
  const arrivalBufferEnabled = pattern?.arrivalBufferEnabled ?? true;
  const defaultElevation = active.role === 'departure'
    ? defaults.departureElevationFtMsl
    : active.role === 'destination'
      ? defaults.destinationElevationFtMsl
      : defaults.sectorStopElevationFtMslByWaypointId?.[active.waypointId];
  const elevationValue = active.role === 'departure'
    ? draft.departureElevationFtMsl
    : active.role === 'destination'
      ? draft.destinationElevationFtMsl
      : stop!.elevationFtMsl;
  const qnhValue = active.role === 'departure'
    ? draft.departureQnhHpa
    : active.role === 'destination'
      ? draft.destinationQnhHpa
      : stop!.qnhHpa;
  const isaValue = active.role === 'departure'
    ? draft.departureIsaDeviationC
    : active.role === 'destination'
      ? draft.destinationIsaDeviationC
      : stop!.isaDeviationC;
  const selection = weatherSelections.get(active.key) ?? MANUAL_AIRPORT_WEATHER_SELECTION;
  const weather = weatherByOperationKey.get(active.key);
  const plannedTimeUtcMs = plannedTimeUtcMsByOperationKey.get(active.key);
  const weatherIsStale = weather !== undefined && plannedTimeUtcMs !== undefined &&
    Math.abs(weather.request.plannedTimeUtcMs - plannedTimeUtcMs) > WEATHER_CONTEXT_STALE_TOLERANCE_MS;
  const canLoadWeather = airportWeatherRequest(active) !== null;
  const manualQnh = qnhValue.trim() === '' ? DEFAULT_PLANNING_QNH_HPA : Number(qnhValue);
  const manualIsa = isaValue.trim() === '' ? DEFAULT_PLANNING_ISA_DEVIATION_C : Number(isaValue);
  const runwayOperation = operationalDraft.runwayPerformanceOperations.find(
    (candidate) => runwayPerformanceOperationDraftKey(candidate) === active.key,
  ) ?? createRunwayPerformanceOperationInputDraft(active.kind, active.sectorFromWaypointId, active.sectorToWaypointId, active.waypointId);
  const manualOat = runwayOperation.manualOatC.trim() === '' ? undefined : Number(runwayOperation.manualOatC);
  const manualWind = runwayOperation.manualWindDirectionFromTrueDeg.trim() === '' || runwayOperation.manualWindSpeedKt.trim() === '' ? undefined : {
    kind: 'fixed' as const,
    directionFromTrueDeg: Number(runwayOperation.manualWindDirectionFromTrueDeg),
    speedKt: Number(runwayOperation.manualWindSpeedKt),
    ...(runwayOperation.manualWindGustKt.trim() === '' ? {} : { gustKt: Number(runwayOperation.manualWindGustKt) }),
  };
  const request = airportWeatherRequest(active);
  const effectiveSource = weather ?? (request === null ? undefined : {
    request,
    metar: { status: 'unavailable' as const, message: 'Not loaded' },
    taf: { status: 'unavailable' as const, message: 'Not loaded' },
    forecast: { status: 'unavailable' as const, message: 'Not loaded' },
  });
  const effectiveWeather = effectiveSource === undefined || weatherIsStale || !Number.isFinite(manualQnh) || !Number.isFinite(manualIsa)
    ? undefined
    : resolveEffectiveAirportPlanningEnvironment({ qnhHpa: manualQnh, isaDeviationC: manualIsa, ...(manualOat === undefined || !Number.isFinite(manualOat) ? {} : { temperatureC: manualOat }), ...(manualWind === undefined ? {} : { wind: manualWind }) }, effectiveSource, selection);
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
  const setSelection = (field: keyof AirportWeatherSelection, value: AirportWeatherSelection[typeof field]) => setWeatherSelections((current) => new Map(current).set(active.key, { ...selection, [field]: value }));

  const updateRunwayOperation = (changes: Partial<RunwayPerformanceOperationInputDraft>) => {
    const updated = { ...runwayOperation, ...changes };
    onOperationalDraftChange({
      ...operationalDraft,
      runwayPerformanceOperations: operationalDraft.runwayPerformanceOperations.some((candidate) => runwayPerformanceOperationDraftKey(candidate) === active.key)
        ? operationalDraft.runwayPerformanceOperations.map((candidate) => runwayPerformanceOperationDraftKey(candidate) === active.key ? updated : candidate)
        : [...operationalDraft.runwayPerformanceOperations, updated],
    });
  };

  const updateAirport = (
    field: 'elevation' | 'qnh' | 'isa',
    value: string,
  ) => {
    if (active.role === 'departure') {
      onDraftChange({
        ...draft,
        ...(field === 'elevation' ? { departureElevationFtMsl: value } : {}),
        ...(field === 'qnh' ? { departureQnhHpa: value } : {}),
        ...(field === 'isa' ? { departureIsaDeviationC: value } : {}),
      });
      return;
    }
    if (active.role === 'destination') {
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
            {tab.role === 'departure' ? 'DEP' : tab.role === 'destination' ? 'DEST' : tab.role === 'arrival' ? 'ARR' : 'DEP'} {tab.name}
          </button>
        ))}
      </div>
      <p className="airport-inputs__weather-action">
        <button
          type="button"
          className="button"
          disabled={weatherLoadInProgress || loadableAirportCount === 0}
          onClick={() => { void loadRouteWeather(weatherByOperationKey.size > 0); }}
        >
          {weatherLoadInProgress
            ? 'Loading route weather…'
            : weatherByOperationKey.size > 0
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
          label="Runway OAT"
          value={selection.temperature === 'manual' ? runwayOperation.manualOatC : ''}
          placeholder={effectiveWeather?.temperatureC === undefined ? 'Required for runway performance' : `${effectiveWeather.temperatureC.toFixed(1)} (${selection.temperature})`}
          unit="°C"
          step="0.1"
          onChange={(value) => { if (selection.temperature !== 'manual') setSelection('temperature', 'manual'); updateRunwayOperation({ manualOatC: value }); }}
        />
        <NumberField label="Surface wind from" value={selection.wind === 'manual' ? runwayOperation.manualWindDirectionFromTrueDeg : ''} placeholder={effectiveWeather?.wind?.kind === 'fixed' ? `${Math.round(effectiveWeather.wind.directionFromTrueDeg)} (${selection.wind})` : 'Required'} unit="°T" min="0" step="1" onChange={(value) => { if (selection.wind !== 'manual') setSelection('wind', 'manual'); updateRunwayOperation({ manualWindDirectionFromTrueDeg: value }); }} />
        <NumberField label="Surface wind speed" value={selection.wind === 'manual' ? runwayOperation.manualWindSpeedKt : ''} placeholder={effectiveWeather?.wind === undefined ? 'Required' : `${Math.round(effectiveWeather.wind.speedKt)} (${selection.wind})`} unit="kt" min="0" step="1" onChange={(value) => { if (selection.wind !== 'manual') setSelection('wind', 'manual'); updateRunwayOperation({ manualWindSpeedKt: value }); }} />
        <NumberField label="Surface gust" value={selection.wind === 'manual' ? runwayOperation.manualWindGustKt : ''} placeholder="optional" unit="kt" min="0" step="1" onChange={(value) => { if (selection.wind !== 'manual') setSelection('wind', 'manual'); updateRunwayOperation({ manualWindGustKt: value }); }} />
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
          <p className="navigation-inputs__scope">Planned {active.kind}: {formatUtc(plannedTimeUtcMs)}. Weather data: MET Norway.</p>
          {canLoadWeather ? null : <p className="navigation-inputs__scope">Operational weather is available only for an anchored aerodrome with an ICAO identifier, elevation, and planned time.</p>}
          {weather === undefined ? null : <>
            {weatherIsStale ? <p className="navigation-inputs__error" role="status">Weather is stale for the changed planned time. Refresh before selecting it for calculations.</p> : null}
            <div className="airport-inputs__weather-sources">
              <label><span>Wind source</span><select value={selection.wind} onChange={(event) => setSelection('wind', event.currentTarget.value as AirportWeatherSelection['wind'])}>
                <option value="manual">Manual surface wind</option>
                <option value="metar" disabled={weather.metar.status !== 'available' || weather.metar.value.wind === undefined}>METAR — {weather.metar.status === 'available' ? `${formatWind(weather.metar.value.wind)} · ${formatUtc(weather.metar.value.observationTimeUtcMs)}` : 'Unavailable'}</option>
                <option value="taf" disabled={weather.taf.status !== 'available' || resolveTafWind(weather.taf.value, weather.request.plannedTimeUtcMs).status !== 'available'}>TAF — {weather.taf.status === 'available' ? (() => { const resolved = resolveTafWind(weather.taf.value, weather.request.plannedTimeUtcMs); return resolved.status === 'available' ? `${formatWind(resolved.wind)} · ${formatTafValidity(weather.taf.value)}` : resolved.message; })() : 'Unavailable'}</option>
              </select></label>
              <label><span>Pressure source</span><select value={selection.pressure} onChange={(event) => setSelection('pressure', event.currentTarget.value as AirportWeatherSelection['pressure'])}>
                <option value="manual">Manual — {manualQnh} hPa</option>
                <option value="metar" disabled={weather.metar.status !== 'available' || weather.metar.value.qnhHpa === undefined}>METAR QNH — {weather.metar.status === 'available' && weather.metar.value.qnhHpa !== undefined ? `${weather.metar.value.qnhHpa.toFixed(0)} hPa` : 'Unavailable'}</option>
                <option value="forecast" disabled={weather.forecast.status !== 'available' || weather.forecast.value.pressureMslHpa === undefined}>Forecast MSL — {weather.forecast.status === 'available' && weather.forecast.value.pressureMslHpa !== undefined ? `${weather.forecast.value.pressureMslHpa.toFixed(0)} hPa` : 'Unavailable'}</option>
              </select></label>
              <label><span>Temperature source</span><select value={selection.temperature} onChange={(event) => setSelection('temperature', event.currentTarget.value as AirportWeatherSelection['temperature'])}>
                <option value="manual">Manual OAT — {manualOat === undefined ? 'not entered' : `${manualOat}°C`}</option>
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
