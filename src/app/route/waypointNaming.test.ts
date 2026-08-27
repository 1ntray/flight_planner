import { describe, expect, it } from 'vitest';

import type { Waypoint } from '../../domain';
import { formatWaypointName, getNextWaypointName } from './waypointNaming';

const position = { latitude: 69.35, longitude: 18.75 };

describe('formatWaypointName', () => {
  it.each([
    { sequence: 1, expected: 'WP01' },
    { sequence: 9, expected: 'WP09' },
    { sequence: 10, expected: 'WP10' },
    { sequence: 100, expected: 'WP100' },
  ])('formats sequence $sequence as $expected', ({ sequence, expected }) => {
    expect(formatWaypointName(sequence)).toBe(expected);
  });
});

describe('getNextWaypointName', () => {
  it('starts an empty route at WP01', () => {
    expect(getNextWaypointName([])).toBe('WP01');
  });

  it('continues after the highest generated sequence', () => {
    const waypoints: Waypoint[] = [
      { id: 'first-id', name: 'WP01', position },
      { id: 'third-id', name: 'WP03', position },
    ];

    expect(getNextWaypointName(waypoints)).toBe('WP04');
  });

  it('ignores names outside the automatic naming convention', () => {
    const waypoints: Waypoint[] = [
      { id: 'custom-id', name: 'BARDUFOSS', position },
      { id: 'second-id', name: 'WP02', position },
    ];

    expect(getNextWaypointName(waypoints)).toBe('WP03');
  });
});

