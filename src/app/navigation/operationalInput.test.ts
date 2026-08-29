import { describe, expect, it } from 'vitest';

import { PROJECT_AIRCRAFT_DEFINITION } from '../../domain';
import {
  createEmptyOperationalInputDraft,
  createOperationalInputDraft,
  parseOperationalInputDraft,
} from './operationalInput';

describe('operational input parsing', () => {
  it('keeps untouched loading inputs optional while retaining defaults', () => {
    const draft = createEmptyOperationalInputDraft();
    expect(draft.extraFuelLitres).toBe('18');
    expect(draft.finalReserveMinutes).toBe('60');
    expect(parseOperationalInputDraft(draft, PROJECT_AIRCRAFT_DEFINITION))
      .toEqual({ status: 'empty' });
  });

  it('round-trips loading, stop, and alternate inputs', () => {
    const inputs = {
      fuelOnboardLitres: 224,
      leftSeatMassKg: 80,
      rightSeatMassKg: 75,
      baggageMassKg: 10,
      extraFuelLitres: 18,
      finalReserveMinutes: 60,
      sectorOperations: [{
        waypointId: 'B',
        kind: 'full-stop' as const,
        departureFuelOnboardLitres: 180,
      }],
      alternate: {
        waypoint: {
          id: 'ALT',
          name: 'ENAL',
          position: { latitude: 62.56, longitude: 6.11 },
        },
        elevationFtMsl: 70,
        weather: { qnhHpa: 1015, isaDeviationC: 2 },
        altitudeFtMsl: 4500,
      },
    };
    expect(parseOperationalInputDraft(
      createOperationalInputDraft(inputs),
      PROJECT_AIRCRAFT_DEFINITION,
      ['B'],
    )).toEqual({ status: 'valid', value: inputs });
  });

  it('rejects excessive fuel and baggage', () => {
    expect(parseOperationalInputDraft({
      ...createEmptyOperationalInputDraft(),
      fuelOnboardLitres: '225',
      leftSeatMassKg: '80',
      rightSeatMassKg: '0',
      baggageMassKg: '0',
    }, PROJECT_AIRCRAFT_DEFINITION)).toMatchObject({
      status: 'invalid',
      message: expect.stringContaining('224'),
    });
    expect(parseOperationalInputDraft({
      ...createEmptyOperationalInputDraft(),
      fuelOnboardLitres: '100',
      leftSeatMassKg: '80',
      rightSeatMassKg: '0',
      baggageMassKg: '21',
    }, PROJECT_AIRCRAFT_DEFINITION)).toMatchObject({
      status: 'invalid',
      message: expect.stringContaining('20'),
    });
  });
});

