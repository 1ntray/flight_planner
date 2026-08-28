import type { FlightPlan, LegShape, Position, Waypoint } from '../../domain';
import { getNextWaypointName } from './waypointNaming';

export type RouteGeometryPointRef =
  | { readonly kind: 'waypoint'; readonly id: string }
  | { readonly kind: 'shaping-point'; readonly id: string };

export interface RouteWaypointInsertionCandidate {
  readonly fromWaypointId: string;
  readonly toWaypointId: string;
  readonly segmentIndex: number;
  readonly segmentStart: RouteGeometryPointRef;
  readonly segmentEnd: RouteGeometryPointRef;
  readonly position: Position;
}

function refsMatch(
  first: RouteGeometryPointRef,
  second: RouteGeometryPointRef,
): boolean {
  return first.kind === second.kind && first.id === second.id;
}

function requireFinitePosition(position: Position): void {
  if (
    !Number.isFinite(position.latitude) ||
    !Number.isFinite(position.longitude) ||
    position.latitude < -90 ||
    position.latitude > 90
  ) {
    throw new RangeError('Inserted waypoint position must be a valid WGS84 coordinate');
  }
}

function createSplitShapes(
  shape: LegShape,
  segmentIndex: number,
  insertedWaypointId: string,
): LegShape[] {
  const leftPoints = shape.points.slice(0, segmentIndex);
  const rightPoints = shape.points.slice(segmentIndex);

  return [
    ...(leftPoints.length === 0
      ? []
      : [
          {
            fromWaypointId: shape.fromWaypointId,
            toWaypointId: insertedWaypointId,
            points: leftPoints,
          },
        ]),
    ...(rightPoints.length === 0
      ? []
      : [
          {
            fromWaypointId: insertedWaypointId,
            toWaypointId: shape.toWaypointId,
            points: rightPoints,
          },
        ]),
  ];
}

/**
 * Inserts one real, free waypoint into an existing adjacent navlog leg and
 * atomically splits that leg's optional shaping geometry around the selected
 * logical segment.
 */
export function insertWaypointIntoFlightPlan(
  flightPlan: FlightPlan,
  candidate: RouteWaypointInsertionCandidate,
  insertedWaypointId: string,
): FlightPlan {
  if (insertedWaypointId === '') {
    throw new RangeError('Inserted waypoint ID must not be empty');
  }

  if (
    flightPlan.waypoints.some((waypoint) => waypoint.id === insertedWaypointId) ||
    flightPlan.legShapes.some((shape) =>
      shape.points.some((point) => point.id === insertedWaypointId),
    )
  ) {
    throw new RangeError(`Duplicate route point ID ${insertedWaypointId}`);
  }

  requireFinitePosition(candidate.position);

  const fromIndex = flightPlan.waypoints.findIndex(
    (waypoint) => waypoint.id === candidate.fromWaypointId,
  );
  const from = flightPlan.waypoints[fromIndex];
  const to = flightPlan.waypoints[fromIndex + 1];

  if (
    from === undefined ||
    to === undefined ||
    to.id !== candidate.toWaypointId
  ) {
    throw new RangeError('Waypoint insertion candidate no longer matches an adjacent leg');
  }

  const shape = flightPlan.legShapes.find(
    (item) =>
      item.fromWaypointId === candidate.fromWaypointId &&
      item.toWaypointId === candidate.toWaypointId,
  );
  const shapePoints = shape?.points ?? [];

  if (
    !Number.isInteger(candidate.segmentIndex) ||
    candidate.segmentIndex < 0 ||
    candidate.segmentIndex > shapePoints.length
  ) {
    throw new RangeError('Waypoint insertion segment index is out of range');
  }

  const geometryRefs: RouteGeometryPointRef[] = [
    { kind: 'waypoint', id: from.id },
    ...shapePoints.map((point) => ({
      kind: 'shaping-point' as const,
      id: point.id,
    })),
    { kind: 'waypoint', id: to.id },
  ];
  const currentSegmentStart = geometryRefs[candidate.segmentIndex];
  const currentSegmentEnd = geometryRefs[candidate.segmentIndex + 1];

  if (
    currentSegmentStart === undefined ||
    currentSegmentEnd === undefined ||
    !refsMatch(candidate.segmentStart, currentSegmentStart) ||
    !refsMatch(candidate.segmentEnd, currentSegmentEnd)
  ) {
    throw new RangeError('Waypoint insertion candidate no longer matches the route geometry');
  }

  const insertedWaypoint: Waypoint = {
    id: insertedWaypointId,
    name: getNextWaypointName(flightPlan.waypoints),
    position: { ...candidate.position },
  };

  return {
    waypoints: [
      ...flightPlan.waypoints.slice(0, fromIndex + 1),
      insertedWaypoint,
      ...flightPlan.waypoints.slice(fromIndex + 1),
    ],
    legShapes:
      shape === undefined
        ? flightPlan.legShapes
        : flightPlan.legShapes.flatMap((item) =>
            item === shape
              ? createSplitShapes(
                  shape,
                  candidate.segmentIndex,
                  insertedWaypointId,
                )
              : [item],
          ),
  };
}
