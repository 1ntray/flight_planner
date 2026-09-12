import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { OFP_NAVLOG_COLUMN, OFP_TEMPLATE_LAYOUT, type OfpBox } from './ofpTemplateLayout';
import type {
  OfpNavlogRow,
  OfpPdfModel,
  OfpRunwayPerformanceModel,
  OfpWeightBalanceRow,
} from './ofpPdfModel';
import {
  formatAirportWind, formatDistance, formatDurationHhMm,
  formatHeading, formatIncrement, formatNavlogDirections, formatOptionalNumber,
  formatTimeMinutes, formatVariation, formatWind, formatWindCorrection,
} from './ofpFormatting';

export class OfpPdfGenerationError extends Error {}

const TEXT_COLOR = rgb(0.08, 0.1, 0.14);
const DEFAULT_FONT_SIZE = 6.4;
const SMALL_FONT_SIZE = 5.8;

function printable(value: string | null | undefined): value is string {
  return value !== null && value !== undefined && value.trim() !== '';
}

function fitFontSize(font: PDFFont, text: string, width: number, preferred: number): number {
  let size = preferred;
  while (size > 4.5 && font.widthOfTextAtSize(text, size) > width) size -= 0.25;
  return size;
}

function drawCenteredText(page: PDFPage, font: PDFFont, value: string | null | undefined, box: OfpBox, preferred = DEFAULT_FONT_SIZE): void {
  if (!printable(value)) return;
  const size = fitFontSize(font, value, box.width, preferred);
  const textWidth = font.widthOfTextAtSize(value, size);
  page.drawText(value, { x: box.x - textWidth / 2, y: box.y - size / 3, size, font, color: TEXT_COLOR });
}

function drawRightAlignedText(page: PDFPage, font: PDFFont, value: string | null | undefined, box: OfpBox, preferred = DEFAULT_FONT_SIZE): void {
  if (!printable(value)) return;
  const size = fitFontSize(font, value, box.width, preferred);
  page.drawText(value, { x: box.x + box.width / 2 - font.widthOfTextAtSize(value, size), y: box.y - size / 3, size, font, color: TEXT_COLOR });
}

function drawValue(page: PDFPage, font: PDFFont, value: string | null | undefined, box: OfpBox, preferred = DEFAULT_FONT_SIZE): void {
  drawCenteredText(page, font, value, box, preferred);
}

function navBox(column: number, y: number): OfpBox {
  const entry = OFP_TEMPLATE_LAYOUT.page1.navlog.columns[column]!;
  return { x: entry.x, y, width: entry.width };
}

function drawNavlogRow(page: PDFPage, font: PDFFont, row: OfpNavlogRow, y: number): void {
  const directions = formatNavlogDirections(row.trueTrackDeg, row.variationDegEast, row.trueHeadingDeg);
  const write = (column: number, value: string | null, size = SMALL_FONT_SIZE) => drawValue(page, font, value, navBox(column, y), size);
  write(OFP_NAVLOG_COLUMN.from, row.from); write(OFP_NAVLOG_COLUMN.tas, formatOptionalNumber(row.tasKt));
  write(OFP_NAVLOG_COLUMN.trueTrack, formatHeading(directions.trueTrackDeg)); write(OFP_NAVLOG_COLUMN.variation, formatVariation(directions.variationDegEast));
  write(OFP_NAVLOG_COLUMN.magneticTrack, formatHeading(directions.magneticTrackDeg)); write(OFP_NAVLOG_COLUMN.wind, formatWind(row.wind));
  write(OFP_NAVLOG_COLUMN.windCorrection, formatWindCorrection(row.windCorrectionDeg ?? directions.windCorrectionDeg));
  write(OFP_NAVLOG_COLUMN.accumulatedDistance, formatDistance(row.accumulatedDistanceNm)); write(OFP_NAVLOG_COLUMN.accumulatedTime, formatTimeMinutes(row.accumulatedTimeSeconds));
  write(OFP_NAVLOG_COLUMN.fuelFlow, formatOptionalNumber(row.fuelFlowLph)); write(OFP_NAVLOG_COLUMN.intermediateFuel, formatIncrement(row.accumulatedFuelLitres, row.intermediateFuelLitres));
  write(OFP_NAVLOG_COLUMN.accumulatedFuel, formatOptionalNumber(row.accumulatedFuelLitres)); write(OFP_NAVLOG_COLUMN.to, row.to);
  write(OFP_NAVLOG_COLUMN.msa, formatOptionalNumber(row.minimumSafeAltitudeFtMsl)); write(OFP_NAVLOG_COLUMN.plannedAltitude, formatOptionalNumber(row.plannedAltitudeFtMsl));
  write(OFP_NAVLOG_COLUMN.magneticHeading, formatHeading(directions.magneticHeadingDeg)); write(OFP_NAVLOG_COLUMN.groundSpeed, formatOptionalNumber(row.groundSpeedKt));
  write(OFP_NAVLOG_COLUMN.intermediateDistance, formatIncrement(row.accumulatedDistanceNm, row.intermediateDistanceNm)); write(OFP_NAVLOG_COLUMN.intermediateTime, formatIncrement(row.accumulatedTimeSeconds, row.intermediateTimeSeconds, 60));
  // ETO/ATO/Diff are operational actual-time fields on this form and remain blank.
  write(OFP_NAVLOG_COLUMN.difference, formatTimeMinutes(row.timeDifferenceSeconds)); write(OFP_NAVLOG_COLUMN.estimatedFuelRemaining, formatOptionalNumber(row.estimatedFuelRemainingLitres));
  write(OFP_NAVLOG_COLUMN.actualFuelRemaining, formatOptionalNumber(row.actualFuelRemainingLitres)); write(OFP_NAVLOG_COLUMN.frequency, row.frequency);
}

function drawWeightBalanceRow(page: PDFPage, font: PDFFont, value: OfpWeightBalanceRow, y: number, includeArm: boolean): void {
  const layout = OFP_TEMPLATE_LAYOUT.page2.weightBalance;
  drawValue(page, font, formatOptionalNumber(value.massKg), { x: layout.massX, y, width: 42 });
  if (includeArm) drawValue(page, font, formatOptionalNumber(value.armM, 3), { x: layout.armX, y, width: 42 });
  drawValue(page, font, formatOptionalNumber(value.momentKgm), { x: layout.momentX, y, width: 46 });
}

function formatDistanceMetres(value: number | null): string | null {
  return value === null || !Number.isFinite(value) ? null : `${Math.round(value)} m`;
}

type RunwayWorksheetLayout = {
  readonly uncorrectedDistance: OfpBox;
  readonly headwind: OfpBox;
  readonly runwayState: OfpBox;
  readonly rcc: OfpBox;
  readonly correction: OfpBox;
  readonly correctedDistance: OfpBox;
  readonly requiredDistance: OfpBox;
  readonly availableDistance: OfpBox;
};

function drawRunwayWorksheet(page: PDFPage, font: PDFFont, value: OfpRunwayPerformanceModel | null, layout: RunwayWorksheetLayout): void {
  if (value === null) return;
  drawValue(page, font, formatDistanceMetres(value.uncorrectedDistanceM), layout.uncorrectedDistance);
  drawValue(page, font, formatOptionalNumber(value.headwindKt), layout.headwind);
  drawValue(page, font, value.runwayState, layout.runwayState, SMALL_FONT_SIZE);
  drawValue(page, font, formatOptionalNumber(value.rcc), layout.rcc);
  drawValue(page, font, value.correctionPercent === null ? null : `${Math.round(value.correctionPercent)}%`, layout.correction);
  drawValue(page, font, formatDistanceMetres(value.correctedDistanceM), layout.correctedDistance);
  drawValue(page, font, formatDistanceMetres(value.requiredDistanceM), layout.requiredDistance);
  drawValue(page, font, formatDistanceMetres(value.availableDistanceM), layout.availableDistance);
}

export async function loadOfpTemplateBytes(): Promise<Uint8Array> {
  const templateUrl = `${import.meta.env.BASE_URL}ofp/Z242OFPMBv2.0.pdf`;
  const response = await fetch(templateUrl);
  if (!response.ok) throw new OfpPdfGenerationError(`The OFP template could not be loaded (${response.status}).`);
  return new Uint8Array(await response.arrayBuffer());
}

export async function generateOfpPdf(model: OfpPdfModel, templateBytes: Uint8Array): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(templateBytes);
  if (pdf.getPageCount() !== 2) throw new OfpPdfGenerationError('The OFP template must contain exactly two pages.');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const [firstPage, secondPage] = pdf.getPages();
  const page1 = firstPage!;
  const page2 = secondPage!;
  const page1Layout = OFP_TEMPLATE_LAYOUT.page1;
  drawValue(page1, font, model.page1.departureName, page1Layout.departure);
  drawValue(page1, font, model.page1.destinationName, page1Layout.destination);
  drawValue(page1, font, model.page1.dateUtcMs === null ? null : new Date(model.page1.dateUtcMs).toISOString().slice(0, 10), page1Layout.date);
  drawValue(page1, font, model.page1.registration, page1Layout.registration);
  model.page1.navlogRows.forEach((row, index) => drawNavlogRow(page1, font, row, page1Layout.navlog.rowY[index]!));
  drawNavlogRow(page1, font, { kind: 'leg', from: null, to: null, tasKt: null, trueTrackDeg: null, variationDegEast: null, trueHeadingDeg: null, wind: null, windCorrectionDeg: null, accumulatedDistanceNm: model.page1.totals.accumulatedDistanceNm, accumulatedTimeSeconds: model.page1.totals.accumulatedTimeSeconds, fuelFlowLph: null, intermediateFuelLitres: model.page1.totals.intermediateFuelLitres, accumulatedFuelLitres: model.page1.totals.accumulatedFuelLitres, minimumSafeAltitudeFtMsl: null, plannedAltitudeFtMsl: null, groundSpeedKt: null, intermediateDistanceNm: model.page1.totals.intermediateDistanceNm, intermediateTimeSeconds: model.page1.totals.intermediateTimeSeconds, estimatedTimeUtcMs: null, estimatedFuelRemainingLitres: model.page1.totals.estimatedFuelRemainingLitres, actualTimeUtcMs: null, timeDifferenceSeconds: null, actualFuelRemainingLitres: null, frequency: null }, page1Layout.navlog.totalY);
  if (model.page1.alternateRow !== null) drawNavlogRow(page1, font, model.page1.alternateRow, page1Layout.navlog.alternateY);
  if (model.page1.alternateTotals !== null) drawNavlogRow(page1, font, { kind: 'alternate', from: null, to: null, tasKt: null, trueTrackDeg: null, variationDegEast: null, trueHeadingDeg: null, wind: null, windCorrectionDeg: null, accumulatedDistanceNm: model.page1.alternateTotals.accumulatedDistanceNm, accumulatedTimeSeconds: model.page1.alternateTotals.accumulatedTimeSeconds, fuelFlowLph: null, intermediateFuelLitres: model.page1.alternateTotals.intermediateFuelLitres, accumulatedFuelLitres: model.page1.alternateTotals.accumulatedFuelLitres, minimumSafeAltitudeFtMsl: null, plannedAltitudeFtMsl: null, groundSpeedKt: null, intermediateDistanceNm: model.page1.alternateTotals.intermediateDistanceNm, intermediateTimeSeconds: model.page1.alternateTotals.intermediateTimeSeconds, estimatedTimeUtcMs: null, estimatedFuelRemainingLitres: model.page1.alternateTotals.estimatedFuelRemainingLitres, actualTimeUtcMs: null, timeDifferenceSeconds: null, actualFuelRemainingLitres: null, frequency: null }, page1Layout.navlog.alternateTotalY);

  const page2Layout = OFP_TEMPLATE_LAYOUT.page2;
  drawValue(page2, font, model.page2.registration, page2Layout.registration);
  const wb = model.page2.weightAndBalance;
  if (wb !== null) [wb.basicEmpty, wb.leftSeat, wb.rightSeat, wb.mainFuel, wb.auxiliaryFuel, wb.baggage, wb.takeoff, wb.enrouteAuxiliaryFuel, wb.enrouteMainFuel, wb.landing].forEach((value, index) => drawWeightBalanceRow(page2, font, value, page2Layout.weightBalance.rowsY[index]!, index === 0 || index === 6 || index === 9));
  const fuel = model.page2.fuelRequirements;
  if (fuel !== null) {
    const lines = [fuel.trip, fuel.alternate, fuel.extra, fuel.finalReserve, fuel.totalRequired, { litres: fuel.totalOnboard.litres, kilograms: fuel.totalOnboard.kilograms, timeMinutes: null }, { litres: null, kilograms: null, timeMinutes: fuel.enduranceMinutes }];
    lines.forEach((line, index) => { const y = page2Layout.fuelRequirements.rowsY[index]!; drawValue(page2, font, formatOptionalNumber(line.litres), { x: page2Layout.fuelRequirements.litresX, y, width: 42 }); drawValue(page2, font, formatOptionalNumber(line.kilograms), { x: page2Layout.fuelRequirements.kilogramsX, y, width: 42 }); drawValue(page2, font, formatDurationHhMm(line.timeMinutes), { x: page2Layout.fuelRequirements.timeX, y, width: 42 }); });
  }
  const cruise = model.page2.cruise;
  const c = page2Layout.cruise;
  [[cruise.altitudeFtMsl, c.altitudeX], [cruise.oatC, c.oatX], [cruise.rpm, c.rpmX], [cruise.manifoldPressure, c.manifoldPressureX], [cruise.tasKt, c.tasX], [cruise.fuelFlowLph, c.fuelFlowX]].forEach(([value, x]) => drawValue(page2, font, formatOptionalNumber(value as number | null), { x: x as number, y: c.y, width: 30 }));
  for (const [aerodrome, layout] of [[model.page2.departureAerodrome, page2Layout.departureAerodrome], [model.page2.destinationAerodrome, page2Layout.destinationAerodrome]] as const) {
    drawValue(page2, font, aerodrome.name, layout.name); drawValue(page2, font, aerodrome.runway, layout.runway); drawValue(page2, font, formatOptionalNumber(aerodrome.elevationFtMsl), layout.elevation); drawValue(page2, font, formatAirportWind(aerodrome.wind), layout.wind); drawValue(page2, font, formatOptionalNumber(aerodrome.crosswindKt), layout.crosswind); drawValue(page2, font, formatOptionalNumber(aerodrome.pressureAltitudeFt), layout.pressureAltitude); drawValue(page2, font, formatOptionalNumber(aerodrome.qnhHpa), layout.qnh); drawValue(page2, font, formatOptionalNumber(aerodrome.temperatureC), layout.temperature); drawValue(page2, font, formatOptionalNumber(aerodrome.densityAltitudeFt), layout.densityAltitude);
  }
  drawValue(page2, font, formatOptionalNumber(model.page2.crosswindLimitKt), page2Layout.crosswindLimit.departure); drawValue(page2, font, formatOptionalNumber(model.page2.crosswindLimitKt), page2Layout.crosswindLimit.destination);
  drawValue(page2, font, formatDurationHhMm(model.page2.minimumFlight.timeMinutes), page2Layout.minimumFlight.time); drawValue(page2, font, model.page2.minimumFlight.requiredFuelRemainingLitres === null ? '-' : formatOptionalNumber(model.page2.minimumFlight.requiredFuelRemainingLitres), page2Layout.minimumFlight.fuel);
  drawRunwayWorksheet(page2, font, model.page2.departureRunwayPerformance, page2Layout.takeoffWorksheet);
  drawRunwayWorksheet(page2, font, model.page2.destinationRunwayPerformance, page2Layout.landingWorksheet);
  drawRightAlignedText(page2, font, model.page2.dateUtcMs === null ? null : new Date(model.page2.dateUtcMs).toISOString().slice(0, 10), page2Layout.date);
  return pdf.save();
}
