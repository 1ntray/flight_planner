import { useEffect, useRef, useState } from 'react';

import type { ManualLegWindOverride, Wind } from '../../domain';
import type { LegWindDefault } from './legWindOverrideState';

export interface LegWindFieldsProps {
  fromName: string;
  toName: string;
  override: ManualLegWindOverride | undefined;
  defaultWind: LegWindDefault;
  focusRequest?: number;
  onChange: (wind: Wind | null) => void;
}

function formatDirection(value: number): string {
  return Math.round(value).toString().padStart(3, '0');
}

export function LegWindFields({
  fromName,
  toName,
  override,
  defaultWind,
  focusRequest = 0,
  onChange,
}: LegWindFieldsProps) {
  const [directionDraft, setDirectionDraft] = useState(
    override === undefined ? '' : String(override.wind.directionFromTrueDeg),
  );
  const [speedDraft, setSpeedDraft] = useState(
    override === undefined ? '' : String(override.wind.speedKt),
  );
  const [error, setError] = useState<string | null>(null);
  const directionInputRef = useRef<HTMLInputElement>(null);
  const handledFocusRequestRef = useRef(focusRequest);

  const resetDraft = () => {
    setDirectionDraft(
      override === undefined ? '' : String(override.wind.directionFromTrueDeg),
    );
    setSpeedDraft(override === undefined ? '' : String(override.wind.speedKt));
    setError(null);
  };

  useEffect(() => {
    resetDraft();
    // The override identity and values are the external committed state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    override?.fromWaypointId,
    override?.toWaypointId,
    override?.wind.directionFromTrueDeg,
    override?.wind.speedKt,
  ]);

  useEffect(() => {
    if (focusRequest <= handledFocusRequestRef.current) return;
    handledFocusRequestRef.current = focusRequest;
    directionInputRef.current?.focus();
    directionInputRef.current?.select();
  }, [focusRequest]);

  const commitDraft = () => {
    const directionText = directionDraft.trim();
    const speedText = speedDraft.trim();
    if (directionText === '' && speedText === '') {
      if (override !== undefined) onChange(null);
      setError(null);
      return;
    }
    const directionFromTrueDeg = Number(directionText);
    const speedKt = Number(speedText);
    if (
      directionText === '' ||
      speedText === '' ||
      !Number.isFinite(directionFromTrueDeg) ||
      !Number.isFinite(speedKt) ||
      speedKt < 0
    ) {
      setError('Enter both a direction and a non-negative speed.');
      return;
    }
    onChange({ directionFromTrueDeg, speedKt });
    setError(null);
  };

  return (
    <div
      className="leg-wind-fields"
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        commitDraft();
      }}
    >
      <div className="leg-wind-fields__inputs">
        <label>
          <span>Wind from</span>
          <span className="navigation-inputs__control">
            <input
              ref={directionInputRef}
              type="number"
              step="1"
              value={directionDraft}
              placeholder={formatDirection(defaultWind.wind.directionFromTrueDeg)}
              aria-label={`${fromName} to ${toName} manual wind direction`}
              aria-invalid={error !== null}
              onChange={(event) => {
                setDirectionDraft(event.currentTarget.value);
                setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitDraft();
                }
              }}
            />
            <span>°T</span>
          </span>
        </label>
        <label>
          <span>Wind speed</span>
          <span className="navigation-inputs__control">
            <input
              type="number"
              min="0"
              step="1"
              value={speedDraft}
              placeholder={String(Math.round(defaultWind.wind.speedKt))}
              aria-label={`${fromName} to ${toName} manual wind speed`}
              aria-invalid={error !== null}
              onChange={(event) => {
                setSpeedDraft(event.currentTarget.value);
                setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitDraft();
                }
              }}
            />
            <span>kt</span>
          </span>
        </label>
      </div>
      <p className="leg-wind-fields__default">
        Default: {formatDirection(defaultWind.wind.directionFromTrueDeg)}°T /{' '}
        {Math.round(defaultWind.wind.speedKt)} kt ·{' '}
        {defaultWind.source === 'forecast' ? 'forecast wind' : 'manual wind'}
      </p>
      {error === null ? null : (
        <p className="leg-wind-fields__error" role="alert">{error}</p>
      )}
      {override === undefined ? null : (
        <button
          type="button"
          className="button leg-wind-fields__reset"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onChange(null)}
        >
          Use default wind
        </button>
      )}
    </div>
  );
}
