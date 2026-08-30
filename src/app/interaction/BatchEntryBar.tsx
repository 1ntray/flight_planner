import { useEffect, useRef, useState } from 'react';

export interface BatchEntryBarProps {
  title: string;
  itemLabel: string;
  initialValue: string;
  placeholder: string;
  inputMode: 'text' | 'numeric';
  unit?: string;
  onCommit: (value: string) => string | null;
  onMove: (direction: -1 | 1) => void;
  onClose: () => void;
}

/** Keyboard-first sequential editor shown above the map, not persisted itself. */
export function BatchEntryBar({
  title,
  itemLabel,
  initialValue,
  placeholder,
  inputMode,
  unit,
  onCommit,
  onMove,
  onClose,
}: BatchEntryBarProps) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const shouldSelectInputRef = useRef(true);

  useEffect(() => {
    setValue(initialValue);
    setError(null);
    shouldSelectInputRef.current = true;
  }, [initialValue, itemLabel, title]);

  useEffect(() => {
    if (!shouldSelectInputRef.current || value !== initialValue) {
      return;
    }

    // Wait until the controlled value has been committed. Selecting before
    // that commit leaves the caret at the end when moving to the next item.
    inputRef.current?.focus();
    inputRef.current?.select();
    shouldSelectInputRef.current = false;
  }, [initialValue, value]);

  const commitAndMove = (direction: -1 | 1) => {
    const message = onCommit(value);
    if (message !== null) {
      setError(message);
      return;
    }
    onMove(direction);
  };

  return (
    <form
      className="batch-entry-bar"
      onSubmit={(event) => {
        event.preventDefault();
        commitAndMove(1);
      }}
    >
      <div>
        <p className="eyebrow">{title}</p>
        <strong>{itemLabel}</strong>
      </div>
      <label>
        <span className="sr-only">{title}</span>
        <input
          ref={inputRef}
          type={inputMode === 'numeric' ? 'number' : 'text'}
          min={inputMode === 'numeric' ? '0' : undefined}
          step={inputMode === 'numeric' ? '100' : undefined}
          value={value}
          placeholder={placeholder}
          aria-invalid={error !== null}
          onChange={(event) => {
            setValue(event.currentTarget.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              onClose();
            } else if (event.key === 'Enter' && event.shiftKey) {
              event.preventDefault();
              commitAndMove(-1);
            } else if (event.key === 'Enter') {
              event.preventDefault();
              commitAndMove(1);
            }
          }}
        />
        {unit === undefined ? null : <span>{unit}</span>}
      </label>
      <p className={error === null ? undefined : 'batch-entry-bar__error'}>
        {error ?? 'Enter: save and next · Shift+Enter: save and previous · Esc: finish'}
      </p>
      <button type="button" className="button" onClick={onClose}>
        Done <kbd>Esc</kbd>
      </button>
    </form>
  );
}
