import type { AvinorEaipBatchEditionConfig } from './types';

function quoted(value: string): string {
  return JSON.stringify(value);
}

function optionalRevision(edition: AvinorEaipBatchEditionConfig): string {
  return edition.revisionId === undefined
    ? ''
    : `\n  revisionId: ${quoted(edition.revisionId)},`;
}

function enduUrl(edition: AvinorEaipBatchEditionConfig): string {
  const suffix = 'EN-AD-1.3-en-GB.html';
  if (!edition.indexUrl.endsWith(suffix)) {
    throw new Error(`Cannot derive ENDU source URL from ${edition.indexUrl}`);
  }
  return `${edition.indexUrl.slice(0, -suffix.length)}EN-AD-2.ENDU-en-GB.html`;
}

export function renderApprovedEditionSource(
  edition: AvinorEaipBatchEditionConfig,
): string {
  return `import type {
  AvinorEaipBatchEditionConfig,
  AvinorEaipImportConfig,
} from './types';

export type AvinorEaipEditionConfig = Omit<
  AvinorEaipImportConfig,
  'retrievedAtUtc' | 'importedAtUtc'
>;

/**
 * This is the reviewed, explicitly approved eAIP edition. Discovery may
 * prepare a pull request, but only merging that pull request changes this pin.
 */
export const NORWAY_EAIP_EDITION: AvinorEaipBatchEditionConfig = {
  datasetId: ${quoted(edition.datasetId)},
  editionLabel: ${quoted(edition.editionLabel)},
  // Avinor's publication history does not expose a cycle number, so none is inferred.
  airacCycle: ${edition.airacCycle === null ? 'null' : quoted(edition.airacCycle)},
  effectiveFromUtc: ${quoted(edition.effectiveFromUtc)},${optionalRevision(edition)}
  indexUrl:
    ${quoted(edition.indexUrl)},
  enr21Url:
    ${quoted(edition.enr21Url)},
  enr22Url:
    ${quoted(edition.enr22Url)},
};

export const ENDU_EAIP_EDITION: AvinorEaipEditionConfig = {
  ...NORWAY_EAIP_EDITION,
  sourceAerodrome: 'ENDU',
  sourceUrl:
    ${quoted(enduUrl(edition))},
};
`;
}

export function renderApprovedRepositorySource(datasetId: string): string {
  if (!/^avinor-eaip-\d{4}-\d{2}-\d{2}$/.test(datasetId)) {
    throw new Error(`Unsafe generated dataset ID: ${datasetId}`);
  }
  return `import normalizedAvinorDataset from './data/${datasetId}.json';
import { createNormalizedAeronauticalRepository } from './normalizedDataset';
import type { NormalizedAeronauticalDataset } from './normalizedDataset';

const AVINOR_DATASET =
  normalizedAvinorDataset as unknown as NormalizedAeronauticalDataset;

/** Local normalized data only; no Avinor request occurs in the browser. */
export const AVINOR_EAIP_REPOSITORY =
  createNormalizedAeronauticalRepository(AVINOR_DATASET);
`;
}
