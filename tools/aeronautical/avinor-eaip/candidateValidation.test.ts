import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { NormalizedAeronauticalDataset } from '../../../src/aeronautical/normalizedDataset';
import { NORWAY_EAIP_EDITION } from './edition';
import type { AvinorEaipImportReport } from './importPipeline';
import { validateAiracCandidate } from './candidateValidation';

function readJson<T>(url: URL): T {
  return JSON.parse(readFileSync(url, 'utf8')) as T;
}

const dataset = readJson<NormalizedAeronauticalDataset>(new URL(
  `../../../src/aeronautical/data/${NORWAY_EAIP_EDITION.datasetId}.json`,
  import.meta.url,
));
const report = readJson<AvinorEaipImportReport>(new URL(
  `../../../data/aeronautical/import-reports/${NORWAY_EAIP_EDITION.datasetId}-aerodromes.json`,
  import.meta.url,
));
const repositorySource = readFileSync(new URL(
  '../../../src/aeronautical/avinorRepository.ts',
  import.meta.url,
), 'utf8');

describe('validateAiracCandidate', () => {
  it('accepts the complete approved artifact set', () => {
    expect(() => validateAiracCandidate(NORWAY_EAIP_EDITION, dataset, report))
      .not.toThrow();
    expect(repositorySource).toContain(
      `./data/${NORWAY_EAIP_EDITION.datasetId}.json`,
    );
  });

  it('rejects partial imports', () => {
    expect(() => validateAiracCandidate(NORWAY_EAIP_EDITION, dataset, {
      ...report,
      importedAerodromes: report.importedAerodromes.slice(1),
    })).toThrow(
      `imported ${report.importedAerodromes.length - 1}/${report.discoveredAerodromeCount}`,
    );
  });

  it('rejects duplicate stable feature IDs', () => {
    expect(() => validateAiracCandidate(NORWAY_EAIP_EDITION, {
      ...dataset,
      features: [...dataset.features, dataset.features[0]!],
    }, report)).toThrow(/duplicate stable IDs/);
  });
});
