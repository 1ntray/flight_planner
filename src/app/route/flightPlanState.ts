import type {
  AeronauticalPointFeature,
  FlightPlan,
  LegShape,
  Position,
  RouteShapingPoint,
} from '../../domain';
import {
  appendAnchoredWaypoint,
  appendWaypoint,
  attachWaypointToAeronauticalFeature,
  detachWaypointById,
  moveWaypointById,
  renameWaypointById,
  removeWaypointById,
} from './waypointState';

function legMatches(
  shape: LegShape,
  fromWaypointId: string,
  toWaypointId: string,
): boolean {
  return (
    shape.fromWaypointId === fromWaypointId &&
    shape.toWaypointId === toWaypointId
  );
}

function requireAdjacentLeg(
  flightPlan: FlightPlan,
  fromWaypointId: string,
  toWaypointId: string,
): void {
  const isAdjacent = flightPlan.waypoints.some(
    (waypoint, index) =>
      waypoint.id === fromWaypointId &&
      flightPlan.waypoints[index + 1]?.id === toWaypointId,
  );

  if (!isAdjacent) {
    throw new RangeError(
      `Route shape ${fromWaypointId} to ${toWaypointId} does not match an adjacent waypoint leg`,
    );
  }
}

function requireUniqueShapingPointId(
  flightPlan: FlightPlan,
  pointId: string,
): void {
  if (pointId === '') {
    throw new RangeError('Route shaping point ID must not be empty');
  }

  if (
    flightPlan.legShapes.some((shape) =>
      shape.points.some((point) => point.id === pointId),
    )
  ) {
    throw new RangeError(`Duplicate route shaping point ID ${pointId}`);
  }
}

export function appendWaypointToFlightPlan(
  flightPlan: FlightPlan,
  position: Position,
  id: string,
): FlightPlan {
  return {
    ...flightPlan,
    waypoints: appendWaypoint(flightPlan.waypoints, position, id),
  };
}

export function appendAnchoredWaypointToFlightPlan(
  flightPlan: FlightPlan,
  feature: AeronauticalPointFeature,
  id: string,
): FlightPlan {
  return {
    ...flightPlan,
    waypoints: appendAnchoredWaypoint(flightPlan.waypoints, feature, id),
  };
}

export function attachWaypointToAeronauticalFeatureInFlightPlan(
  flightPlan: FlightPlan,
  id: string,
  feature: AeronauticalPointFeature,
): FlightPlan {
  return {
    ...flightPlan,
    waypoints: attachWaypointToAeronauticalFeature(
      flightPlan.waypoints,
      id,
      feature,
    ),
  };
}

export function moveWaypointInFlightPlan(
  flightPlan: FlightPlan,
  id: string,
  position: Position,
): FlightPlan {
  return {
    ...flightPlan,
    waypoints: moveWaypointById(flightPlan.waypoints, id, position),
  };
}

export function renameWaypointInFlightPlan(
  flightPlan: FlightPlan,
  id: string,
  name: string,
): FlightPlan {
  return {
    ...flightPlan,
    waypoints: renameWaypointById(flightPlan.waypoints, id, name),
  };
}

export function detachWaypointInFlightPlan(
  flightPlan: FlightPlan,
  id: string,
): FlightPlan {
  return {
    ...flightPlan,
    waypoints: detachWaypointById(flightPlan.waypoints, id),
  };
}

export function removeWaypointFromFlightPlan(
  flightPlan: FlightPlan,
  id: string,
): FlightPlan {
  return {
    waypoints: removeWaypointById(flightPlan.waypoints, id),
    legShapes: flightPlan.legShapes.filter(
      (shape) =>
        shape.fromWaypointId !== id && shape.toWaypointId !== id,
    ),
    sectorBoundaryWaypointIds: (flightPlan.sectorBoundaryWaypointIds ?? []).filter(
      (waypointId) => waypointId !== id,
    ),
  };
}

export function setWaypointSectorBoundary(
  flightPlan: FlightPlan,
  waypointId: string,
  enabled: boolean,
): FlightPlan {
  const waypointIndex = flightPlan.waypoints.findIndex(
    (waypoint) => waypoint.id === waypointId,
  );

  if (waypointIndex <= 0 || waypointIndex >= flightPlan.waypoints.length - 1) {
    throw new RangeError('A sector boundary must be an intermediate waypoint');
  }

  const boundaries = flightPlan.sectorBoundaryWaypointIds ?? [];
  const existing = boundaries.includes(waypointId);

  if (existing === enabled) {
    return flightPlan;
  }

  return {
    ...flightPlan,
    sectorBoundaryWaypointIds: enabled
      ? [...boundaries, waypointId]
      : boundaries.filter((id) => id !== waypointId),
  };
}

export function insertRouteShapingPoint(
  flightPlan: FlightPlan,
  fromWaypointId: string,
  toWaypointId: string,
  insertionIndex: number,
  point: RouteShapingPoint,
): FlightPlan {
  requireAdjacentLeg(flightPlan, fromWaypointId, toWaypointId);
  requireUniqueShapingPointId(flightPlan, point.id);

  const existingShape = flightPlan.legShapes.find((shape) =>
    legMatches(shape, fromWaypointId, toWaypointId),
  );
  const points = existingShape?.points ?? [];

  if (
    !Number.isInteger(insertionIndex) ||
    insertionIndex < 0 ||
    insertionIndex > points.length
  ) {
    throw new RangeError('Route shaping point insertion index is out of range');
  }

  const updatedShape: LegShape = {
    fromWaypointId,
    toWaypointId,
    points: [
      ...points.slice(0, insertionIndex),
      point,
      ...points.slice(insertionIndex),
    ],
  };

  return {
    ...flightPlan,
    legShapes:
      existingShape === undefined
        ? [...flightPlan.legShapes, updatedShape]
        : flightPlan.legShapes.map((shape) =>
            shape === existingShape ? updatedShape : shape,
          ),
  };
}

export function moveRouteShapingPoint(
  flightPlan: FlightPlan,
  pointId: string,
  position: Position,
): FlightPlan {
  return {
    ...flightPlan,
    legShapes: flightPlan.legShapes.map((shape) => ({
      ...shape,
      points: shape.points.map((point) =>
        point.id === pointId
          ? (() => {
              const { anchor: _anchor, ...freePoint } = point;
              return { ...freePoint, position };
            })()
          : point,
      ),
    })),
  };
}

/** Snaps one shaping point to a reporting-point coordinate/provenance snapshot. */
export function attachRouteShapingPointToReportingPoint(
  flightPlan: FlightPlan,
  pointId: string,
  feature: AeronauticalPointFeature,
): FlightPlan {
  if (
    feature.pointKind !== 'reporting-point' ||
    feature.ref.featureKind !== 'reporting-point'
  ) {
    throw new RangeError('A shaping point may only attach to a reporting point');
  }

  let found = false;
  const legShapes = flightPlan.legShapes.map((shape) => ({
    ...shape,
    points: shape.points.map((point) => {
      if (point.id !== pointId) return point;
      found = true;
      return {
        ...point,
        position: { ...feature.position },
        anchor: {
          kind: 'aeronautical-reporting-point' as const,
          feature: {
            ...feature.ref,
            dataset: { ...feature.ref.dataset },
          },
          publishedIdentifier: feature.identifier,
          ...(feature.name === undefined ? {} : { publishedName: feature.name }),
        },
      };
    }),
  }));

  if (!found) throw new RangeError(`Route shaping point ${pointId} does not exist`);
  return { ...flightPlan, legShapes };
}

/** Removes reporting-point provenance while retaining the current WGS84 coordinate. */
export function detachRouteShapingPoint(
  flightPlan: FlightPlan,
  pointId: string,
): FlightPlan {
  return {
    ...flightPlan,
    legShapes: flightPlan.legShapes.map((shape) => ({
      ...shape,
      points: shape.points.map((point) => {
        if (point.id !== pointId || point.anchor === undefined) return point;
        const { anchor: _anchor, ...freePoint } = point;
        return freePoint;
      }),
    })),
  };
}

export function removeRouteShapingPoint(
  flightPlan: FlightPlan,
  pointId: string,
): FlightPlan {
  return {
    ...flightPlan,
    legShapes: flightPlan.legShapes.flatMap((shape) => {
      const points = shape.points.filter((point) => point.id !== pointId);

      return points.length === 0 ? [] : [{ ...shape, points }];
    }),
  };
}
