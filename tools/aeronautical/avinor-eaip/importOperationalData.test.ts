import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { importEnr21Airspaces } from './importOperationalData';

const fixturePath = fileURLToPath(
  new URL('./fixtures/multi-service-enr21.html', import.meta.url),
);
const fixture = readFileSync(fixturePath, 'utf8');
const dataset = {
  datasetId: 'fixture',
  providerId: 'avinor',
  sourceName: 'eAIP',
  airacCycle: 'fixture',
  effectiveFromUtc: '2026-01-01T00:00:00Z',
  effectiveToUtc: null,
};

describe('Avinor ENR 2.1 operational importer', () => {
  it('keeps distinct published callsigns as distinct services', () => {
    const result = importEnr21Airspaces(fixture, {
      dataset,
      effectiveDate: '2026-01-01',
      sourceUrl: 'https://example.test/EN-ENR-2.1-en-GB.html',
      includedPublishedNames: ['TEST TMA'],
    });

    expect(result.communicationServices.map(({ callsign }) => callsign)).toEqual([
      'Test Director',
      'Test Final',
      'Test Approach',
    ]);
    expect(result.communicationServices[0]?.frequencies).toEqual([
      { valueMHz: '136.405', remarks: 'Main', planningUse: 'primary' },
      {
        valueMHz: '119.980',
        remarks: 'AVBL only when 136.405 U/S',
        planningUse: 'contingency',
      },
    ]);
    expect(result.communicationServices[1]?.frequencies[0]).toEqual({
      valueMHz: '128.905',
      remarks: 'IFR TFC only',
      planningUse: 'ifr-only',
    });
    expect(result.communicationServices[2]?.frequencies.map(
      ({ valueMHz, planningUse }) => ({ valueMHz, planningUse }),
    )).toEqual([
      { valueMHz: '118.480', planningUse: undefined },
      { valueMHz: '120.455', planningUse: undefined },
      { valueMHz: '129.305', planningUse: 'contingency' },
    ]);
    expect(result.featureDetails[0]).toMatchObject({
      detailKind: 'airspace',
      communicationServiceIds: result.communicationServices.map(({ id }) => id),
    });
  });
});
