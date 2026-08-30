import { useCallback, useEffect, useRef, useState } from 'react';

interface StoredSnapshot<T> {
  readonly value: T;
  readonly serialized: string;
}

export interface PlanningHistory<T> {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  undo(): void;
  redo(): void;
}

function snapshot<T>(value: T): StoredSnapshot<T> {
  return { value, serialized: JSON.stringify(value) };
}

/**
 * Keeps a bounded, UI-only history of immutable planning inputs. Calculation
 * results, map selection, and fetched forecast data deliberately stay out.
 */
export function usePlanningHistory<T>(
  value: T,
  onRestore: (snapshot: T) => void,
  maximumEntries = 100,
): PlanningHistory<T> {
  const current = snapshot(value);
  const currentRef = useRef<StoredSnapshot<T>>(current);
  const historyRef = useRef<{
    past: StoredSnapshot<T>[];
    future: StoredSnapshot<T>[];
  }>({ past: [], future: [] });
  const onRestoreRef = useRef(onRestore);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    onRestoreRef.current = onRestore;
  }, [onRestore]);

  useEffect(() => {
    if (current.serialized === currentRef.current.serialized) {
      return;
    }

    const history = historyRef.current;
    history.past = [
      ...history.past.slice(-(maximumEntries - 1)),
      currentRef.current,
    ];
    history.future = [];
    currentRef.current = current;
    setRevision((previous) => previous + 1);
  }, [current, maximumEntries]);

  const undo = useCallback(() => {
    const history = historyRef.current;
    const target = history.past.pop();
    if (target === undefined) {
      return;
    }

    history.future.unshift(currentRef.current);
    currentRef.current = target;
    setRevision((previous) => previous + 1);
    onRestoreRef.current(target.value);
  }, []);
  const redo = useCallback(() => {
    const history = historyRef.current;
    const target = history.future.shift();
    if (target === undefined) {
      return;
    }

    history.past.push(currentRef.current);
    currentRef.current = target;
    setRevision((previous) => previous + 1);
    onRestoreRef.current(target.value);
  }, []);

  // revision makes availability update after mutations stored in refs.
  void revision;
  return {
    canUndo: historyRef.current.past.length > 0,
    canRedo: historyRef.current.future.length > 0,
    undo,
    redo,
  };
}
