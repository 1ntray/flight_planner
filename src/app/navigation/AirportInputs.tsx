import { useEffect, useMemo, useState } from 'react';

import {
  calculateAerodromePatternAltitudeFtMsl,
  DEFAULT_PATTERN_HEIGHT_AGL_FT,
} from '../../calculations';
import type { AircraftDefinition, FlightPlan } from '../../domain';
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
  onDraftChange: (draft: PerformanceInputDraft) => void;
  onOperationalDraftChange: (draft: OperationalInputDraft) => void;
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

export function AirportInputs({
  flightPlan,
  aircraft,
  draft,
  operationalDraft,
  defaults,
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
  const active = tabs.find((tab) => tab.key === activeKey) ?? tabs[0];

  useEffect(() => {
    if (active !== undefined && !tabs.some((tab) => tab.key === activeKey)) {
      setActiveKey(active.key);
    }
  }, [active, activeKey, tabs]);

  if (active === undefined) return null;

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
          value={qnhValue}
          placeholder={`${DEFAULT_PLANNING_QNH_HPA} (standard)`}
          unit="hPa"
          min="0.1"
          step="0.1"
          onChange={(value) => updateAirport('qnh', value)}
        />
        <NumberField
          label="ISA deviation"
          value={isaValue}
          placeholder={`${DEFAULT_PLANNING_ISA_DEVIATION_C} (standard)`}
          unit="°C"
          step="0.1"
          onChange={(value) => updateAirport('isa', value)}
        />
        {pattern === null ? null : <NumberField
          label="Patterns"
          value={pattern.patternCount}
          unit="rounds"
          min="0"
          step="1"
          onChange={updatePattern}
        />}
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
      </fieldset>
    </section>
  );
}
