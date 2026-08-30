import type {
  AeronauticalDatasetMetadata,
  AeronauticalDatasetRef,
  AeronauticalFeature,
  AeronauticalFeatureDetails,
  AeronauticalFeatureKind,
  AeronauticalFeatureRef,
  AeronauticalPointFeature,
  Wgs84Bounds,
} from '../domain';

export interface AeronauticalFeatureQuery {
  readonly bounds: Wgs84Bounds;
  readonly featureKinds: readonly AeronauticalFeatureKind[];
}

export interface AeronauticalQueryOptions {
  readonly signal?: AbortSignal;
}

export interface AeronauticalDataRepository {
  getDatasetMetadata(
    options?: AeronauticalQueryOptions,
  ): Promise<AeronauticalDatasetMetadata | null>;

  queryFeatures(
    query: AeronauticalFeatureQuery,
    options?: AeronauticalQueryOptions,
  ): Promise<readonly AeronauticalFeature[]>;

  getFeature(
    ref: AeronauticalFeatureRef,
    options?: AeronauticalQueryOptions,
  ): Promise<AeronauticalFeature | null>;

  getFeatureDetails(
    ref: AeronauticalFeatureRef,
    options?: AeronauticalQueryOptions,
  ): Promise<AeronauticalFeatureDetails | null>;

  /** Resolves an aerodrome by published ICAO identifier, independent of map viewport. */
  findAerodromeByIdentifier(
    identifier: string,
    options?: AeronauticalQueryOptions,
  ): Promise<AeronauticalPointFeature | null>;
}
