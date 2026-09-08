import {
  NORMALIZED_AERONAUTICAL_DATASET_SCHEMA_VERSION,
  type NormalizedAeronauticalDataset,
} from '../../../src/aeronautical/normalizedDataset';
import type { AvinorEaipBatchEditionConfig } from './types';
import type { AvinorEaipImportReport } from './importPipeline';

function duplicateIds(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function requireNoDuplicateIds(label: string, values: readonly string[]): void {
  const duplicates = duplicateIds(values);
  if (duplicates.length > 0) {
    throw new Error(`${label} contains duplicate stable IDs: ${duplicates.join(', ')}`);
  }
}

/**
 * Fail-closed checks applied before an updater may write candidate artifacts or
 * change the checked-in approved edition selector.
 */
export function validateAiracCandidate(
  edition: AvinorEaipBatchEditionConfig,
  dataset: NormalizedAeronauticalDataset,
  report: AvinorEaipImportReport,
): void {
  if (report.failures.length > 0) {
    const failureSummary = report.failures.map((failure) =>
      `- ${failure.sourceAerodrome} [${failure.code}] ${failure.message} (${failure.sourceUrl})`,
    ).join('\n');
    throw new Error(
      `Candidate import produced ${report.failures.length} failure(s); approved data was not changed:\n${failureSummary}`,
    );
  }
  if (
    report.discoveredAerodromeCount <= 0 ||
    report.importedAerodromes.length !== report.discoveredAerodromeCount
  ) {
    throw new Error(
      `Candidate imported ${report.importedAerodromes.length}/${report.discoveredAerodromeCount} discovered aerodromes; approved data was not changed`,
    );
  }
  if (dataset.schemaVersion !== NORMALIZED_AERONAUTICAL_DATASET_SCHEMA_VERSION) {
    throw new Error(`Candidate has unsupported schema version ${dataset.schemaVersion}`);
  }
  if (
    dataset.metadata.datasetId !== edition.datasetId ||
    dataset.metadata.editionLabel !== edition.editionLabel ||
    dataset.metadata.effectiveFromUtc !== edition.effectiveFromUtc ||
    dataset.metadata.airacCycle !== edition.airacCycle ||
    dataset.metadata.revisionId !== edition.revisionId
  ) {
    throw new Error('Candidate dataset provenance does not match the discovered edition');
  }
  if (
    report.editionLabel !== edition.editionLabel ||
    report.effectiveFromUtc !== edition.effectiveFromUtc ||
    report.sourceIndexUrl !== edition.indexUrl ||
    report.sourceEnr21Url !== edition.enr21Url ||
    report.sourceEnr22Url !== edition.enr22Url
  ) {
    throw new Error('Candidate import report provenance does not match the discovered edition');
  }

  requireNoDuplicateIds(
    'Candidate features',
    dataset.features.map(({ ref }) => ref.featureId),
  );
  requireNoDuplicateIds(
    'Candidate feature details',
    dataset.featureDetails.map(({ ref }) => ref.featureId),
  );
  requireNoDuplicateIds(
    'Candidate ATS service areas',
    dataset.atsServiceAreas.map(({ ref }) => ref.serviceAreaId),
  );
  requireNoDuplicateIds(
    'Candidate ATS units',
    dataset.atsUnits.map(({ id }) => id),
  );
  // Communication rows may intentionally share the current source-derived
  // service ID when the eAIP publishes the same callsign with separate
  // frequency sets. Do not invent a new identity rule here.
  requireNoDuplicateIds(
    'Candidate VAC chart manifests',
    dataset.vacCharts.map(({ id }) => id),
  );

  const featureIds = new Set(dataset.features.map(({ ref }) => ref.featureId));
  const orphanDetails = dataset.featureDetails
    .map(({ ref }) => ref.featureId)
    .filter((id) => !featureIds.has(id));
  if (orphanDetails.length > 0) {
    throw new Error(
      `Candidate contains details without matching features: ${orphanDetails.sort().join(', ')}`,
    );
  }
}
