import type { Position } from './position';

export type AeronauticalPointKind =
  | 'aerodrome'
  | 'reporting-point'
  | 'navaid'
  | 'designated-point';

export type AeronauticalAreaKind =
  | 'ctr'
  | 'tma'
  | 'cta'
  | 'tia'
  | 'tiz'
  | 'restricted-area'
  | 'danger-area'
  | 'prohibited-area'
  | 'other-airspace';

export type AeronauticalFeatureKind =
  | AeronauticalPointKind
  | AeronauticalAreaKind;

export interface AeronauticalDatasetRef {
  /** Identifies one exact imported dataset revision. */
  readonly datasetId: string;
  /** Stable machine-readable namespace for the source. */
  readonly providerId: string;
  readonly sourceName: string;
  readonly airacCycle: string | null;
  readonly effectiveFromUtc: string;
  readonly effectiveToUtc: string | null;
  readonly revisionId?: string;
}

/** Full provenance for a locally imported dataset revision. */
export interface AeronauticalDatasetMetadata extends AeronauticalDatasetRef {
  readonly editionLabel: string;
  readonly retrievedAtUtc: string;
  readonly importedAtUtc: string;
  readonly sourceReference: string;
  readonly importer?: {
    readonly name: string;
    readonly version: string;
  };
}

export interface AeronauticalSourceReference {
  readonly sourceType?:
    | 'eAIP-html'
    | 'vac-pdf'
    | 'prepared-vac'
    | 'authoritative-boundary';
  readonly sourceAerodrome?: string;
  readonly sourceDocument?: string;
  readonly aipSection: string;
  readonly sourcePage?: string;
  readonly publishedIdentifier?: string;
  readonly sourceReference: string;
}

export interface AeronauticalFeatureRef {
  readonly dataset: AeronauticalDatasetRef;
  readonly featureId: string;
  readonly featureVersionId?: string;
  readonly featureKind: AeronauticalFeatureKind;
}

export interface AeronauticalPointFeature {
  readonly geometryType: 'point';
  readonly ref: AeronauticalFeatureRef;
  readonly pointKind: AeronauticalPointKind;
  readonly identifier: string;
  readonly name?: string;
  readonly suggestedWaypointName: string;
  readonly position: Position;
}

export interface AeronauticalPolygon {
  readonly outerRing: readonly Position[];
  readonly holes: readonly (readonly Position[])[];
}

export interface AeronauticalAreaFeature {
  readonly geometryType: 'area';
  readonly ref: AeronauticalFeatureRef;
  readonly areaKind: AeronauticalAreaKind;
  readonly identifier?: string;
  readonly name: string;
  /** WGS84 render geometry. A source adapter handles format-specific curves. */
  readonly polygons: readonly AeronauticalPolygon[];
}

export type AeronauticalFeature =
  | AeronauticalPointFeature
  | AeronauticalAreaFeature;

export interface Wgs84Bounds {
  readonly south: number;
  readonly west: number;
  readonly north: number;
  readonly east: number;
}
