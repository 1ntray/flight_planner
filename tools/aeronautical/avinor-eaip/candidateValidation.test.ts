import { describe, expect, it } from 'vitest';

import datasetJson from '../../../src/aeronautical/data/avinor-eaip-2026-06-11.json';
import type { NormalizedAeronauticalDataset } from '../../../src/aeronautical/normalizedDataset';
import importReportJson from '../../../data/aeronautical/import-reports/avinor-eaip-2026-06-11-aerodromes.json';
import { NORWAY_EAIP_EDITION } from './edition';
import type { AvinorEaipImportReport } from './importPipeline';
import { validateAiracCandidate } from './candidateValidation';

const sourceDataset = datasetJson as unknown as NormalizedAeronauticalDataset;
const sourceReport = importReportJson as unknown as AvinorEaipImportReport;
const { revisionId: _sourceRevision, ...metadataWithoutRevision } =
  sourceDataset.metadata;
const dataset: NormalizedAeronauticalDataset = {
  ...sourceDataset,
  metadata: {
    ...metadataWithoutRevision,
    datasetId: NORWAY_EAIP_EDITION.datasetId,
    editionLabel: NORWAY_EAIP_EDITION.editionLabel,
    airacCycle: NORWAY_EAIP_EDITION.airacCycle,
    effectiveFromUtc: NORWAY_EAIP_EDITION.effectiveFromUtc,
    ...(NORWAY_EAIP_EDITION.revisionId === undefined
      ? {}
      : { revisionId: NORWAY_EAIP_EDITION.revisionId }),
  },
};
const report: AvinorEaipImportReport = {
  ...sourceReport,
  editionLabel: NORWAY_EAIP_EDITION.editionLabel,
  effectiveFromUtc: NORWAY_EAIP_EDITION.effectiveFromUtc,
  sourceIndexUrl: NORWAY_EAIP_EDITION.indexUrl,
  sourceEnr21Url: NORWAY_EAIP_EDITION.enr21Url,
  sourceEnr22Url: NORWAY_EAIP_EDITION.enr22Url,
};

describe('validateAiracCandidate', () => {
  it('accepts the complete approved artifact set', () => {
    expect(() => validateAiracCandidate(NORWAY_EAIP_EDITION, dataset, report))
      .not.toThrow();
  });

  it('rejects partial imports', () => {
    expect(() => validateAiracCandidate(NORWAY_EAIP_EDITION, dataset, {
      ...report,
      importedAerodromes: report.importedAerodromes.slice(1),
    })).toThrow(/imported 52\/53/);
  });

  it('rejects duplicate stable feature IDs', () => {
    expect(() => validateAiracCandidate(NORWAY_EAIP_EDITION, {
      ...dataset,
      features: [...dataset.features, dataset.features[0]!],
    }, report)).toThrow(/duplicate stable IDs/);
  });
});
