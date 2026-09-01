import type {
  AeronauticalDatasetRef,
  AeronauticalPolygon,
  AeronauticalSourceReference,
} from './aeronautical';
import type {
  AirspaceGeometryDefinition,
  VerticalLimit,
} from './airspace';

export interface AtsServiceAreaRef {
  readonly dataset: AeronauticalDatasetRef;
  readonly serviceAreaId: string;
  readonly serviceAreaVersionId?: string;
}

/**
 * Published geographic/vertical coverage for an ATS communication service.
 *
 * This is deliberately not an aeronautical map feature or regulatory
 * airspace. It may be queried for planning-frequency selection without being
 * displayed as CTR/TMA/CTA geometry or becoming a waypoint anchor.
 */
export interface AtsServiceArea {
  readonly ref: AtsServiceAreaRef;
  readonly publishedName: string;
  readonly sectorIdentifier: string | null;
  readonly unitId?: string;
  readonly communicationServiceId: string;
  readonly geometryStatus: 'resolved' | 'unresolved';
  readonly lowerLimit: VerticalLimit;
  readonly upperLimit: VerticalLimit;
  /** WGS84 geometry suitable for spatial queries; empty while unresolved. */
  readonly polygons: readonly AeronauticalPolygon[];
  /** Published geometry semantics retained for source verification. */
  readonly sourceGeometry: AirspaceGeometryDefinition;
  readonly sourceReferences: readonly AeronauticalSourceReference[];
}
