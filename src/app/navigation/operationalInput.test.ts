import { describe, expect, it } from 'vitest';

import { PROJECT_AIRCRAFT_DEFINITION } from '../../domain';
import {
  createEmptyOperationalInputDraft,
  createOperationalInputDraft,
  createOperationalInputOverrides,
  parseOperationalInputDraft,
} from './operationalInput';

describe('operational input parsing', () => {
  it('keeps configured loading and reserve defaults as blank fields', () => {
    const draft = createEmptyOperationalInputDraft();
    expect(draft.extraFuelLitres).toBe('');
    expect(draft.finalReserveLitres).toBe('');
    expect(draft.fuelOnboardLitres).toBe('');
    expect(draft.leftSeatMassKg).toBe('');
    expect(draft.rightSeatMassKg).toBe('');
    expect(draft.baggageMassKg).toBe('');
    expect(parseOperationalInputDraft(draft, PROJECT_AIRCRAFT_DEFINITION))
      .toMatchObject({
        status: 'valid',
        value: {
          fuelOnboardLitres: 224,
          leftSeatMassKg: 56,
          rightSeatMassKg: 0,
          baggageMassKg: 15,
          extraFuelLitres: 18,
          finalReserveLitres: 36,
        },
      });
  });

  it('keeps standard values blank after save and restores only overrides', () => {
    const standardInputs = {
      fuelOnboardLitres: 224,
      leftSeatMassKg: 56,
      rightSeatMassKg: 0,
      baggageMassKg: 15,
      extraFuelLitres: 18,
      finalReserveLitres: 36,
      sectorOperations: [],
      patternPlans: [],
      alternate: null,
    };
    const customDraft = {
      ...createEmptyOperationalInputDraft(),
      leftSeatMassKg: '80',
      extraFuelLitres: '24',
    };

    expect(createOperationalInputDraft(standardInputs, null)).toMatchObject({
      fuelOnboardLitres: '',
      leftSeatMassKg: '',
      finalReserveLitres: '',
    });
    expect(
      createOperationalInputDraft(
        { ...standardInputs, leftSeatMassKg: 80, extraFuelLitres: 24 },
        createOperationalInputOverrides(customDraft),
      ),
    ).toMatchObject({ leftSeatMassKg: '80', extraFuelLitres: '24' });
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
      patternPlans: [],
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

  it('accepts whole-number patterns only at landing airports', () => {
    const draft = {
      ...createEmptyOperationalInputDraft(),
      patternPlans: [{ waypointId: 'DEST', patternCount: '2' }],
    };
    expect(parseOperationalInputDraft(
      draft,
      PROJECT_AIRCRAFT_DEFINITION,
      [],
      ['DEST'],
    )).toMatchObject({
      status: 'valid',
      value: { patternPlans: [{ waypointId: 'DEST', patternCount: 2 }] },
    });
    expect(parseOperationalInputDraft(
      { ...draft, patternPlans: [{ waypointId: 'DEST', patternCount: '1.5' }] },
      PROJECT_AIRCRAFT_DEFINITION,
      [],
      ['DEST'],
    )).toMatchObject({ status: 'invalid', message: expect.stringContaining('whole') });
  });

  it('treats a blank pattern field as the standard zero patterns', () => {
    expect(parseOperationalInputDraft({
      ...createEmptyOperationalInputDraft(),
      patternPlans: [{ waypointId: 'DEST', patternCount: '' }],
    }, PROJECT_AIRCRAFT_DEFINITION, [], ['DEST'])).toMatchObject({
      status: 'valid',
      value: { patternPlans: [] },
    });
  });

  it('persists only an explicit disabled arrival buffer', () => {
    const disabled = parseOperationalInputDraft({
      ...createEmptyOperationalInputDraft(),
      patternPlans: [{
        waypointId: 'DEST',
        patternCount: '',
        arrivalBufferEnabled: false,
      }],
    }, PROJECT_AIRCRAFT_DEFINITION, [], ['DEST']);

    expect(disabled).toMatchObject({
      status: 'valid',
      value: {
        patternPlans: [{
          waypointId: 'DEST',
          patternCount: 0,
          arrivalBufferEnabled: false,
        }],
      },
    });
  });
});
