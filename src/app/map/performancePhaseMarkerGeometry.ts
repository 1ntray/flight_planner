import type { Position } from '../../domain';

export interface ProjectedMapPoint {
  readonly x: number;
  readonly y: number;
}

export type ProjectMapPosition = (position: Position) => ProjectedMapPoint;

const EFFECTIVELY_IDENTICAL_PROJECTED_DISTANCE = 1e-9;

function segmentSearchOrder(
  selectedSegmentIndex: number,
  segmentCount: number,
): number[] {
  const indices: number[] = [];

  for (let offset = 0; offset < segmentCount; offset += 1) {
    const after = selectedSegmentIndex + offset;
    const before = selectedSegmentIndex - offset;

    if (after >= 0 && after < segmentCount && !indices.includes(after)) {
      indices.push(after);
    }
    if (before >= 0 && before < segmentCount && !indices.includes(before)) {
      indices.push(before);
    }
  }

  return indices;
}

/**
 * Returns the screen-space angle for a line perpendicular to the rendered
 * Leaflet polyline segment. Using segment endpoints avoids subpixel rounding
 * errors from very short tangent samples at regional zoom levels.
 */
export function calculatePerformanceTickAngleDeg(
  geometry: readonly Position[],
  selectedSegmentIndex: number,
  project: ProjectMapPosition,
): number {
  const segmentCount = Math.max(0, geometry.length - 1);

  for (const segmentIndex of segmentSearchOrder(
    selectedSegmentIndex,
    segmentCount,
  )) {
    const start = geometry[segmentIndex];
    const end = geometry[segmentIndex + 1];

    if (start === undefined || end === undefined) {
      continue;
    }

    const projectedStart = project(start);
    const projectedEnd = project(end);
    const deltaX = projectedEnd.x - projectedStart.x;
    const deltaY = projectedEnd.y - projectedStart.y;

    if (
      Math.hypot(deltaX, deltaY) <=
      EFFECTIVELY_IDENTICAL_PROJECTED_DISTANCE
    ) {
      continue;
    }

    const routeAngleDeg = Math.atan2(deltaY, deltaX) * 180 / Math.PI;
    return routeAngleDeg + 90;
  }

  return 90;
}
