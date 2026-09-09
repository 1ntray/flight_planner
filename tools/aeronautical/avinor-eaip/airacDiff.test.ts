import { describe, expect, it } from 'vitest';

import type { NormalizedAeronauticalDataset } from '../../../src/aeronautical/normalizedDataset';
import type { AeronauticalDatasetMetadata, AeronauticalFeatureRef } from '../../../src/domain';
import {
  compareAeronauticalDatasets,
  renderAiracChangeReport,
} from './airacDiff';

function dataset(
  edition: string,
  longitude = 18,
  frequency = '120.100',
): NormalizedAeronauticalDataset {
  const metadata: AeronauticalDatasetMetadata = {
    datasetId: `dataset-${edition}`,
    providerId: 'avinor',
    sourceName: 'eAIP',
    airacCycle: null,
    effectiveFromUtc: `${edition}T00:00:00Z`,
    effectiveToUtc: null,
    editionLabel: `${edition}-AIRAC`,
    retrievedAtUtc: `${edition}T01:00:00Z`,
    importedAtUtc: `${edition}T01:01:00Z`,
    sourceReference: 'https://example.test/index.html',
  };
  const ref: AeronauticalFeatureRef = {
    dataset: metadata,
    featureId: 'aerodrome:TEST',
    featureKind: 'aerodrome',
  };
  return {
    schemaVersion: 4,
    metadata,
    features: [{
      geometryType: 'point',
      ref,
      pointKind: 'aerodrome',
      identifier: 'TEST',
      name: 'Test aerodrome',
      suggestedWaypointName: 'TEST',
      position: { latitude: 69, longitude },
    }],
    featureDetails: [{
      detailKind: 'aerodrome',
      ref,
      icaoIdentifier: 'TEST',
      name: 'Test aerodrome',
      arpPosition: { latitude: 69, longitude },
      elevationFt: 100,
      runways: [],
      sourceReferences: [],
    }],
    atsServiceAreas: [],
    atsUnits: [],
    communicationServices: [{
      id: 'communication:test',
      serviceType: 'tower',
      publishedServiceType: 'TWR',
      callsign: 'Test Tower',
      frequencies: [{ valueMHz: frequency }],
      associations: [],
      sourceReferences: [],
    }],
    vacCharts: [],
  };
}

describe('AIRAC dataset comparison', () => {
  it('reports frequency and WGS84 coordinate changes using stable identities', () => {
    const report = compareAeronauticalDatasets(
      dataset('2026-06-11'),
      dataset('2026-09-03', 18.01, '120.200'),
      { warnings: [], vacReportingPointWarnings: [], failures: [] },
    );
    expect(report.notableChanges).toEqual(expect.arrayContaining([
      expect.stringMatching(/Aerodrome coordinate changed.*m$/),
      'Frequency assignments changed: communication:test',
    ]));
    expect(report.counts.find(({ label }) => label === 'Aerodromes')).toEqual({
      label: 'Aerodromes', before: 1, after: 1,
    });
  });

  it('renders a deterministic pull-request body with the approval boundary', () => {
    const comparison = compareAeronauticalDatasets(
      dataset('2026-06-11'),
      dataset('2026-09-03'),
      {
        warnings: [{
          sourceAerodrome: 'TEST',
          sourceUrl: 'https://example.test',
          code: 'fixture-warning',
          message: 'Fixture warning',
          aipSection: null,
        }],
        vacReportingPointWarnings: [],
        failures: [],
        supplementalData: {
          status: 'carried-forward',
          sourceDatasetId: 'dataset-2026-06-11',
          reportingPoints: 0,
          vacCharts: 0,
          reason: 'fixture',
        },
      },
    );
    const markdown = renderAiracChangeReport(comparison);
    expect(markdown).toContain('# AIRAC update: 2026-06-11-AIRAC → 2026-09-03-AIRAC');
    expect(markdown).toContain('| Communication services | 1 | 1 |');
    expect(markdown).toContain('| VAC chart manifests | 0 | 0 |');
    expect(markdown).toContain('- eAIP warnings: 1');
    expect(markdown).toContain('Merging this pull request is the human approval boundary');
    expect(renderAiracChangeReport(comparison)).toBe(markdown);
  });
});
