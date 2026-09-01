import { describe, expect, it } from 'vitest';

import type { AeronauticalDatasetRef } from '../../../src/domain';
import {
  importPreparedVacReportingPoints,
  type PreparedVacReportingPointDataset,
} from './preparedVacReportingPoints';

const dataset: AeronauticalDatasetRef = {
  datasetId: 'test', providerId: 'avinor', sourceName: 'eAIP', airacCycle: null,
  effectiveFromUtc: '2026-06-11T00:00:00Z', effectiveToUtc: null,
};

const prepared: PreparedVacReportingPointDataset = {
  schemaVersion: 1,
  provider: 'Avinor',
  sourceType: 'VAC PDF',
  editionLabel: '2026-06-11-AIRAC',
  effectiveDate: '2026-06-11',
  coordinateMethod: 'published-coordinate',
  charts: [
    {
      aerodromeIdentifier: 'ENBR', sourceUrl: 'https://example.test/one.pdf', sourcePage: '1',
      points: [{ name: 'SUNOS', latitudeDms: '601106N', longitudeDms: '0052809E' }],
    },
    {
      aerodromeIdentifier: 'ENBR', sourceUrl: 'https://example.test/two.pdf', sourcePage: '1',
      points: [
        { name: 'SUNOS', latitudeDms: '601106N', longitudeDms: '0052809E' },
        { name: 'GANSO', latitudeDms: '602422N', longitudeDms: '0050028E' },
      ],
    },
    {
      aerodromeIdentifier: 'ENHF', sourceUrl: 'https://example.test/empty.pdf', sourcePage: '1',
      points: [],
    },
  ],
  aerodromesWithoutVac: ['ENEG'],
};

describe('importPreparedVacReportingPoints', () => {
  it('deduplicates a point published on two VAC pages and retains both references', () => {
    const result = importPreparedVacReportingPoints(prepared, dataset);
    expect(result.features.map(({ identifier }) => identifier).sort()).toEqual(['GANSO', 'SUNOS']);
    expect(result.details.find(({ ref }) => ref.featureId === 'reporting-point:enbr:sunos')
      ?.sourceReferences).toHaveLength(2);
    expect(result.warnings.map(({ code }) => code).sort()).toEqual([
      'vac-has-no-published-coordinate-table', 'vac-not-published',
    ]);
  });

  it('limits prepared data and warnings to selected aerodromes', () => {
    const result = importPreparedVacReportingPoints(prepared, dataset, new Set(['ENBR']));
    expect(result.features).toHaveLength(2);
    expect(result.warnings).toEqual([]);
  });
});
