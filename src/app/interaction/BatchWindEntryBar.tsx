import { useEffect, useRef, useState } from 'react';

import type { Wind } from '../../domain';
import type { LegWindDefault } from '../navigation/legWindOverrideState';

export interface BatchWindEntryBarProps {
  itemLabel: string;
  initialWind: Wind | null;
  defaultWind: LegWindDefault;
  onCommit: (wind: Wind | null) => string | null;
  onMove: (direction: -1 | 1) => void;
  onClose: () => void;
}

export function BatchWindEntryBar({
  itemLabel,
  initialWind,
  defaultWind,
  onCommit,
  onMove,
  onClose,
}: BatchWindEntryBarProps) {
  const [direction, setDirection] = useState(
    initialWind === null ? '' : String(initialWind.directionFromTrueDeg),
  );
  const [speed, setSpeed] = useState(
    initialWind === null ? '' : String(initialWind.speedKt),
  );
  const [error, setError] = useState<string | null>(null);
  const directionInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDirection(initialWind === null ? '' : String(initialWind.directionFromTrueDeg));
    setSpeed(initialWind === null ? '' : String(initialWind.speedKt));
    setError(null);
    requestAnimationFrame(() => {
      directionInputRef.current?.focus();
      directionInputRef.current?.select();
    });
  }, [initialWind, itemLabel]);

  const commitAndMove = (move: -1 | 1) => {
    const directionText = direction.trim();
    const speedText = speed.trim();
    let message: string | null;
    if (directionText === '' && speedText === '') {
      message = onCommit(null);
    } else {
      const directionFromTrueDeg = Number(directionText);
      const speedKt = Number(speedText);
      message = directionText === '' ||
        speedText === '' ||
        !Number.isFinite(directionFromTrueDeg) ||
        !Number.isFinite(speedKt) ||
        speedKt < 0
        ? 'Enter both a direction and a non-negative speed, or leave both blank for the default.'
        : onCommit({ directionFromTrueDeg, speedKt });
    }
    if (message !== null) {
      setError(message);
      return;
    }
    onMove(move);
  };

  return (
    <form
      className="batch-entry-bar batch-wind-entry-bar"
      onSubmit={(event) => {
        event.preventDefault();
        commitAndMove(1);
      }}
    >
      <div>
        <p className="eyebrow">Sequential wind entry</p>
        <strong>{itemLabel}</strong>
      </div>
      <label>
        <span className="sr-only">Wind from</span>
        <input
          ref={directionInputRef}
          type="number"
          step="1"
          value={direction}
          placeholder={Math.round(defaultWind.wind.directionFromTrueDeg).toString().padStart(3, '0')}
          aria-label="Manual wind direction"
          aria-invalid={error !== null}
          onChange={(event) => {
            setDirection(event.currentTarget.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              onClose();
            } else if (event.key === 'Enter' && event.shiftKey) {
              event.preventDefault();
              commitAndMove(-1);
            }
          }}
        />
        <span>°T</span>
      </label>
      <label>
        <span className="sr-only">Wind speed</span>
        <input
          type="number"
          min="0"
          step="1"
          value={speed}
          placeholder={String(Math.round(defaultWind.wind.speedKt))}
          aria-label="Manual wind speed"
          aria-invalid={error !== null}
          onChange={(event) => {
            setSpeed(event.currentTarget.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              onClose();
            } else if (event.key === 'Enter' && event.shiftKey) {
              event.preventDefault();
              commitAndMove(-1);
            }
          }}
        />
        <span>kt</span>
      </label>
      <button type="button" className="button" onClick={onClose}>
        Done <kbd>Esc</kbd>
      </button>
      <p className={error === null ? undefined : 'batch-entry-bar__error'}>
        {error ?? `Blank uses ${defaultWind.source} wind · Enter: save and next · Shift+Enter: previous`}
      </p>
    </form>
  );
}
