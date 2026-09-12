import { useEffect, useMemo, useRef, useState } from 'react';

import {
  calculateAerodromePatternAltitudeFtMsl,
  DEFAULT_PERSONAL_CROSSWIND_LIMIT_KT,
  DEFAULT_PATTERN_HEIGHT_AGL_FT,
  getRccPerformanceRule,
} from '../../calculations';
import type { AerodromeDetails, AircraftDefinition, FlightPlan } from '../../domain';
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
  DEFAULT_RUNWAY_OAT_C,
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
  isAirportWeatherContextStale,
  shouldPublishAirportEnvironment,
} from './airportEnvironmentPublication';
import type {
  PublishedAirportEnvironment,
} from './airportEnvironmentPublication';
import { deriveAirportStops } from './airportStops';
import type { AirportOperationContext, AirportStopContext } from './airportStops';

export interface AirportInputsProps {
  flightPlan: FlightPlan;
  aircraft: AircraftDefinition;
  draft: PerformanceInputDraft;
  operationalDraft: OperationalInputDraft;
  defaults: PerformanceInputDefaults;
  aerodromeDetailsByWaypointId: ReadonlyMap<string, AerodromeDetails>;
  plannedTimeUtcMsByOperationKey?: ReadonlyMap<string, number>;
  /** Prevent a selected route-wind forecast from invalidating its own ETA context. */
  suppressForecastWindEtaStaleness?: boolean;
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

type SharedRunwayField =
  | 'runwayDesignator'
  | 'rcc'
  | 'runwayCondition';

function sharedRunwayField(
  operations: readonly RunwayPerformanceOperationInputDraft[],
  field: SharedRunwayField,
): { readonly value: string; readonly differs: boolean } {
  const firstValue = operations[0]?.[field] ?? '';
  const differs = operations.some((operation) => operation[field] !== firstValue);
  return { value: differs ? '' : firstValue, differs };
}

export function AirportInputs({
  flightPlan,
  aircraft,
  draft,
  operationalDraft,
  defaults,
  aerodromeDetailsByWaypointId,
  plannedTimeUtcMsByOperationKey = new Map(),
  suppressForecastWindEtaStaleness = false,
  onEffectivePlanningEnvironmentChange,
  onDraftChange,
  onOperationalDraftChange,
}: AirportInputsProps) {
  const stops = useMemo<readonly AirportStopContext[]>(() => {
    return deriveAirportStops(flightPlan);
  }, [flightPlan.sectorBoundaryWaypointIds, flightPlan.waypoints]);
  const [activeKey, setActiveKey] = useState<string>('');
  const [weatherByStopKey, setWeatherByStopKey] = useState<ReadonlyMap<string, AirportOperationalWeather>>(new Map());
  const [weatherSelectionsByStopKey, setWeatherSelectionsByStopKey] = useState<ReadonlyMap<string, AirportWeatherSelection>>(new Map());
  const weatherAbort = useRef<AbortController | null>(null);
  const publishedEnvironments = useRef<
    ReadonlyMap<string, PublishedAirportEnvironment>
  >(new Map());
  const [weatherLoadInProgress, setWeatherLoadInProgress] = useState(false);
  useEffect(() => () => weatherAbort.current?.abort(), []);
  const primaryOperation = (stop: AirportStopContext) =>
    stop.operations.find((operation) => operation.kind === 'landing') ??
    stop.operations[0]!;
  const airportWeatherRequest = (stop: AirportStopContext) => {
    const operation = primaryOperation(stop);
    const candidate = flightPlan.waypoints.find((item) => item.id === stop.waypointId);
    const airportIdentifier = candidate?.anchor?.publishedIdentifier;
    const stopDraft = draft.sectorStopPlans.find((candidate) => candidate.waypointId === stop.waypointId);
    const enteredElevation = stop.role === 'departure'
      ? draft.departureElevationFtMsl
      : stop.role === 'destination'
        ? draft.destinationElevationFtMsl
        : stopDraft?.elevationFtMsl ?? '';
    const defaultForTab = stop.role === 'departure'
      ? defaults.departureElevationFtMsl
      : stop.role === 'destination'
        ? defaults.destinationElevationFtMsl
        : defaults.sectorStopElevationFtMslByWaypointId?.[stop.waypointId];
    const elevationFtMsl = enteredElevation.trim() === ''
      ? defaultForTab
      : Number(enteredElevation);
    const plannedTimeUtcMs = plannedTimeUtcMsByOperationKey.get(operation.key);
    if (candidate?.anchor?.feature.featureKind !== 'aerodrome' || airportIdentifier === undefined || elevationFtMsl === undefined || !Number.isFinite(elevationFtMsl) || plannedTimeUtcMs === undefined) return null;
    return {
      airportKey: stop.key,
      icaoIdentifier: airportIdentifier,
      position: candidate.position,
      elevationFtMsl,
      plannedTimeUtcMs,
      context: stop.role === 'departure'
        ? 'departure' as const
        : stop.role === 'destination'
          ? 'destination' as const
          : 'arrival' as const,
    };
  };
  useEffect(() => {
    if (onEffectivePlanningEnvironmentChange === undefined) {
      publishedEnvironments.current = new Map();
      return;
    }

    const nextPublished = new Map<string, PublishedAirportEnvironment>();
    for (const stop of stops) {
      const primary = primaryOperation(stop);
      const stopDraft = draft.sectorStopPlans.find((candidate) => candidate.waypointId === stop.waypointId);
      const qnhDraft = stop.role === 'departure' ? draft.departureQnhHpa : stop.role === 'destination' ? draft.destinationQnhHpa : stopDraft?.qnhHpa ?? '';
      const isaDraft = stop.role === 'departure' ? draft.departureIsaDeviationC : stop.role === 'destination' ? draft.destinationIsaDeviationC : stopDraft?.isaDeviationC ?? '';
      const tabQnh = qnhDraft.trim() === '' ? DEFAULT_PLANNING_QNH_HPA : Number(qnhDraft);
      const tabIsa = isaDraft.trim() === '' ? DEFAULT_PLANNING_ISA_DEVIATION_C : Number(isaDraft);
      const tabOperation = operationalDraft.runwayPerformanceOperations.find((candidate) => runwayPerformanceOperationDraftKey(candidate) === primary.key)
        ?? createRunwayPerformanceOperationInputDraft(primary.kind, primary.sectorFromWaypointId, primary.sectorToWaypointId, primary.waypointId);
      const tabOat = tabOperation.manualOatC.trim() === ''
        ? DEFAULT_RUNWAY_OAT_C
        : Number(tabOperation.manualOatC);
      const tabWind = tabOperation.manualWindDirectionFromTrueDeg.trim() === '' || tabOperation.manualWindSpeedKt.trim() === '' ? undefined : {
        kind: 'fixed' as const,
        directionFromTrueDeg: Number(tabOperation.manualWindDirectionFromTrueDeg),
        speedKt: Number(tabOperation.manualWindSpeedKt),
        ...(tabOperation.manualWindGustKt.trim() === '' ? {} : { gustKt: Number(tabOperation.manualWindGustKt) }),
      };
      const tabRequest = airportWeatherRequest(stop);
      const tabLoadedWeather = weatherByStopKey.get(stop.key);
      const tabSelection = weatherSelectionsByStopKey.get(stop.key) ?? MANUAL_AIRPORT_WEATHER_SELECTION;
      const tabWeather = tabLoadedWeather ?? (tabRequest === null ? undefined : {
        request: tabRequest,
        metar: { status: 'unavailable' as const, message: 'Not loaded' },
        taf: { status: 'unavailable' as const, message: 'Not loaded' },
        forecast: { status: 'unavailable' as const, message: 'Not loaded' },
      });
      const stale = isAirportWeatherContextStale(
        tabLoadedWeather?.request.plannedTimeUtcMs,
        plannedTimeUtcMsByOperationKey.get(primary.key),
        suppressForecastWindEtaStaleness,
      );
      const environment = tabWeather === undefined || stale || !Number.isFinite(tabQnh) || !Number.isFinite(tabIsa)
        ? null
        : resolveEffectiveAirportPlanningEnvironment({
            qnhHpa: tabQnh,
            isaDeviationC: tabIsa,
            ...(Number.isFinite(tabOat) ? { temperatureC: tabOat } : {}),
            ...(tabWind === undefined ? {} : { wind: tabWind }),
          }, tabWeather, tabSelection);
      for (const operation of stop.operations) {
        nextPublished.set(operation.key, {
          waypointId: stop.waypointId,
          environment,
        });
        const previous = publishedEnvironments.current.get(operation.key);
        if (shouldPublishAirportEnvironment(
          previous,
          stop.waypointId,
          environment,
        )) {
          onEffectivePlanningEnvironmentChange(
            operation.key,
            stop.waypointId,
            environment,
          );
        }
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
  }, [draft, onEffectivePlanningEnvironmentChange, operationalDraft.runwayPerformanceOperations, plannedTimeUtcMsByOperationKey, stops, suppressForecastWindEtaStaleness, weatherByStopKey, weatherSelectionsByStopKey]);

  const active = stops.find((stop) => stop.key === activeKey) ?? stops[0];

  useEffect(() => {
    if (active !== undefined && !stops.some((stop) => stop.key === activeKey)) {
      setActiveKey(active.key);
    }
  }, [active, activeKey, stops]);

  if (active === undefined) return null;

  const loadableAirportCount = stops.filter((stop) => airportWeatherRequest(stop) !== null).length;
  const loadRouteWeather = async (refresh = false) => {
    weatherAbort.current?.abort();
    const controller = new AbortController();
    weatherAbort.current = controller;
    setWeatherLoadInProgress(true);
    try {
      // Deliberately sequential: a route may contain many stops and MET Norway
      // asks clients to avoid bursts of concurrent requests.
      for (const stop of stops) {
        const request = airportWeatherRequest(stop);
        if (request === null) continue;
        setWeatherByStopKey((current) => new Map(current).set(stop.key, {
          request, metar: { status: 'loading' }, taf: { status: 'loading' }, forecast: { status: 'loading' },
        }));
        try {
          const value = await fetchAirportOperationalWeather(request, controller.signal, refresh);
          if (!controller.signal.aborted) setWeatherByStopKey((current) => new Map(current).set(stop.key, value));
        } catch (error) {
          if (!controller.signal.aborted) setWeatherByStopKey((current) => new Map(current).set(stop.key, {
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
  const weatherOperation = primaryOperation(active);
  const identifier = waypoint?.anchor?.publishedIdentifier;
  const isStop = active.role === 'stop';
  const stop = isStop
    ? draft.sectorStopPlans.find((candidate) => candidate.waypointId === active.waypointId) ??
      createEmptySectorStopInputDraft(active.waypointId)
    : null;
  const operation = isStop
    ? operationalDraft.sectorOperations.find(
        (candidate) => candidate.waypointId === active.waypointId,
      ) ?? createEmptySectorOperationInputDraft(active.waypointId)
    : null;
  const hasLandingOperation = active.operations.some(
    (candidate) => candidate.kind === 'landing',
  );
  const pattern = !hasLandingOperation
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
  const selection = weatherSelectionsByStopKey.get(active.key) ?? MANUAL_AIRPORT_WEATHER_SELECTION;
  const weather = weatherByStopKey.get(active.key);
  const plannedTimeUtcMs = plannedTimeUtcMsByOperationKey.get(weatherOperation.key);
  const weatherIsStale = isAirportWeatherContextStale(
    weather?.request.plannedTimeUtcMs,
    plannedTimeUtcMs,
    suppressForecastWindEtaStaleness,
  );
  const canLoadWeather = airportWeatherRequest(active) !== null;
  const manualQnh = qnhValue.trim() === '' ? DEFAULT_PLANNING_QNH_HPA : Number(qnhValue);
  const manualIsa = isaValue.trim() === '' ? DEFAULT_PLANNING_ISA_DEVIATION_C : Number(isaValue);
  const runwayOperation = operationalDraft.runwayPerformanceOperations.find(
    (candidate) => runwayPerformanceOperationDraftKey(candidate) === weatherOperation.key,
  ) ?? createRunwayPerformanceOperationInputDraft(weatherOperation.kind, weatherOperation.sectorFromWaypointId, weatherOperation.sectorToWaypointId, weatherOperation.waypointId);
  const manualOat = runwayOperation.manualOatC.trim() === ''
    ? DEFAULT_RUNWAY_OAT_C
    : Number(runwayOperation.manualOatC);
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
  const selectedOatPlaceholder = selection.temperature === 'manual'
    ? `${DEFAULT_RUNWAY_OAT_C.toFixed(1)} (standard ISA)`
    : effectiveWeather?.temperatureC === undefined
      ? 'Required for runway performance'
      : `${effectiveWeather.temperatureC.toFixed(1)} (${selection.temperature})`;
  const setSelection = (field: keyof AirportWeatherSelection, value: AirportWeatherSelection[typeof field]) => setWeatherSelectionsByStopKey((current) => new Map(current).set(active.key, { ...selection, [field]: value }));

  const operationDraft = (context: AirportOperationContext) =>
    operationalDraft.runwayPerformanceOperations.find(
      (candidate) => runwayPerformanceOperationDraftKey(candidate) === context.key,
    ) ?? createRunwayPerformanceOperationInputDraft(
      context.kind,
      context.sectorFromWaypointId,
      context.sectorToWaypointId,
      context.waypointId,
    );
  const updateAirportOperations = (
    changes: Partial<RunwayPerformanceOperationInputDraft>,
  ) => {
    const activeKeys = new Set(active.operations.map((context) => context.key));
    const updatedActive = active.operations.map((context) => ({
      ...operationDraft(context),
      ...changes,
    }));
    onOperationalDraftChange({
      ...operationalDraft,
      runwayPerformanceOperations: [
        ...operationalDraft.runwayPerformanceOperations.filter(
          (candidate) => !activeKeys.has(runwayPerformanceOperationDraftKey(candidate)),
        ),
        ...updatedActive,
      ],
    });
  };
  const runwayOperations = active.operations.map(operationDraft);
  const sharedRunwayDesignator = sharedRunwayField(
    runwayOperations,
    'runwayDesignator',
  );
  const sharedRcc = sharedRunwayField(runwayOperations, 'rcc');
  const sharedRunwayCondition = sharedRunwayField(
    runwayOperations,
    'runwayCondition',
  );
  const runwayDetails = aerodromeDetailsByWaypointId.get(active.waypointId);

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
      <fieldset className="navigation-inputs airport-inputs__global-limits">
        <legend>Runway limits</legend>
        <NumberField
          label="Personal X-wind limit"
          value={operationalDraft.personalCrosswindLimitKt}
          placeholder={`${DEFAULT_PERSONAL_CROSSWIND_LIMIT_KT} (standard)`}
          unit="kt"
          min="0"
          step="1"
          onChange={(value) => onOperationalDraftChange({
            ...operationalDraft,
            personalCrosswindLimitKt: value,
          })}
        />
        <label className="airport-inputs__instructor-limit">
          <span>Crosswind policy</span>
          <span className="airport-inputs__arrival-buffer-control">
            <input
              type="checkbox"
              checked={operationalDraft.instructor}
              onChange={(event) => onOperationalDraftChange({
                ...operationalDraft,
                instructor: event.currentTarget.checked,
              })}
            />
            <span>Use instructor RCC limits</span>
          </span>
        </label>
      </fieldset>
      <div className="airport-inputs__tabs" role="tablist" aria-label="Route airports">
        {stops.map((stop) => (
          <button
            key={stop.key}
            type="button"
            role="tab"
            aria-selected={stop.key === active.key}
            className={`button${stop.key === active.key ? ' button--active' : ''}`}
            onClick={() => setActiveKey(stop.key)}
          >
            {stop.role === 'departure' ? 'DEP' : stop.role === 'destination' ? 'DEST' : 'STOP'} {stop.name}
          </button>
        ))}
      </div>
      <p className="airport-inputs__weather-action">
        <button
          type="button"
          className="button"
          disabled={weatherLoadInProgress || loadableAirportCount === 0}
          onClick={() => { void loadRouteWeather(weatherByStopKey.size > 0); }}
        >
          {weatherLoadInProgress
            ? 'Loading route weather…'
            : weatherByStopKey.size > 0
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
          placeholder={selectedOatPlaceholder}
          unit="°C"
          step="0.1"
          onChange={(value) => { if (selection.temperature !== 'manual') setSelection('temperature', 'manual'); updateAirportOperations({ manualOatC: value }); }}
        />
        <NumberField label="Surface wind from" value={selection.wind === 'manual' ? runwayOperation.manualWindDirectionFromTrueDeg : ''} placeholder={effectiveWeather?.wind?.kind === 'fixed' ? `${Math.round(effectiveWeather.wind.directionFromTrueDeg)} (${selection.wind})` : 'Required'} unit="°T" min="0" step="1" onChange={(value) => { if (selection.wind !== 'manual') setSelection('wind', 'manual'); updateAirportOperations({ manualWindDirectionFromTrueDeg: value }); }} />
        <NumberField label="Surface wind speed" value={selection.wind === 'manual' ? runwayOperation.manualWindSpeedKt : ''} placeholder={effectiveWeather?.wind === undefined ? 'Required' : `${Math.round(effectiveWeather.wind.speedKt)} (${selection.wind})`} unit="kt" min="0" step="1" onChange={(value) => { if (selection.wind !== 'manual') setSelection('wind', 'manual'); updateAirportOperations({ manualWindSpeedKt: value }); }} />
        <NumberField label="Surface gust" value={selection.wind === 'manual' ? runwayOperation.manualWindGustKt : ''} placeholder="optional" unit="kt" min="0" step="1" onChange={(value) => { if (selection.wind !== 'manual') setSelection('wind', 'manual'); updateAirportOperations({ manualWindGustKt: value }); }} />
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
        <section className="airport-inputs__runway-operations" aria-label={`Runway inputs for ${active.name}`}>
          <h3>Runway performance inputs</h3>
          <fieldset className="airport-inputs__runway-operation">
            <legend>Runway</legend>
            <label>
              <span>RWY</span>
              <select
                value={sharedRunwayDesignator.value}
                onChange={(event) => updateAirportOperations({ runwayDesignator: event.currentTarget.value })}
              >
                <option value="">{sharedRunwayDesignator.differs ? 'Different values' : 'Select'}</option>
                {(runwayDetails?.runways.flatMap((runway) => runway.directions) ?? []).map((direction) => (
                  <option key={direction.designator} value={direction.designator}>{direction.designator}</option>
                ))}
              </select>
            </label>
            <label>
              <span>RCC</span>
              <select
                value={sharedRcc.value}
                onChange={(event) => updateAirportOperations({ rcc: event.currentTarget.value })}
              >
                <option value="">{sharedRcc.differs ? 'Different values' : 'Select'}</option>
                {[6, 5, 4, 3, 2, 1, 0].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label>
              <span>RWY state</span>
              <input
                type="text"
                value={sharedRunwayCondition.value}
                placeholder={sharedRunwayCondition.differs
                  ? 'Different values'
                  : sharedRcc.value === ''
                    ? 'optional'
                    : getRccPerformanceRule(Number(sharedRcc.value) as 0 | 1 | 2 | 3 | 4 | 5 | 6).runwayCondition}
                onChange={(event) => updateAirportOperations({ runwayCondition: event.currentTarget.value })}
              />
            </label>
          </fieldset>
        </section>
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
          <p className="navigation-inputs__scope">Planned {active.role === 'stop' ? 'stop arrival' : weatherOperation.kind}: {formatUtc(plannedTimeUtcMs)}. Weather data: MET Norway.</p>
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
                <option value="manual">Manual OAT — {runwayOperation.manualOatC.trim() === '' ? `${DEFAULT_RUNWAY_OAT_C}°C (standard ISA)` : `${manualOat}°C`}</option>
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
