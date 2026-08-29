import { useMemo } from 'react';

import { calculateRoute, deriveFlightPlanSectors } from '../../calculations';
import type { FlightPlan } from '../../domain';
import {
  setLegAltitudeOverride,
  setLegAltitudeTargetDistance,
  setLegEndAltitudeOverride,
  setLegEndAltitudeTargetDistance,
} from './altitudePlanState';
import type { AltitudePlacementLeg } from './altitudePlanState';
import type { PerformanceInputDraft } from './performanceInput';

export type { AltitudePlacementLeg } from './altitudePlanState';

export interface LegAltitudeControlsProps {
  flightPlan: FlightPlan;
  draft: PerformanceInputDraft;
  placementLeg: AltitudePlacementLeg | null;
  onDraftChange: (draft: PerformanceInputDraft) => void;
  onPlacementLegChange: (leg: AltitudePlacementLeg | null) => void;
}

function legKey(fromId: string, toId: string): string {
  return `${fromId}\0${toId}`;
}

export function LegAltitudeControls({
  flightPlan,
  draft,
  placementLeg,
  onDraftChange,
  onPlacementLegChange,
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
    <section className="leg-altitude-controls" aria-label="Leg altitude plan">
      <div>
        <p className="eyebrow">Altitude schedule</p>
        <p className="plan-file-controls__description">
          Blank altitude uses the global value. Target distance is measured
          along shaped WGS84 geometry from FROM.
        </p>
      </div>

      {legs.map((leg) => {
        const plan = plans.get(legKey(leg.fromId, leg.toId));
        const isArrivalLeg = arrivalLegKeys.has(legKey(leg.fromId, leg.toId));
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
            <div className="leg-altitude-controls__row">
            <label>
              <span>Planned altitude</span>
              <span className="navigation-inputs__control">
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={plan?.altitudeFtMsl ?? ''}
                  placeholder={draft.defaultAltitudeFtMsl || 'global'}
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
          </article>
        );
      })}
    </section>
  );
}
