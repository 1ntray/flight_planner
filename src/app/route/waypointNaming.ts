import type { Waypoint } from '../../domain';

const WAYPOINT_NAME_PATTERN = /^WP(\d+)$/u;

export function formatWaypointName(sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new RangeError('Waypoint sequence must be a positive integer');
  }

  return `WP${sequence.toString().padStart(2, '0')}`;
}

export function getNextWaypointName(waypoints: readonly Waypoint[]): string {
  const highestSequence = waypoints.reduce((highest, waypoint) => {
    const match = WAYPOINT_NAME_PATTERN.exec(waypoint.name);

    if (match === null) {
      return highest;
    }

    const sequence = Number(match[1]);
    return Number.isSafeInteger(sequence) ? Math.max(highest, sequence) : highest;
  }, 0);

  return formatWaypointName(highestSequence + 1);
}

