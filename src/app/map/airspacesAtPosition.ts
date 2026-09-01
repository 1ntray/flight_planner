import type { AeronauticalAreaFeature, Position } from '../../domain';
import { polygonsContainPosition } from '../../calculations';

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

function areaContainsPosition(
  feature: AeronauticalAreaFeature,
  point: Position,
): boolean {
  return polygonsContainPosition(feature.polygons, point);
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
