import { useEffect, useRef, useState } from 'react';

import type { LegAltitudePlan, Waypoint } from '../../domain';
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
  defaultAltitudeFtMsl: string;
  altitudeFocusRequest: number;
  onInsertWaypoint: () => void;
  onSetAltitude: (altitudeFtMsl: number | null) => void;
  onSetEndAltitude: (altitudeFtMsl: number | null) => void;
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
  defaultAltitudeFtMsl,
  altitudeFocusRequest,
  onInsertWaypoint,
  onSetAltitude,
  onSetEndAltitude,
  onPlaceAltitudeTarget,
  onPlaceEndAltitudeTarget,
  onResetAltitudeTarget,
  onResetEndAltitudeTarget,
  onClose,
}: LegMapPopupProps) {
  const altitudeInputRef = useRef<HTMLInputElement>(null);
  const currentAltitudeFtMsl = plan?.altitudeFtMsl;
  const currentEndAltitudeFtMsl = plan?.endAltitudeFtMsl;
  const [altitudeDraft, setAltitudeDraft] = useState(() =>
    formatLegAltitudeDraft(currentAltitudeFtMsl),
  );
  const [endAltitudeDraft, setEndAltitudeDraft] = useState(() =>
    formatLegAltitudeDraft(currentEndAltitudeFtMsl),
  );
  useEffect(() => {
    setAltitudeDraft(formatLegAltitudeDraft(currentAltitudeFtMsl));
  }, [
    currentAltitudeFtMsl,
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
    if (altitudeFocusRequest > 0) {
      altitudeInputRef.current?.focus();
      altitudeInputRef.current?.select();
    }
  }, [altitudeFocusRequest]);

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

  return (
    <StableMapPopup
      position={selection.candidate.position}
      closeButton={false}
      closeOnClick={false}
      autoClose={false}
      className="leg-map-popup"
    >
      <div className="leg-map-popup__heading">
        <p className="eyebrow">Selected leg</p>
        <strong>{fromWaypoint.name} → {toWaypoint.name}</strong>
        <span>Selected at {selection.distanceFromStartNm.toFixed(1)} NM</span>
      </div>
      <label>
        <span>Planned altitude</span>
        <span className="navigation-inputs__control">
          <input
            ref={altitudeInputRef}
            type="number"
            min="0"
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
      <div className="map-popup-actions">
        <button
          type="button"
          className="button"
          aria-keyshortcuts="I"
          onClick={onInsertWaypoint}
        >
          Add waypoint <kbd>I</kbd>
        </button>
        <button
          type="button"
          className="button"
          aria-keyshortcuts="P"
          onClick={onPlaceAltitudeTarget}
        >
          Place planned target <kbd>P</kbd>
        </button>
        <button
          type="button"
          className="button"
          disabled={targetDistance === null}
          onClick={onResetAltitudeTarget}
        >
          Automatic target
        </button>
        <button
          type="button"
          className="button"
          disabled={currentEndAltitudeFtMsl === undefined}
          onClick={onPlaceEndAltitudeTarget}
        >
          Place end target
        </button>
        <button
          type="button"
          className="button"
          disabled={endTargetDistance === null}
          onClick={onResetEndAltitudeTarget}
        >
          Automatic end target
        </button>
        <button type="button" className="button" onClick={onClose}>
          Close
        </button>
      </div>
    </StableMapPopup>
  );
}
