import { describe, expect, it } from 'vitest';

import type { CommunicationService } from '../domain';
import {
  chooseOperatingFrequency,
  eligibleVfrPlanningFrequencies,
} from './communicationFrequencySelection';

function service(
  id: string,
  frequencies: CommunicationService['frequencies'],
): CommunicationService {
  return {
    id,
    serviceType: 'approach',
    publishedServiceType: 'APP',
    callsign: id,
    frequencies,
    associations: [],
    sourceReferences: [],
  };
}

describe('communication frequency selection', () => {
  it('excludes emergency, non-VHF, IFR-only and contingency assignments', () => {
    const frequencies = eligibleVfrPlanningFrequencies(service('APP', [
      { valueMHz: '118.805' },
      { valueMHz: '121.500' },
      { valueMHz: '275.300' },
      { valueMHz: '129.305', planningUse: 'contingency' },
      { valueMHz: '136.000', planningUse: 'ifr-only' },
    ]));
    expect(frequencies.map(({ valueMHz }) => valueMHz)).toEqual(['118.805']);
  });

  it('selects an explicitly published VFR assignment automatically', () => {
    const choice = chooseOperatingFrequency([service('Farris Approach', [
      { valueMHz: '124.355', planningUse: 'vfr' },
      { valueMHz: '134.055' },
    ])]);
    expect(choice).toMatchObject({
      status: 'selected',
      candidate: { frequency: { valueMHz: '124.355' } },
    });
  });

  it('uses a remembered per-service preference and otherwise preserves ambiguity', () => {
    const bardufoss = service('Bardufoss Approach/Radar', [
      { valueMHz: '118.805' },
      { valueMHz: '125.855' },
    ]);
    expect(chooseOperatingFrequency([bardufoss])).toMatchObject({
      status: 'ambiguous',
    });
    expect(chooseOperatingFrequency([bardufoss], {
      preferredFrequencyByServiceId: {
        'Bardufoss Approach/Radar': '125.855',
      },
    })).toMatchObject({
      status: 'selected',
      candidate: { frequency: { valueMHz: '125.855' } },
    });
  });
});
