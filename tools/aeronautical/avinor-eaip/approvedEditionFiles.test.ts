import { describe, expect, it } from 'vitest';

import {
  renderApprovedEditionSource,
  renderApprovedRepositorySource,
} from './approvedEditionFiles';

const candidate = {
  datasetId: 'avinor-eaip-2026-09-03',
  editionLabel: '2026-09-03-AIRAC',
  airacCycle: null,
  effectiveFromUtc: '2026-09-03T00:00:00Z',
  revisionId: 'AIP AMDT 05/2026',
  indexUrl: 'https://aim-prod.avinor.no/no/AIP/View/Index/155/2026-09-03-AIRAC/html/eAIP/EN-AD-1.3-en-GB.html',
  enr21Url: 'https://aim-prod.avinor.no/no/AIP/View/Index/155/2026-09-03-AIRAC/html/eAIP/EN-ENR-2.1-en-GB.html',
  enr22Url: 'https://aim-prod.avinor.no/no/AIP/View/Index/155/2026-09-03-AIRAC/html/eAIP/EN-ENR-2.2-en-GB.html',
} as const;

describe('approved AIRAC selector generation', () => {
  it('renders an exact pinned edition and derived ENDU source', () => {
    const source = renderApprovedEditionSource(candidate);
    expect(source).toContain("datasetId: \"avinor-eaip-2026-09-03\"");
    expect(source).toContain("revisionId: \"AIP AMDT 05/2026\"");
    expect(source).toContain('EN-AD-2.ENDU-en-GB.html');
    expect(renderApprovedEditionSource(candidate)).toBe(source);
  });

  it('renders only a validated versioned repository import', () => {
    expect(renderApprovedRepositorySource(candidate.datasetId)).toContain(
      "./data/avinor-eaip-2026-09-03.json",
    );
    expect(() => renderApprovedRepositorySource('../unsafe')).toThrow(/Unsafe/);
  });
});
