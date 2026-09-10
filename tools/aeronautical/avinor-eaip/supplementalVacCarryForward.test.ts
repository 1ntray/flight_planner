import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { NormalizedAeronauticalDataset } from '../../../src/aeronautical/normalizedDataset';
import { NORWAY_EAIP_EDITION } from './edition';
import { approvedSupplementalFeatures } from './importPipeline';

const approved = JSON.parse(readFileSync(new URL(
  `../../../src/aeronautical/data/${NORWAY_EAIP_EDITION.datasetId}.json`,
  import.meta.url,
), 'utf8')) as NormalizedAeronauticalDataset;

describe('approved VAC carry-forward', () => {
  it('preserves the exact independently reviewed chart manifest and provenance', () => {
    const carried = approvedSupplementalFeatures(approved);
    expect(approved.vacCharts).toHaveLength(42);
    expect(carried.vacCharts).toEqual(approved.vacCharts);
    const endu = carried.vacCharts.find(({ id }) => id === 'vac:ENDU:2026-05-14');
    expect(endu).toMatchObject({
      id: 'vac:ENDU:2026-05-14',
      sourcePdfSha256: 'f93dd046804a5e00cf2b8a5baa76d5e5a4083a077fa6ff2429e2e88930e9b966',
      chartDate: '2026-05-14',
      imageUrl: 'aeronautical/vac/endu/2026-05-14-f93dd046-r3/chart.webp',
    });
    expect(endu?.sourceReferences.some(({ sourceType }) => sourceType === 'vac-pdf')).toBe(true);
  });
});
