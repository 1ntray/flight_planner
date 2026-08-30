import { describe, expect, it } from 'vitest';

import { PROJECT_AIRCRAFT_DEFINITION } from '../../domain';
import {
  createEmptyOperationalInputDraft,
  createOperationalInputDraft,
  parseOperationalInputDraft,
} from './operationalInput';

describe('operational input parsing', () => {
  it('starts with the configured loading and reserve defaults', () => {
    const draft = createEmptyOperationalInputDraft();
    expect(draft.extraFuelLitres).toBe('18');
    expect(draft.finalReserveLitres).toBe('36');
    expect(draft.fuelOnboardLitres).toBe('224');
    expect(draft.leftSeatMassKg).toBe('56');
    expect(draft.rightSeatMassKg).toBe('0');
    expect(draft.baggageMassKg).toBe('15');
    expect(parseOperationalInputDraft(draft, PROJECT_AIRCRAFT_DEFINITION))
      .toMatchObject({ status: 'valid' });
  });

  it('round-trips loading, stop, and alternate inputs', () => {
    const inputs = {
      fuelOnboardLitres: 224,
      leftSeatMassKg: 80,
      rightSeatMassKg: 75,
      baggageMassKg: 10,
      extraFuelLitres: 18,
      finalReserveLitres: 36,
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
        plannedAltitudeFtMsl: 2500,
        distanceNm: 45,
        timeMinutes: 30,
        fuelLitres: 18,
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
