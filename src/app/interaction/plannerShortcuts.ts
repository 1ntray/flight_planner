import type { MapSelection, MapTool } from '../map/routeDisplay';

export type PlannerShortcutAction =
  | 'cancel'
  | 'delete-selection'
  | 'insert-waypoint'
  | 'edit-waypoint-name'
  | 'edit-altitude'
  | 'place-altitude-target'
  | 'toggle-add-waypoint'
  | 'select-mode'
  | 'toggle-landing'
  | 'show-shortcuts';

export interface PlannerShortcutContext {
  key: string;
  code?: string;
  editing: boolean;
  repeat?: boolean;
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
  { keys: 'W', action: 'Toggle Add waypoint mode', availability: 'Always' },
  { keys: 'Delete', action: 'Remove the selected waypoint or shaping point', availability: 'Point selected' },
  { keys: 'I', action: 'Insert a real waypoint at the selected route location', availability: 'Leg selected' },
  { keys: 'N', action: 'Edit the selected waypoint name', availability: 'Waypoint selected' },
  { keys: 'A', action: 'Edit the selected leg altitude', availability: 'Leg selected' },
  { keys: 'P', action: 'Place the selected leg altitude target on the map', availability: 'Leg selected' },
  { keys: 'L', action: 'Mark or remove an intermediate landing', availability: 'Intermediate waypoint selected' },
  { keys: '?', action: 'Open this shortcut reference', availability: 'Always' },
  { keys: 'Esc', action: 'Cancel the active tool or clear selection', availability: 'Always' },
];

export function resolvePlannerShortcut(
  context: PlannerShortcutContext,
): PlannerShortcutAction | null {
  if (
    context.editing ||
    context.repeat === true ||
    context.altKey === true ||
    context.ctrlKey === true ||
    context.metaKey === true
  ) {
    return null;
  }

  const key = context.key.toLowerCase();

  if (context.key === 'Escape') {
    return 'cancel';
  }
  if (context.key === '?') {
    return 'show-shortcuts';
  }
  if (key === 'v') {
    return 'select-mode';
  }
  if (key === 'w') {
    return 'toggle-add-waypoint';
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
    return 'place-altitude-target';
  }
  if (key === 'l' && context.selection?.kind === 'waypoint') {
    return 'toggle-landing';
  }

  return null;
}
