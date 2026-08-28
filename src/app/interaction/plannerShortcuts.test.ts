import { describe, expect, it } from 'vitest';

import type { MapSelection, MapTool } from '../map/routeDisplay';
import { resolvePlannerShortcut } from './plannerShortcuts';

const selectTool: MapTool = { kind: 'select' };
const legSelection: MapSelection = {
  kind: 'leg',
  distanceFromStartNm: 4,
  candidate: {
    fromWaypointId: 'A',
    toWaypointId: 'B',
    segmentIndex: 0,
    segmentStart: { kind: 'waypoint', id: 'A' },
    segmentEnd: { kind: 'waypoint', id: 'B' },
    position: { latitude: 69, longitude: 18 },
  },
};

describe('planner keyboard shortcuts', () => {
  it('resolves leg and point commands only for compatible selections', () => {
    expect(resolvePlannerShortcut({ key: '+', editing: false, selection: legSelection, tool: selectTool }))
      .toBe('insert-waypoint');
    expect(resolvePlannerShortcut({ key: 'a', editing: false, selection: legSelection, tool: selectTool }))
      .toBe('edit-altitude');
    expect(resolvePlannerShortcut({ key: 'Delete', editing: false, selection: legSelection, tool: selectTool }))
      .toBeNull();
    expect(resolvePlannerShortcut({
      key: 'Delete',
      editing: false,
      selection: { kind: 'waypoint', id: 'A' },
      tool: selectTool,
    })).toBe('delete-selection');
  });

  it('ignores shortcuts while editing or using browser/system modifiers', () => {
    expect(resolvePlannerShortcut({ key: 'w', editing: true, selection: null, tool: selectTool }))
      .toBeNull();
    expect(resolvePlannerShortcut({ key: 'w', editing: false, ctrlKey: true, selection: null, tool: selectTool }))
      .toBeNull();
    expect(resolvePlannerShortcut({ key: 'Delete', editing: false, repeat: true, selection: { kind: 'waypoint', id: 'A' }, tool: selectTool }))
      .toBeNull();
  });

  it('supports global mode, help, and cancel commands', () => {
    expect(resolvePlannerShortcut({ key: 'w', editing: false, selection: null, tool: selectTool }))
      .toBe('toggle-add-waypoint');
    expect(resolvePlannerShortcut({ key: '?', editing: false, selection: null, tool: selectTool }))
      .toBe('show-shortcuts');
    expect(resolvePlannerShortcut({ key: 'Escape', editing: false, selection: null, tool: selectTool }))
      .toBe('cancel');
  });
});
