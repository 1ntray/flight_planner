import type {
  CalculatedLeg,
  FlightPlan,
  LegShape,
  Position,
  RouteShapingPoint,
  Waypoint,
} from '../domain';
import { calculateInverseGeodesic } from './geodesy';

function legKey(fromWaypointId: string, toWaypointId: string): string {
  return `${fromWaypointId}\u0000${toWaypointId}`;
}

function createLegShapeMap(
  waypoints: readonly Waypoint[],
  legShapes: readonly LegShape[],
): Map<string, LegShape> {
  const adjacentLegKeys = new Set(
    waypoints.slice(1).map((waypoint, index) =>
      legKey(waypoints[index]!.id, waypoint.id),
    ),
  );
  const shapesByLeg = new Map<string, LegShape>();
  const shapingPointIds = new Set<string>();

  for (const shape of legShapes) {
    const key = legKey(shape.fromWaypointId, shape.toWaypointId);

    if (!adjacentLegKeys.has(key)) {
      throw new RangeError(
        `Route shape ${shape.fromWaypointId} to ${shape.toWaypointId} does not match an adjacent waypoint leg`,
      );
    }

    if (shapesByLeg.has(key)) {
      throw new RangeError(
        `Duplicate route shape for leg ${shape.fromWaypointId} to ${shape.toWaypointId}`,
      );
    }

    for (const point of shape.points) {
      if (point.id === '') {
        throw new RangeError('Route shaping point ID must not be empty');
      }

      if (shapingPointIds.has(point.id)) {
        throw new RangeError(`Duplicate route shaping point ID ${point.id}`);
      }

      shapingPointIds.add(point.id);
    }

    shapesByLeg.set(key, shape);
  }

  return shapesByLeg;
}

export function buildLegGeometry(
  from: Waypoint,
  to: Waypoint,
  shapingPoints: readonly RouteShapingPoint[] = [],
): Position[] {
  return [
    from.position,
    ...shapingPoints.map((point) => point.position),
    to.position,
  ];
}

export function calculateLeg(
  from: Waypoint,
  to: Waypoint,
  shapingPoints: readonly RouteShapingPoint[] = [],
): CalculatedLeg {
  const directGeodesic = calculateInverseGeodesic(from.position, to.position);
  const geometry = buildLegGeometry(from, to, shapingPoints);
  const distanceNm = geometry.slice(1).reduce((total, position, index) => {
    const previous = geometry[index];

    if (previous === undefined) {
      throw new Error('A route geometry segment must have a starting position');
    }

    return total + calculateInverseGeodesic(previous, position).distanceNm;
  }, 0);

  return {
    fromId: from.id,
    toId: to.id,
    geometry,
    distanceNm,
    trueTrackDeg: directGeodesic.trueTrackDeg,
  };
}

export function calculateFlightPlanLegs(
  flightPlan: FlightPlan,
): CalculatedLeg[] {
  return calculateRoute(flightPlan);
}

export function calculateRoute(
  flightPlan: FlightPlan,
): CalculatedLeg[] {
  const { waypoints } = flightPlan;
  const shapesByLeg = createLegShapeMap(waypoints, flightPlan.legShapes);

  return waypoints.slice(1).map((to, index) => {
    const from = waypoints[index];

    if (from === undefined) {
      throw new Error('A calculated leg must have a starting waypoint');
    }

    const shape = shapesByLeg.get(legKey(from.id, to.id));

    return calculateLeg(from, to, shape?.points);
  });
}
