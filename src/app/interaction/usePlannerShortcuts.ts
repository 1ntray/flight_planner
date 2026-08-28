import { useEffect } from 'react';

import type { MapSelection, MapTool } from '../map/routeDisplay';
import { resolvePlannerShortcut } from './plannerShortcuts';
import type { PlannerShortcutAction } from './plannerShortcuts';

export interface PlannerShortcutHandlers {
  selection: MapSelection | null;
  tool: MapTool;
  onAction: (action: PlannerShortcutAction) => void;
}

function isEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  );
}

export function usePlannerShortcuts({
  selection,
  tool,
  onAction,
}: PlannerShortcutHandlers): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const action = resolvePlannerShortcut({
        key: event.key,
        code: event.code,
        editing: isEditingTarget(event.target),
        repeat: event.repeat,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        selection,
        tool,
      });

      if (action === null) {
        return;
      }

      event.preventDefault();
      onAction(action);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onAction, selection, tool]);
}
