import { useMemo } from 'react';

import type { FlightPlan } from '../../domain';
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
  createEmptySectorOperationInputDraft,
} from './operationalInput';
import type {
  OperationalInputDraft,
  SectorOperationInputDraft,
} from './operationalInput';

export interface SectorStopControlsProps {
  flightPlan: FlightPlan;
  draft: PerformanceInputDraft;
  operationalDraft: OperationalInputDraft;
  defaults: PerformanceInputDefaults;
  onDraftChange: (draft: PerformanceInputDraft) => void;
  onOperationalDraftChange: (draft: OperationalInputDraft) => void;
}

export function SectorStopControls({
  flightPlan,
  draft,
  operationalDraft,
  defaults,
  onDraftChange,
  onOperationalDraftChange,
}: SectorStopControlsProps) {
  const stopWaypoints = useMemo(() => {
    const ids = new Set(flightPlan.sectorBoundaryWaypointIds ?? []);
    return flightPlan.waypoints.filter((waypoint) => ids.has(waypoint.id));
  }, [flightPlan.sectorBoundaryWaypointIds, flightPlan.waypoints]);

  if (stopWaypoints.length === 0) {
    return null;
  }

  const updateStop = (
    waypointId: string,
    field: Exclude<
      keyof SectorStopInputDraft,
      'waypointId' | 'legacyOnwardDepartureTimeUtcMs'
    >,
    value: string,
  ) => {
    const existing = draft.sectorStopPlans.find(
      (stop) => stop.waypointId === waypointId,
    ) ?? createEmptySectorStopInputDraft(waypointId);
    const updated = { ...existing, [field]: value };

    onDraftChange({
      ...draft,
      sectorStopPlans: draft.sectorStopPlans.some(
        (stop) => stop.waypointId === waypointId,
      )
        ? draft.sectorStopPlans.map((stop) =>
            stop.waypointId === waypointId ? updated : stop,
          )
        : [...draft.sectorStopPlans, updated],
    });
  };

  const updateOperation = (
    waypointId: string,
    field: Exclude<keyof SectorOperationInputDraft, 'waypointId'>,
    value: string,
  ) => {
    const existing = operationalDraft.sectorOperations.find(
      (operation) => operation.waypointId === waypointId,
    ) ?? createEmptySectorOperationInputDraft(waypointId);
    const updated = { ...existing, [field]: value };

    onOperationalDraftChange({
      ...operationalDraft,
      sectorOperations: operationalDraft.sectorOperations.some(
        (operation) => operation.waypointId === waypointId,
      )
        ? operationalDraft.sectorOperations.map((operation) =>
            operation.waypointId === waypointId ? updated : operation,
          )
        : [...operationalDraft.sectorOperations, updated],
    });
  };

  return (
    <section className="sector-stop-controls" aria-label="Intermediate airports">
      <div>
        <p className="eyebrow">Intermediate airports</p>
        <p className="plan-file-controls__description">
          Each landing ends one navlog at pattern altitude. The next sector
          starts at aerodrome elevation after the entered ground time. Blank
          means an immediate onward departure.
        </p>
      </div>

      {stopWaypoints.map((waypoint) => {
        const stop = draft.sectorStopPlans.find(
          (candidate) => candidate.waypointId === waypoint.id,
        ) ?? createEmptySectorStopInputDraft(waypoint.id);
        const operation = operationalDraft.sectorOperations.find(
          (candidate) => candidate.waypointId === waypoint.id,
        ) ?? createEmptySectorOperationInputDraft(waypoint.id);

        return (
          <fieldset key={waypoint.id} className="navigation-inputs sector-stop-controls__airport">
            <legend>{waypoint.name}</legend>
            <label>
              <span>Elevation</span>
              <span className="navigation-inputs__control">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={stop.elevationFtMsl}
                  placeholder={
                    defaults.sectorStopElevationFtMslByWaypointId?.[
                      waypoint.id
                    ] === undefined
                      ? undefined
                      : `${
                          defaults.sectorStopElevationFtMslByWaypointId[
                            waypoint.id
                          ]
                        } (aerodrome)`
                  }
                  onChange={(event) =>
                    updateStop(waypoint.id, 'elevationFtMsl', event.currentTarget.value)
                  }
                />
                <span>ft MSL</span>
              </span>
            </label>
            <label>
              <span>QNH</span>
              <span className="navigation-inputs__control">
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={stop.qnhHpa}
                  placeholder={`${DEFAULT_PLANNING_QNH_HPA} (standard)`}
                  onChange={(event) =>
                    updateStop(waypoint.id, 'qnhHpa', event.currentTarget.value)
                  }
                />
                <span>hPa</span>
              </span>
            </label>
            <label>
              <span>ISA deviation</span>
              <span className="navigation-inputs__control">
                <input
                  type="number"
                  step="0.1"
                  value={stop.isaDeviationC}
                  placeholder={`${DEFAULT_PLANNING_ISA_DEVIATION_C} (standard)`}
                  onChange={(event) =>
                    updateStop(waypoint.id, 'isaDeviationC', event.currentTarget.value)
                  }
                />
                <span>°C</span>
              </span>
            </label>
            <label>
              <span>Operation</span>
              <select
                value={operation.kind}
                onChange={(event) =>
                  updateOperation(
                    waypoint.id,
                    'kind',
                    event.currentTarget.value,
                  )
                }
              >
                <option value="touch-and-go">Touch and go</option>
                <option value="full-stop">Full stop</option>
              </select>
            </label>
            <label>
              <span>Stop duration</span>
              <span className="navigation-inputs__control">
                <input
                  type="number"
                  min="0"
                  step="5"
                  placeholder="0"
                  value={stop.stopDurationMinutes}
                  onChange={(event) =>
                    updateStop(
                      waypoint.id,
                      'stopDurationMinutes',
                      event.currentTarget.value,
                    )
                  }
                />
                <span>min</span>
              </span>
            </label>
            {operation.kind === 'full-stop' ? (
              <label>
                <span>Fuel before taxi</span>
                <span className="navigation-inputs__control">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder="Carry arrival fuel"
                    value={operation.departureFuelOnboardLitres}
                    onChange={(event) =>
                      updateOperation(
                        waypoint.id,
                        'departureFuelOnboardLitres',
                        event.currentTarget.value,
                      )
                    }
                  />
                  <span>L</span>
                </span>
              </label>
            ) : null}
            {stop.legacyOnwardDepartureTimeUtcMs !== undefined &&
            stop.stopDurationMinutes.trim() === '' ? (
              <p className="plan-file-controls__description">
                This imported plan still uses its saved fixed onward departure.
                Enter a duration to replace it.
              </p>
            ) : null}
          </fieldset>
        );
      })}
    </section>
  );
}
