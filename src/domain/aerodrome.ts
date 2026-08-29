import type {
  AeronauticalFeatureRef,
  AeronauticalSourceReference,
} from './aeronautical';
import type { Position } from './position';

export interface RunwayDeclaredDistances {
  readonly toraM: number | null;
  readonly todaM: number | null;
  readonly asdaM: number | null;
  readonly ldaM: number | null;
}

export interface RunwayDirection {
  readonly designator: string;
  readonly trueBearingDeg: number | null;
  readonly declaredDistances: RunwayDeclaredDistances;
}

export interface AerodromeRunway {
  /** Semantic identifier derived from the published directions, e.g. 10/28. */
  readonly identifier: string;
  readonly lengthM: number | null;
  readonly directions: readonly RunwayDirection[];
}

export interface AerodromeDetails {
  readonly detailKind: 'aerodrome';
  readonly ref: AeronauticalFeatureRef;
  readonly icaoIdentifier: string;
  readonly name: string;
  readonly arpPosition: Position;
  readonly elevationFt: number | null;
  readonly runways: readonly AerodromeRunway[];
  readonly sourceReferences: readonly AeronauticalSourceReference[];
}

/** Extend this union with airspace details without changing map features. */
export type AeronauticalFeatureDetails = AerodromeDetails;
