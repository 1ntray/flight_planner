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
  onPlaceAltitudeTarget: () => void;
  onResetAltitudeTarget: () => void;
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
  onPlaceAltitudeTarget,
  onResetAltitudeTarget,
  onClose,
}: LegMapPopupProps) {
  const altitudeInputRef = useRef<HTMLInputElement>(null);
  const currentAltitudeFtMsl = plan?.altitudeFtMsl;
  const [altitudeDraft, setAltitudeDraft] = useState(() =>
    formatLegAltitudeDraft(currentAltitudeFtMsl),
  );
  useEffect(() => {
    setAltitudeDraft(formatLegAltitudeDraft(currentAltitudeFtMsl));
  }, [
    currentAltitudeFtMsl,
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
  const commitAltitudeDraft = () => {
    if (parsedAltitudeDraft.status === 'invalid') {
      setAltitudeDraft(formatLegAltitudeDraft(currentAltitudeFtMsl));
      return;
    }

    if (parsedAltitudeDraft.value !== (currentAltitudeFtMsl ?? null)) {
      onSetAltitude(parsedAltitudeDraft.value);
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
        Altitude target: {targetDistance === null ? 'automatic' : `${targetDistance.toFixed(1)} NM`}
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
          Place target <kbd>P</kbd>
        </button>
        <button
          type="button"
          className="button"
          disabled={targetDistance === null}
          onClick={onResetAltitudeTarget}
        >
          Automatic target
        </button>
        <button type="button" className="button" onClick={onClose}>
          Close
        </button>
      </div>
    </StableMapPopup>
  );
}
