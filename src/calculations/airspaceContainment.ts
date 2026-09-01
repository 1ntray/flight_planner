import type { AeronauticalPolygon, Position } from '../domain';

function pointIsOnSegment(point: Position, from: Position, to: Position): boolean {
  const cross =
    (point.longitude - from.longitude) * (to.latitude - from.latitude) -
    (point.latitude - from.latitude) * (to.longitude - from.longitude);
  if (Math.abs(cross) > 1e-10) return false;
  return (
    point.longitude >= Math.min(from.longitude, to.longitude) - 1e-10 &&
    point.longitude <= Math.max(from.longitude, to.longitude) + 1e-10 &&
    point.latitude >= Math.min(from.latitude, to.latitude) - 1e-10 &&
    point.latitude <= Math.max(from.latitude, to.latitude) + 1e-10
  );
}

export function ringContainsPosition(
  ring: readonly Position[],
  point: Position,
): boolean {
  if (ring.length < 3) return false;
  let inside = false;
  for (
    let index = 0, previous = ring.length - 1;
    index < ring.length;
    previous = index, index += 1
  ) {
    const from = ring[previous];
    const to = ring[index];
    if (from === undefined || to === undefined) continue;
    if (pointIsOnSegment(point, from, to)) return true;
    const crossesLatitude =
      (to.latitude > point.latitude) !== (from.latitude > point.latitude);
    const crossingLongitude =
      ((from.longitude - to.longitude) * (point.latitude - to.latitude)) /
        (from.latitude - to.latitude) +
      to.longitude;
    if (crossesLatitude && point.longitude < crossingLongitude) inside = !inside;
  }
  return inside;
}

export function polygonContainsPosition(
  polygon: AeronauticalPolygon,
  point: Position,
): boolean {
  return ringContainsPosition(polygon.outerRing, point) &&
    !polygon.holes.some((hole) => ringContainsPosition(hole, point));
}

export function polygonsContainPosition(
  polygons: readonly AeronauticalPolygon[],
  point: Position,
): boolean {
  return polygons.some((polygon) => polygonContainsPosition(polygon, point));
}
