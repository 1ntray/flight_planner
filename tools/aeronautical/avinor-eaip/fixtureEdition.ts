import type {
  AvinorEaipBatchEditionConfig,
  AvinorEaipImportConfig,
} from './types';

type FixtureAerodromeEdition = Omit<
  AvinorEaipImportConfig,
  'retrievedAtUtc' | 'importedAtUtc'
>;

/**
 * Immutable provenance for the checked-in 11 June 2026 parser fixtures.
 * Tests must not couple historical fixture HTML to the mutable approved pin.
 */
export const FIXTURE_EAIP_EDITION_2026_06_11: AvinorEaipBatchEditionConfig = {
  datasetId: 'avinor-eaip-2026-06-11',
  editionLabel: '2026-06-11-AIRAC',
  airacCycle: null,
  effectiveFromUtc: '2026-06-11T00:00:00Z',
  revisionId: 'AIP AMDT 04/2026',
  indexUrl:
    'https://aim-prod.avinor.no/no/AIP/View/Index/154/2026-06-11-AIRAC/html/eAIP/EN-AD-1.3-en-GB.html',
  enr21Url:
    'https://aim-prod.avinor.no/no/AIP/View/Index/154/2026-06-11-AIRAC/html/eAIP/EN-ENR-2.1-en-GB.html',
  enr22Url:
    'https://aim-prod.avinor.no/no/AIP/View/Index/154/2026-06-11-AIRAC/html/eAIP/EN-ENR-2.2-en-GB.html',
};

export const FIXTURE_ENDU_EDITION_2026_06_11: FixtureAerodromeEdition = {
  ...FIXTURE_EAIP_EDITION_2026_06_11,
  sourceAerodrome: 'ENDU',
  sourceUrl:
    'https://aim-prod.avinor.no/no/AIP/View/Index/154/2026-06-11-AIRAC/html/eAIP/EN-AD-2.ENDU-en-GB.html',
};
