import {
  useEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
} from 'react';

export interface CommitOnBlurInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'defaultValue' | 'onBlur' | 'onChange' | 'onKeyDown' | 'value'
> {
  value: string | number;
  onCommit: (value: string) => void;
}

/**
 * Keeps incomplete keyboard input local. Planning state changes only when the
 * user presses Enter or leaves the field, so expensive derived calculations
 * do not run once per keystroke. Escape restores the last committed value.
 */
export function CommitOnBlurInput({
  value,
  onCommit,
  className,
  ...inputProps
}: CommitOnBlurInputProps) {
  const committedValue = String(value);
  const [draft, setDraft] = useState(committedValue);
  const draftRef = useRef(committedValue);
  const focusedRef = useRef(false);
  const skipNextBlurCommitRef = useRef(false);

  useEffect(() => {
    if (focusedRef.current) return;
    draftRef.current = committedValue;
    setDraft(committedValue);
  }, [committedValue]);

  const commit = () => {
    if (draftRef.current !== committedValue) onCommit(draftRef.current);
  };
  const pending = draft !== committedValue;

  return (
    <input
      {...inputProps}
      value={draft}
      className={`${className ?? ''}${pending ? ' commit-on-blur-input--pending' : ''}`.trim() || undefined}
      data-pending={pending ? 'true' : undefined}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onChange={(event) => {
        draftRef.current = event.currentTarget.value;
        setDraft(event.currentTarget.value);
      }}
      onBlur={() => {
        focusedRef.current = false;
        if (skipNextBlurCommitRef.current) {
          skipNextBlurCommitRef.current = false;
          return;
        }
        commit();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
          return;
        }
        if (event.key !== 'Escape') return;
        event.preventDefault();
        skipNextBlurCommitRef.current = true;
        draftRef.current = committedValue;
        setDraft(committedValue);
        event.currentTarget.blur();
      }}
    />
  );
}
