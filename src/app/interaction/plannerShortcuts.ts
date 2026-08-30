import type { MapSelection, MapTool } from '../map/routeDisplay';

export type PlannerShortcutAction =
  | 'cancel'
  | 'delete-selection'
  | 'insert-waypoint'
  | 'edit-waypoint-name'
  | 'edit-altitude'
  | 'place-altitude-target'
  | 'place-end-altitude-target'
  | 'reset-altitude-target'
  | 'reset-end-altitude-target'
  | 'toggle-add-waypoint'
  | 'toggle-edit-route'
  | 'select-mode'
  | 'toggle-landing'
  | 'previous-selection'
  | 'next-selection'
  | 'start-naming-mode'
  | 'start-altitude-mode'
  | 'undo'
  | 'redo'
  | 'show-command-palette'
  | 'show-shortcuts';

export interface PlannerShortcutContext {
  key: string;
  code?: string;
  editing: boolean;
  repeat?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  selection: MapSelection | null;
  tool: MapTool;
}

export interface PlannerShortcutDefinition {
  keys: string;
  action: string;
  availability: string;
}

export const PLANNER_SHORTCUTS: readonly PlannerShortcutDefinition[] = [
  { keys: 'V', action: 'Select/edit mode', availability: 'Always' },
  { keys: 'E', action: 'Toggle Edit route mode', availability: 'Always' },
  { keys: 'W', action: 'Toggle Add waypoint mode', availability: 'Always' },
  { keys: '[ / ]', action: 'Previous / next selected waypoint or leg', availability: 'Route available' },
  { keys: 'Delete', action: 'Remove the selected waypoint or shaping point', availability: 'Point selected' },
  { keys: 'I', action: 'Insert a real waypoint at the selected route location', availability: 'Leg selected' },
  { keys: 'N', action: 'Edit the selected waypoint name', availability: 'Waypoint selected' },
  { keys: 'A', action: 'Edit the selected leg altitude', availability: 'Leg selected' },
  { keys: 'P', action: 'Place the selected leg altitude target on the map', availability: 'Leg selected' },
  { keys: 'Shift+P', action: 'Place the selected leg end-altitude target on the map', availability: 'Leg selected' },
  { keys: 'T', action: 'Return selected altitude target to automatic', availability: 'Leg selected' },
  { keys: 'Shift+T', action: 'Return selected end target to automatic', availability: 'Leg selected' },
  { keys: 'L', action: 'Mark or remove an intermediate landing', availability: 'Intermediate waypoint selected' },
  { keys: 'Shift+N', action: 'Start sequential waypoint naming', availability: 'Route available' },
  { keys: 'Shift+A', action: 'Start sequential altitude entry', availability: 'Leg available' },
  { keys: 'Ctrl/Cmd+Z', action: 'Undo route or planning edit', availability: 'When available' },
  { keys: 'Ctrl/Cmd+Shift+Z', action: 'Redo route or planning edit', availability: 'When available' },
  { keys: 'Ctrl/Cmd+K', action: 'Open the command palette', availability: 'Always' },
  { keys: '?', action: 'Open this shortcut reference', availability: 'Always' },
  { keys: 'Esc', action: 'Cancel the active tool or clear selection', availability: 'Always' },
];

export function resolvePlannerShortcut(
  context: PlannerShortcutContext,
): PlannerShortcutAction | null {
  if (
    context.editing ||
    context.repeat === true ||
    context.altKey === true
  ) {
    return null;
  }

  const key = context.key.toLowerCase();

  if (context.ctrlKey === true || context.metaKey === true) {
    if (key === 'z') {
      return context.shiftKey === true ? 'redo' : 'undo';
    }
    if (key === 'k') {
      return 'show-command-palette';
    }
    return null;
  }

  if (context.key === 'Escape') {
    return 'cancel';
  }
  if (context.key === '?') {
    return 'show-shortcuts';
  }
  if (key === 'v') {
    return 'select-mode';
  }
  if (key === 'e') {
    return 'toggle-edit-route';
  }
  if (key === 'w') {
    return 'toggle-add-waypoint';
  }
  if (key === 'n' && context.shiftKey === true) {
    return 'start-naming-mode';
  }
  if (key === 'a' && context.shiftKey === true) {
    return 'start-altitude-mode';
  }
  if (
    context.key === 'Delete' &&
    (context.selection?.kind === 'waypoint' ||
      context.selection?.kind === 'shaping-point')
  ) {
    return 'delete-selection';
  }
  if (
    key === 'i' && context.selection?.kind === 'leg'
  ) {
    return 'insert-waypoint';
  }
  if (key === 'n' && context.selection?.kind === 'waypoint') {
    return 'edit-waypoint-name';
  }
  if (key === 'a' && context.selection?.kind === 'leg') {
    return 'edit-altitude';
  }
  if (key === 'p' && context.selection?.kind === 'leg') {
    return context.shiftKey === true
      ? 'place-end-altitude-target'
      : 'place-altitude-target';
  }
  if (key === 't' && context.selection?.kind === 'leg') {
    return context.shiftKey === true
      ? 'reset-end-altitude-target'
      : 'reset-altitude-target';
  }
  if (key === 'l' && context.selection?.kind === 'waypoint') {
    return 'toggle-landing';
  }
  if (context.key === '[') {
    return 'previous-selection';
  }
  if (context.key === ']') {
    return 'next-selection';
  }
  return null;
}
