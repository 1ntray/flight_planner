import type { AeronauticalAreaFeature, Position } from '../../domain';

const AREA_KIND_ORDER: Readonly<Record<AeronauticalAreaFeature['areaKind'], number>> = {
  ctr: 0,
  tiz: 1,
  tia: 2,
  tma: 3,
  cta: 4,
  'restricted-area': 5,
  'danger-area': 6,
  'prohibited-area': 7,
  'other-airspace': 8,
};

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

function ringContainsPosition(ring: readonly Position[], point: Position): boolean {
  if (ring.length < 3) return false;
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
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

function areaContainsPosition(
  feature: AeronauticalAreaFeature,
  point: Position,
): boolean {
  return feature.polygons.some(
    ({ outerRing, holes }) =>
      ringContainsPosition(outerRing, point) &&
      !holes.some((hole) => ringContainsPosition(hole, point)),
  );
}

/** Returns every rendered airspace at a WGS84 pointer position in UI order. */
export function airspacesAtPosition(
  features: readonly AeronauticalAreaFeature[],
  point: Position,
): readonly AeronauticalAreaFeature[] {
  return features
    .filter((feature) => areaContainsPosition(feature, point))
    .sort((left, right) =>
      AREA_KIND_ORDER[left.areaKind] - AREA_KIND_ORDER[right.areaKind] ||
      left.name.localeCompare(right.name),
    );
}
