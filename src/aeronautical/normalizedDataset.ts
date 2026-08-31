import type {
  AeronauticalDatasetMetadata,
  AeronauticalFeature,
  AeronauticalFeatureDetails,
  AtsUnit,
  CommunicationService,
  VacChartManifest,
} from '../domain';
import { InMemoryAeronauticalRepository } from './inMemoryRepository';

export const NORMALIZED_AERONAUTICAL_DATASET_SCHEMA_VERSION = 2;

export interface NormalizedAeronauticalDataset {
  readonly schemaVersion: typeof NORMALIZED_AERONAUTICAL_DATASET_SCHEMA_VERSION;
  readonly metadata: AeronauticalDatasetMetadata;
  readonly features: readonly AeronauticalFeature[];
  readonly featureDetails: readonly AeronauticalFeatureDetails[];
  readonly atsUnits: readonly AtsUnit[];
  readonly communicationServices: readonly CommunicationService[];
  readonly vacCharts: readonly VacChartManifest[];
}

export function createNormalizedAeronauticalRepository(
  dataset: NormalizedAeronauticalDataset,
): InMemoryAeronauticalRepository {
  if (dataset.schemaVersion !== NORMALIZED_AERONAUTICAL_DATASET_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported aeronautical dataset schema version: ${String(dataset.schemaVersion)}`,
    );
  }

  return new InMemoryAeronauticalRepository(
    dataset.metadata,
    dataset.features,
    dataset.featureDetails,
    dataset.atsUnits,
    dataset.communicationServices,
    dataset.vacCharts,
  );
}
