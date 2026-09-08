import { useMemo } from 'react';

import { calculateRoute, deriveFlightPlanSectors } from '../../calculations';
import type {
  FlightPlan,
  ManualLegWindOverride,
  Wind,
} from '../../domain';
import {
  setLegAltitudeOverride,
  setLegMinimumSafeAltitude,
  setLegAltitudeTargetDistance,
  setLegEndAltitudeOverride,
  setLegEndAltitudeTargetDistance,
} from './altitudePlanState';
import { evaluateMinimumSafeAltitude } from './minimumSafeAltitude';
import type { AltitudePlacementLeg } from './altitudePlanState';
import {
  DEFAULT_PLANNING_ALTITUDE_FT_MSL,
} from './performanceInput';
import type { PerformanceInputDraft } from './performanceInput';
import { LegWindFields } from './LegWindFields';
import {
  findManualLegWindOverride,
} from './legWindOverrideState';
import type { LegWindDefault } from './legWindOverrideState';

export type { AltitudePlacementLeg } from './altitudePlanState';

export interface LegAltitudeControlsProps {
  flightPlan: FlightPlan;
  draft: PerformanceInputDraft;
  manualWindOverrides: readonly ManualLegWindOverride[];
  legWindDefaults: ReadonlyMap<string, LegWindDefault>;
  placementLeg: AltitudePlacementLeg | null;
  onDraftChange: (draft: PerformanceInputDraft) => void;
  onPlacementLegChange: (leg: AltitudePlacementLeg | null) => void;
  onManualLegWindChange: (
    fromWaypointId: string,
    toWaypointId: string,
    wind: Wind | null,
  ) => void;
}

function legKey(fromId: string, toId: string): string {
  return `${fromId}\0${toId}`;
}

export function LegAltitudeControls({
  flightPlan,
  draft,
  manualWindOverrides,
  legWindDefaults,
  placementLeg,
  onDraftChange,
  onPlacementLegChange,
  onManualLegWindChange,
}: LegAltitudeControlsProps) {
  const legs = useMemo(() => calculateRoute(flightPlan), [flightPlan]);
  const waypointNames = useMemo(
    () => new Map(flightPlan.waypoints.map(({ id, name }) => [id, name])),
    [flightPlan.waypoints],
  );
  const plans = useMemo(
    () =>
      new Map(
        draft.legAltitudePlans.map((plan) => [
          legKey(plan.fromWaypointId, plan.toWaypointId),
          plan,
        ]),
      ),
    [draft.legAltitudePlans],
  );
  const arrivalLegKeys = useMemo(
    () =>
      new Set(
        deriveFlightPlanSectors(flightPlan).flatMap((sector) => {
          const waypoints = sector.flightPlan.waypoints;
          const from = waypoints.at(-2);
          const to = waypoints.at(-1);

          return from === undefined || to === undefined
            ? []
            : [legKey(from.id, to.id)];
        }),
      ),
    [flightPlan],
  );

  if (legs.length === 0) {
    return null;
  }

  return (
    <section className="leg-altitude-controls" aria-label="Leg altitude, MSA, and wind plan">
      <div>
        <p className="eyebrow">Altitude, MSA & wind schedule</p>
        <p className="plan-file-controls__description">
          Blank altitude uses the global value. Target distance is measured
          along shaped WGS84 geometry from FROM. MSA is entered manually in ft
          MSL after assessing the 1 NM route corridor. Blank wind fields use
          the indicated route-wide manual or loaded forecast wind.
        </p>
      </div>

      <label className="leg-altitude-controls__default-altitude">
        <span>Default leg altitude</span>
        <span className="navigation-inputs__control">
          <input
            type="number"
            min="0"
            step="100"
            value={draft.defaultAltitudeFtMsl}
            placeholder={`${DEFAULT_PLANNING_ALTITUDE_FT_MSL} (standard)`}
            onChange={(event) => onDraftChange({
              ...draft,
              defaultAltitudeFtMsl: event.currentTarget.value,
            })}
          />
          <span>ft MSL</span>
        </span>
      </label>

      {legs.map((leg) => {
        const key = legKey(leg.fromId, leg.toId);
        const plan = plans.get(key);
        const isArrivalLeg = arrivalLegKeys.has(key);
        const manualWindOverride = findManualLegWindOverride(
          manualWindOverrides,
          leg.fromId,
          leg.toId,
        );
        const defaultWind = legWindDefaults.get(key);
        const placementDistance =
          plan?.targetPlacement?.mode === 'distance-along-leg'
            ? plan.targetPlacement.distanceFromStartNm
            : null;
        const endPlacementDistance =
          plan?.endTargetPlacement?.mode === 'distance-along-leg'
            ? plan.endTargetPlacement.distanceFromStartNm
            : null;
        const choosingPrimaryOnMap =
          placementLeg?.fromWaypointId === leg.fromId &&
          placementLeg.toWaypointId === leg.toId &&
          placementLeg.target === 'primary';
        const choosingEndOnMap =
          placementLeg?.fromWaypointId === leg.fromId &&
          placementLeg.toWaypointId === leg.toId &&
          placementLeg.target === 'end';
        const defaultAltitude = Number(
          draft.defaultAltitudeFtMsl === ''
            ? DEFAULT_PLANNING_ALTITUDE_FT_MSL
            : draft.defaultAltitudeFtMsl,
        );
        const plannedAltitude = plan?.altitudeFtMsl ??
          (Number.isFinite(defaultAltitude) ? defaultAltitude : null);
        const msaWarning = evaluateMinimumSafeAltitude(
          plan?.minimumSafeAltitudeFtMsl,
          plannedAltitude,
        );

        return (
          <article className="leg-altitude-controls__leg" key={legKey(leg.fromId, leg.toId)}>
            <strong>
              {waypointNames.get(leg.fromId) ?? leg.fromId} →{' '}
              {waypointNames.get(leg.toId) ?? leg.toId}
            </strong>
            {isArrivalLeg ? (
              <p className="leg-altitude-controls__arrival-note">
                Arrival leg: the planned altitude remains independent. A final
                descent to the rounded pattern altitude is added automatically.
              </p>
            ) : null}
            {msaWarning === 'missing' ? (
              <p className="leg-altitude-controls__msa-warning">
                MSA not entered — assess the highest terrain or obstacle within
                1 NM of this route and add 500 ft.
              </p>
            ) : null}
            {msaWarning === 'above-planned-altitude' ? (
              <p className="leg-altitude-controls__msa-warning">
                MSA is higher than the planned altitude for this leg.
              </p>
            ) : null}
            <div className="leg-altitude-controls__row">
            <label>
              <span>MSA</span>
              <span className="navigation-inputs__control">
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={plan?.minimumSafeAltitudeFtMsl ?? ''}
                  placeholder="not entered"
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    onDraftChange({
                      ...draft,
                      legAltitudePlans: setLegMinimumSafeAltitude(
                        draft.legAltitudePlans,
                        leg.fromId,
                        leg.toId,
                        value === '' ? null : Number(value),
                      ),
                    });
                  }}
                />
                <span>ft MSL</span>
              </span>
            </label>
            <label>
              <span>Planned altitude</span>
              <span className="navigation-inputs__control">
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={plan?.altitudeFtMsl ?? ''}
                  placeholder={
                    draft.defaultAltitudeFtMsl ||
                    String(DEFAULT_PLANNING_ALTITUDE_FT_MSL)
                  }
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    onDraftChange({
                      ...draft,
                      legAltitudePlans: setLegAltitudeOverride(
                        draft.legAltitudePlans,
                        leg.fromId,
                        leg.toId,
                        value === '' ? null : Number(value),
                      ),
                    });
                  }}
                />
                <span>ft</span>
              </span>
            </label>
            <label>
              <span>Reach at</span>
              <span className="navigation-inputs__control">
                <input
                  type="number"
                  min="0"
                  max={leg.distanceNm}
                  step="0.1"
                  value={
                    placementDistance === null
                      ? ''
                      : Number(placementDistance.toFixed(2))
                  }
                  placeholder="automatic"
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    onDraftChange({
                      ...draft,
                      legAltitudePlans: setLegAltitudeTargetDistance(
                        draft.legAltitudePlans,
                        leg.fromId,
                        leg.toId,
                        value === '' ? null : Number(value),
                      ),
                    });
                  }}
                />
                <span>NM</span>
              </span>
            </label>
            <button
              type="button"
              className={`button${choosingPrimaryOnMap ? ' button--active' : ''}`}
              onClick={() =>
                onPlacementLegChange(
                  choosingPrimaryOnMap
                    ? null
                    : {
                        fromWaypointId: leg.fromId,
                        toWaypointId: leg.toId,
                        target: 'primary',
                      },
                )
              }
            >
              {choosingPrimaryOnMap ? 'Cancel map pick' : 'Choose on map'}
            </button>
            </div>
            <div className="leg-altitude-controls__row leg-altitude-controls__row--end">
              <label>
                <span>End altitude (optional)</span>
                <span className="navigation-inputs__control">
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={plan?.endAltitudeFtMsl ?? ''}
                    placeholder="same as planned"
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      onDraftChange({
                        ...draft,
                        legAltitudePlans: setLegEndAltitudeOverride(
                          draft.legAltitudePlans,
                          leg.fromId,
                          leg.toId,
                          value === '' ? null : Number(value),
                        ),
                      });
                    }}
                  />
                  <span>ft</span>
                </span>
              </label>
              <label>
                <span>Reach end at</span>
                <span className="navigation-inputs__control">
                  <input
                    type="number"
                    min="0"
                    max={leg.distanceNm}
                    step="0.1"
                    disabled={plan?.endAltitudeFtMsl === undefined}
                    value={
                      endPlacementDistance === null
                        ? ''
                        : Number(endPlacementDistance.toFixed(2))
                    }
                    placeholder="automatic"
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      onDraftChange({
                        ...draft,
                        legAltitudePlans: setLegEndAltitudeTargetDistance(
                          draft.legAltitudePlans,
                          leg.fromId,
                          leg.toId,
                          value === '' ? null : Number(value),
                        ),
                      });
                    }}
                  />
                  <span>NM</span>
                </span>
              </label>
              <button
                type="button"
                className={`button${choosingEndOnMap ? ' button--active' : ''}`}
                disabled={plan?.endAltitudeFtMsl === undefined}
                onClick={() =>
                  onPlacementLegChange(
                    choosingEndOnMap
                      ? null
                      : {
                          fromWaypointId: leg.fromId,
                          toWaypointId: leg.toId,
                          target: 'end',
                        },
                  )
                }
              >
                {choosingEndOnMap ? 'Cancel map pick' : 'Choose on map'}
              </button>
            </div>
            {defaultWind === undefined ? null : (
              <LegWindFields
                fromName={waypointNames.get(leg.fromId) ?? leg.fromId}
                toName={waypointNames.get(leg.toId) ?? leg.toId}
                override={manualWindOverride}
                defaultWind={defaultWind}
                onChange={(wind) =>
                  onManualLegWindChange(leg.fromId, leg.toId, wind)
                }
              />
            )}
          </article>
        );
      })}
    </section>
  );
}
