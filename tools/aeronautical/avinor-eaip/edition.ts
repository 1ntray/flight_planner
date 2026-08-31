import type {
  AvinorEaipBatchEditionConfig,
  AvinorEaipImportConfig,
} from './types';

export type AvinorEaipEditionConfig = Omit<
  AvinorEaipImportConfig,
  'retrievedAtUtc' | 'importedAtUtc'
>;

/**
 * This is intentionally a fixed eAIP edition. Selecting or discovering a
 * newer AIRAC edition is a separate update to the importer configuration.
 */
export const NORWAY_EAIP_EDITION: AvinorEaipBatchEditionConfig = {
  datasetId: 'avinor-eaip-2026-06-11',
  editionLabel: '2026-06-11-AIRAC',
  // The inspected page leaves EM.AIRAC blank, so no cycle number is inferred.
  airacCycle: null,
  effectiveFromUtc: '2026-06-11T00:00:00Z',
  revisionId: 'AIP AMDT 04/2026',
  indexUrl:
    'https://aim-prod.avinor.no/no/AIP/View/Index/154/2026-06-11-AIRAC/html/eAIP/EN-AD-1.3-en-GB.html',
  enr21Url:
    'https://aim-prod.avinor.no/no/AIP/View/Index/154/2026-06-11-AIRAC/html/eAIP/EN-ENR-2.1-en-GB.html',
};

export const ENDU_EAIP_EDITION: AvinorEaipEditionConfig = {
  ...NORWAY_EAIP_EDITION,
  sourceAerodrome: 'ENDU',
  sourceUrl:
    'https://aim-prod.avinor.no/no/AIP/View/Index/154/2026-06-11-AIRAC/html/eAIP/EN-AD-2.ENDU-en-GB.html',
};
