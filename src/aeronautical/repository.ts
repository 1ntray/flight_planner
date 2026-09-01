import type {
  AeronauticalDatasetMetadata,
  AeronauticalDatasetRef,
  AeronauticalFeature,
  AeronauticalFeatureDetails,
  AeronauticalFeatureKind,
  AeronauticalFeatureRef,
  AeronauticalPointFeature,
  AtsServiceArea,
  AtsUnit,
  CommunicationService,
  VacChartManifest,
  Wgs84Bounds,
} from '../domain';

export interface AeronauticalFeatureQuery {
  readonly bounds: Wgs84Bounds;
  readonly featureKinds: readonly AeronauticalFeatureKind[];
}

export interface AeronauticalQueryOptions {
  readonly signal?: AbortSignal;
}

export interface CommunicationServiceQuery {
  readonly featureIds: readonly string[];
}

export interface AtsServiceAreaQuery {
  readonly bounds: Wgs84Bounds;
}

export interface VacChartQuery {
  readonly bounds?: Wgs84Bounds;
  readonly aerodromeFeatureIds?: readonly string[];
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

  queryCommunicationServices(
    query: CommunicationServiceQuery,
    options?: AeronauticalQueryOptions,
  ): Promise<readonly CommunicationService[]>;

  getCommunicationService(
    id: string,
    options?: AeronauticalQueryOptions,
  ): Promise<CommunicationService | null>;

  queryAtsServiceAreas(
    query: AtsServiceAreaQuery,
    options?: AeronauticalQueryOptions,
  ): Promise<readonly AtsServiceArea[]>;

  getAtsUnit(
    id: string,
    options?: AeronauticalQueryOptions,
  ): Promise<AtsUnit | null>;

  queryVacCharts(
    query: VacChartQuery,
    options?: AeronauticalQueryOptions,
  ): Promise<readonly VacChartManifest[]>;
}
