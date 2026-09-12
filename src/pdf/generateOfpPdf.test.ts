import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { generateOfpPdf } from './generateOfpPdf';
import type { OfpPdfModel } from './ofpPdfModel';

const emptyRow = { kind: 'leg' as const, from: null, to: null, tasKt: null, trueTrackDeg: null, variationDegEast: null, trueHeadingDeg: null, wind: null, windCorrectionDeg: null, accumulatedDistanceNm: null, accumulatedTimeSeconds: null, fuelFlowLph: null, intermediateFuelLitres: null, accumulatedFuelLitres: null, minimumSafeAltitudeFtMsl: null, plannedAltitudeFtMsl: null, groundSpeedKt: null, intermediateDistanceNm: null, intermediateTimeSeconds: null, estimatedTimeUtcMs: null, estimatedFuelRemainingLitres: null, actualTimeUtcMs: null, timeDifferenceSeconds: null, actualFuelRemainingLitres: null, frequency: null, plannedFrequencies: [] };

const model: OfpPdfModel = {
  page1: { departureName: 'ENDU', destinationName: 'ENEV', takeoffTimeUtcMs: Date.UTC(2026, 8, 11, 8), landingTimeUtcMs: Date.UTC(2026, 8, 11, 9), dateUtcMs: Date.UTC(2026, 8, 11), registration: 'LN-UPS', flightTimeSeconds: 3600, fuelDepartureLitres: 224, fuelRemainingLitres: 180, navlogRows: [{ ...emptyRow, from: 'ENDU', to: 'ENEV', tasKt: 107, trueTrackDeg: 20, variationDegEast: 10, trueHeadingDeg: 22, accumulatedDistanceNm: 50, accumulatedTimeSeconds: 1800, intermediateDistanceNm: 50, intermediateTimeSeconds: 1800 }], totals: { accumulatedDistanceNm: 50, accumulatedTimeSeconds: 1800, intermediateFuelLitres: 18, accumulatedFuelLitres: 18, intermediateDistanceNm: 50, intermediateTimeSeconds: 1800, estimatedFuelRemainingLitres: 180 }, alternateRow: null, alternateTotals: null },
  page2: {
    registration: 'LN-UPS',
    weightAndBalance: {
      basicEmpty: { massKg: 763, armM: 0.658, momentKgm: 502 },
      leftSeat: { massKg: 56, armM: 0.956, momentKgm: 54 },
      rightSeat: { massKg: 0, armM: 0.956, momentKgm: 0 },
      mainFuel: { massKg: 84, armM: 0.75, momentKgm: 63 },
      auxiliaryFuel: { massKg: 13, armM: 0.948, momentKgm: 12 },
      baggage: { massKg: 15, armM: 1.766, momentKgm: 26 },
      takeoff: { massKg: 930, armM: 0.706, momentKgm: 657 },
      enrouteAuxiliaryFuel: { massKg: -13, armM: 0.948, momentKgm: -12 },
      enrouteMainFuel: { massKg: -2, armM: 0.75, momentKgm: -1 },
      landing: { massKg: 916, armM: 0.703, momentKgm: 643 },
    },
    fuelRequirements: {
      trip: { litres: 21, kilograms: 15, timeMinutes: 33 },
      alternate: { litres: 18, kilograms: 13, timeMinutes: 30 },
      extra: { litres: 18, kilograms: 13, timeMinutes: 30 },
      finalReserve: { litres: 36, kilograms: 26, timeMinutes: 60 },
      totalRequired: { litres: 93, kilograms: 67, timeMinutes: 153 },
      totalOnboard: { litres: 134, kilograms: 96 },
      enduranceMinutes: 222,
    },
    cruise: { altitudeFtMsl: 2500, oatC: null, rpm: null, manifoldPressure: null, tasKt: 107, fuelFlowLph: 36 },
    departureAerodrome: { name: 'ENDU', runway: '10', elevationFtMsl: 254, qnhHpa: 1012, temperatureC: 13, wind: { kind: 'fixed', directionFromTrueDeg: 180, speedKt: 4 }, crosswindKt: 4, pressureAltitudeFt: 281, densityAltitudeFt: 41, flaps: null },
    destinationAerodrome: { name: 'ENEV', runway: '17', elevationFtMsl: 85, qnhHpa: 1012, temperatureC: 13, wind: { kind: 'fixed', directionFromTrueDeg: 170, speedKt: 6 }, crosswindKt: 0, pressureAltitudeFt: 112, densityAltitudeFt: -128, flaps: null },
    crosswindLimitKt: 9,
    departureRunwayPerformance: { uncorrectedDistanceM: 350, headwindKt: 8, runwayState: 'DRY', rcc: 6, correctionPercent: 0, correctedDistanceM: 322, performanceFactorPercent: 25, requiredDistanceM: 403, availableDistanceM: 500 },
    destinationRunwayPerformance: { uncorrectedDistanceM: 380, headwindKt: -3, runwayState: 'WET', rcc: 5, correctionPercent: 0, correctedDistanceM: 418, performanceFactorPercent: 43, requiredDistanceM: 598, availableDistanceM: 600 },
    minimumFlight: { timeMinutes: null, requiredFuelRemainingLitres: null },
    dateUtcMs: Date.UTC(2026, 8, 11),
  },
};

describe('OFP PDF generation', () => {
  it('produces a valid two-page PDF from a two-page template', async () => {
    const templateDocument = await PDFDocument.create();
    templateDocument.addPage([792, 612]);
    templateDocument.addPage([792, 612]);
    const template = await templateDocument.save();
    const bytes = await generateOfpPdf(model, template);
    expect(bytes.byteLength).toBeGreaterThan(1_000);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
  });

  it('rejects frequencies that cannot fit in the physical navlog rows', async () => {
    const templateDocument = await PDFDocument.create();
    templateDocument.addPage([792, 612]);
    templateDocument.addPage([792, 612]);
    const template = await templateDocument.save();
    await expect(generateOfpPdf({
      ...model,
      page1: {
        ...model.page1,
        navlogRows: [{ ...emptyRow, plannedFrequencies: Array.from({ length: 17 }, (_, index) => `118.${index.toString().padStart(3, '0')}`) }],
      },
    }, template)).rejects.toThrow('planned frequencies exceed the available rows');
  });
});
