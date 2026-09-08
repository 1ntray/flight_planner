import { useEffect, useRef, useState } from 'react';

import { MAX_SUPPORTED_PLANNING_ALTITUDE_FT } from '../../domain';
import type {
  LegAltitudePlan,
  ManualLegWindOverride,
  Waypoint,
  Wind,
} from '../../domain';
import { LegWindFields } from '../navigation/LegWindFields';
import type { LegWindDefault } from '../navigation/legWindOverrideState';
import {
  formatLegAltitudeDraft,
  parseLegAltitudeDraft,
} from './legAltitudeDraft';
import type { SelectedRouteLeg } from './routeDisplay';
import { StableMapPopup } from './StableMapPopup';

export interface LegMapPopupProps {
  selection: SelectedRouteLeg;
  fromWaypoint: Waypoint;
  toWaypoint: Waypoint;
  plan: LegAltitudePlan | undefined;
  manualWindOverride: ManualLegWindOverride | undefined;
  defaultWind: LegWindDefault;
  defaultAltitudeFtMsl: string;
  isArrivalLeg: boolean;
  altitudeFocusRequest: number;
  msaFocusRequest: number;
  windFocusRequest: number;
  onInsertWaypoint: () => void;
  onSetAltitude: (altitudeFtMsl: number | null) => void;
  onSetMinimumSafeAltitude: (minimumSafeAltitudeFtMsl: number | null) => void;
  onSetEndAltitude: (altitudeFtMsl: number | null) => void;
  onSetManualWind: (wind: Wind | null) => void;
  onPlaceAltitudeTarget: () => void;
  onPlaceEndAltitudeTarget: () => void;
  onResetAltitudeTarget: () => void;
  onResetEndAltitudeTarget: () => void;
  onClose: () => void;
}

export function LegMapPopup({
  selection,
  fromWaypoint,
  toWaypoint,
  plan,
  manualWindOverride,
  defaultWind,
  defaultAltitudeFtMsl,
  isArrivalLeg,
  altitudeFocusRequest,
  msaFocusRequest,
  windFocusRequest,
  onInsertWaypoint,
  onSetAltitude,
  onSetMinimumSafeAltitude,
  onSetEndAltitude,
  onSetManualWind,
  onPlaceAltitudeTarget,
  onPlaceEndAltitudeTarget,
  onResetAltitudeTarget,
  onResetEndAltitudeTarget,
  onClose,
}: LegMapPopupProps) {
  const altitudeInputRef = useRef<HTMLInputElement>(null);
  const msaInputRef = useRef<HTMLInputElement>(null);
  const handledAltitudeFocusRequestRef = useRef(altitudeFocusRequest);
  const handledMsaFocusRequestRef = useRef(msaFocusRequest);
  const currentAltitudeFtMsl = plan?.altitudeFtMsl;
  const currentEndAltitudeFtMsl = plan?.endAltitudeFtMsl;
  const [altitudeDraft, setAltitudeDraft] = useState(() =>
    formatLegAltitudeDraft(currentAltitudeFtMsl),
  );
  const [endAltitudeDraft, setEndAltitudeDraft] = useState(() =>
    formatLegAltitudeDraft(currentEndAltitudeFtMsl),
  );
  const [msaDraft, setMsaDraft] = useState(
    plan?.minimumSafeAltitudeFtMsl === undefined
      ? ''
      : String(plan.minimumSafeAltitudeFtMsl),
  );
  useEffect(() => {
    setAltitudeDraft(formatLegAltitudeDraft(currentAltitudeFtMsl));
  }, [
    currentAltitudeFtMsl,
    selection.candidate.fromWaypointId,
    selection.candidate.toWaypointId,
  ]);
  useEffect(() => {
    setMsaDraft(
      plan?.minimumSafeAltitudeFtMsl === undefined
        ? ''
        : String(plan.minimumSafeAltitudeFtMsl),
    );
  }, [
    plan?.minimumSafeAltitudeFtMsl,
    selection.candidate.fromWaypointId,
    selection.candidate.toWaypointId,
  ]);
  useEffect(() => {
    setEndAltitudeDraft(formatLegAltitudeDraft(currentEndAltitudeFtMsl));
  }, [
    currentEndAltitudeFtMsl,
    selection.candidate.fromWaypointId,
    selection.candidate.toWaypointId,
  ]);

  useEffect(() => {
    const altitudeInput = altitudeInputRef.current;

    if (altitudeFocusRequest > handledAltitudeFocusRequestRef.current) {
      handledAltitudeFocusRequestRef.current = altitudeFocusRequest;
      altitudeInput?.focus();
      altitudeInput?.select();
    } else if (
      altitudeInput !== null &&
      document.activeElement === altitudeInput
    ) {
      // Some browsers restore focus to a remounted popup input. Only the
      // explicit altitude shortcut should focus this field.
      altitudeInput.blur();
    }
  }, [altitudeFocusRequest]);

  useEffect(() => {
    if (msaFocusRequest <= handledMsaFocusRequestRef.current) return;
    handledMsaFocusRequestRef.current = msaFocusRequest;
    msaInputRef.current?.focus();
    msaInputRef.current?.select();
  }, [msaFocusRequest]);

  const targetDistance =
    plan?.targetPlacement?.mode === 'distance-along-leg'
      ? plan.targetPlacement.distanceFromStartNm
      : null;
  const parsedAltitudeDraft = parseLegAltitudeDraft(altitudeDraft);
  const endTargetDistance =
    plan?.endTargetPlacement?.mode === 'distance-along-leg'
      ? plan.endTargetPlacement.distanceFromStartNm
      : null;
  const parsedEndAltitudeDraft = parseLegAltitudeDraft(endAltitudeDraft);
  const commitAltitudeDraft = () => {
    if (parsedAltitudeDraft.status === 'invalid') {
      setAltitudeDraft(formatLegAltitudeDraft(currentAltitudeFtMsl));
      return;
    }

    if (parsedAltitudeDraft.value !== (currentAltitudeFtMsl ?? null)) {
      onSetAltitude(parsedAltitudeDraft.value);
    }
  };
  const commitEndAltitudeDraft = () => {
    if (parsedEndAltitudeDraft.status === 'invalid') {
      setEndAltitudeDraft(formatLegAltitudeDraft(currentEndAltitudeFtMsl));
      return;
    }

    if (parsedEndAltitudeDraft.value !== (currentEndAltitudeFtMsl ?? null)) {
      onSetEndAltitude(parsedEndAltitudeDraft.value);
    }
  };
  const commitMsaDraft = () => {
    if (msaDraft.trim() === '') {
      onSetMinimumSafeAltitude(null);
      return;
    }
    const value = Number(msaDraft);
    if (!Number.isFinite(value) || value < 0) {
      setMsaDraft(
        plan?.minimumSafeAltitudeFtMsl === undefined
          ? ''
          : String(plan.minimumSafeAltitudeFtMsl),
      );
      return;
    }
    onSetMinimumSafeAltitude(value);
  };

  return (
    <StableMapPopup
      position={selection.candidate.position}
      closeOnClick={false}
      autoClose={false}
      className="leg-map-popup"
      eventHandlers={{ remove: onClose }}
    >
      <div className="leg-map-popup__heading">
        <p className="eyebrow">Selected leg</p>
        <strong>{fromWaypoint.name} → {toWaypoint.name}</strong>
      </div>
      {isArrivalLeg ? (
        <p className="leg-map-popup__arrival-note">
          Arrival leg: set the planned altitude normally. The final descent to
          the rounded pattern altitude is calculated automatically.
        </p>
      ) : null}
      <label>
        <span>MSA</span>
        <span className="navigation-inputs__control">
          <input
            ref={msaInputRef}
            type="number"
            min="0"
            step="100"
            value={msaDraft}
            placeholder="not entered"
            onChange={(event) => setMsaDraft(event.currentTarget.value)}
            onBlur={commitMsaDraft}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
          />
          <span>ft MSL</span>
        </span>
      </label>
      <label>
        <span>Planned altitude</span>
        <span className="navigation-inputs__control">
          <input
            ref={altitudeInputRef}
            type="number"
            min="0"
            max={MAX_SUPPORTED_PLANNING_ALTITUDE_FT}
            step="100"
            value={altitudeDraft}
            placeholder={defaultAltitudeFtMsl || 'global'}
            aria-invalid={parsedAltitudeDraft.status === 'invalid'}
            onChange={(event) => setAltitudeDraft(event.currentTarget.value)}
            onBlur={commitAltitudeDraft}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
          />
          <span>ft MSL</span>
        </span>
      </label>
      <p className="leg-map-popup__target">
        Planned-altitude target: {targetDistance === null ? 'automatic' : `${targetDistance.toFixed(1)} NM`}
      </p>
      <label>
        <span>End altitude (optional)</span>
        <span className="navigation-inputs__control">
          <input
            type="number"
            min="0"
            max={MAX_SUPPORTED_PLANNING_ALTITUDE_FT}
            step="100"
            value={endAltitudeDraft}
            placeholder="same as planned"
            aria-invalid={parsedEndAltitudeDraft.status === 'invalid'}
            onChange={(event) => setEndAltitudeDraft(event.currentTarget.value)}
            onBlur={commitEndAltitudeDraft}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
          />
          <span>ft MSL</span>
        </span>
      </label>
      <p className="leg-map-popup__target">
        End-altitude target: {endTargetDistance === null ? 'automatic' : `${endTargetDistance.toFixed(1)} NM`}
      </p>
      <LegWindFields
        fromName={fromWaypoint.name}
        toName={toWaypoint.name}
        override={manualWindOverride}
        defaultWind={defaultWind}
        focusRequest={windFocusRequest}
        onChange={onSetManualWind}
      />
      <div className="leg-map-popup__target-actions">
        <button
          type="button"
          className="button"
          disabled={targetDistance === null}
          aria-keyshortcuts="T"
          aria-label="Set planned-altitude target automatically"
          title="Set planned-altitude target automatically"
          onClick={onResetAltitudeTarget}
        >
          Auto target <kbd>T</kbd>
        </button>
        <button
          type="button"
          className="button"
          aria-keyshortcuts="P"
          aria-label="Place planned-altitude target"
          title="Place planned-altitude target"
          onClick={onPlaceAltitudeTarget}
        >
          Place target <kbd>P</kbd>
        </button>
        <button
          type="button"
          className="button"
          disabled={endTargetDistance === null}
          aria-keyshortcuts="Shift+T"
          aria-label="Set end-altitude target automatically"
          title="Set end-altitude target automatically"
          onClick={onResetEndAltitudeTarget}
        >
          Auto end <kbd>⇧T</kbd>
        </button>
        <button
          type="button"
          className="button"
          disabled={currentEndAltitudeFtMsl === undefined}
          aria-keyshortcuts="Shift+P"
          aria-label="Place end-altitude target"
          title="Place end-altitude target"
          onClick={onPlaceEndAltitudeTarget}
        >
          Place end <kbd>⇧P</kbd>
        </button>
      </div>
      <div className="leg-map-popup__insert-action">
        <button
          type="button"
          className="button"
          aria-keyshortcuts="I"
          onClick={onInsertWaypoint}
        >
          Add waypoint <kbd>I</kbd>
        </button>
      </div>
    </StableMapPopup>
  );
}
