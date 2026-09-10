import controls from './national-vac-controls-2026-09-03.json';
import graticuleControlsData from './graticule-vac-controls-2026-09-03.json';
import remainingGraticuleControlsData from './graticule-vac-controls-remaining-2026-09-03.json';

import type { VacPreparationConfig, VacPreparationPoint } from '../types';

interface ReviewedControlPoint {
  readonly name: string;
  readonly latitudeDms?: string;
  readonly longitudeDms?: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly reviewNote?: string;
  readonly sourcePointX: number;
  readonly sourcePointY: number;
}

interface ReviewedChart {
  readonly icao: string;
  readonly chartKey?: string;
  readonly title: string;
  readonly chartDate: string;
  readonly sourceUrl: string;
  readonly sourcePdfSha256: string;
  readonly page: number;
  readonly cropPdfPoints: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number };
  readonly transformOrder?: 1 | 2;
  readonly minimumControlSpanFraction?: number;
  readonly points?: readonly ReviewedControlPoint[];
  readonly fitPoints?: readonly ReviewedControlPoint[];
  readonly validationPoints?: readonly ReviewedControlPoint[];
  readonly graticuleControl?: {
    readonly method: 'published-edge-graticule-second-order';
    readonly longitudeFitTickCount: number;
    readonly latitudeFitTickCount: number;
    readonly longitudeCoefficients: readonly number[];
    readonly latitudeCoefficients: readonly number[];
    readonly validationTicks: readonly {
      readonly edge: 'top' | 'bottom' | 'left' | 'right';
      readonly axis: 'latitude' | 'longitude';
      readonly sourcePointX: number;
      readonly sourcePointY: number;
      readonly value: number;
    }[];
  };
}

const reviewNote = 'Published VAC coordinate table matched to the centroid of the corresponding vector reporting-point triangle; independently validated by held-out published points.';

function graticuleTerms(x: number, y: number, chart: ReviewedChart, axis: 'latitude' | 'longitude'): readonly number[] {
  const crop = chart.cropPdfPoints;
  const normalizedX = (x - crop.left) / (crop.right - crop.left);
  const normalizedY = (y - crop.top) / (crop.bottom - crop.top);
  return axis === 'longitude'
    ? [1, normalizedX, normalizedY, normalizedX ** 2, normalizedX * normalizedY]
    : [1, normalizedX, normalizedY, normalizedX * normalizedY, normalizedY ** 2];
}

function predictGraticule(chart: ReviewedChart, x: number, y: number, axis: 'latitude' | 'longitude'): number {
  const control = chart.graticuleControl;
  if (control === undefined) throw new Error('VAC chart has no reviewed graticule control');
  const coefficients = axis === 'longitude' ? control.longitudeCoefficients : control.latitudeCoefficients;
  const terms = graticuleTerms(x, y, chart, axis);
  if (coefficients.length !== terms.length || coefficients.some((value) => !Number.isFinite(value))) {
    throw new Error(`Reviewed ${axis} graticule model has invalid coefficients`);
  }
  return terms.reduce((sum, term, index) => sum + term * coefficients[index]!, 0);
}

function graticulePoint(
  chart: ReviewedChart,
  label: string,
  x: number,
  y: number,
  latitude: number,
  longitude: number,
  reviewNote: string,
): VacPreparationPoint {
  return { label, sourcePointX: x, sourcePointY: y, latitude, longitude, reviewNote };
}

function graticuleControls(chart: ReviewedChart) {
  const control = chart.graticuleControl;
  if (control === undefined) throw new Error('VAC chart has no reviewed graticule control');
  if (control.longitudeFitTickCount < 10 || control.latitudeFitTickCount < 10 || control.validationTicks.length < 4) {
    throw new Error('Reviewed VAC graticule control has insufficient independent published ticks');
  }
  const crop = chart.cropPdfPoints;
  const fitPoints: VacPreparationPoint[] = [];
  const fractions = [0, 1 / 3, 2 / 3, 1] as const;
  for (const [row, yFraction] of fractions.entries()) {
    for (const [column, xFraction] of fractions.entries()) {
      const x = crop.left + xFraction * (crop.right - crop.left);
      const y = crop.top + yFraction * (crop.bottom - crop.top);
      fitPoints.push(graticulePoint(
        chart, `GRATICULE-GRID-${row + 1}-${column + 1}`, x, y,
        predictGraticule(chart, x, y, 'latitude'), predictGraticule(chart, x, y, 'longitude'),
        'Coordinate pair calculated from independently fitted published VAC latitude and longitude graticule ticks.',
      ));
    }
  }
  const validationPoints = control.validationTicks.map((tick, index) => graticulePoint(
    chart,
    `HELD-OUT-${tick.edge.toUpperCase()}-${tick.axis === 'latitude' ? 'LAT' : 'LON'}-${index + 1}`,
    tick.sourcePointX,
    tick.sourcePointY,
    tick.axis === 'latitude' ? tick.value : predictGraticule(chart, tick.sourcePointX, tick.sourcePointY, 'latitude'),
    tick.axis === 'longitude' ? tick.value : predictGraticule(chart, tick.sourcePointX, tick.sourcePointY, 'longitude'),
    `${tick.axis === 'latitude' ? 'Latitude' : 'Longitude'} is a deterministically held-out published VAC graticule tick; the orthogonal coordinate is calculated from its independently fitted graticule.`,
  ));
  return { fitPoints, validationPoints };
}

function preparationPoint(point: ReviewedControlPoint): VacPreparationPoint {
  return {
    label: point.name,
    sourcePointX: point.sourcePointX,
    sourcePointY: point.sourcePointY,
    ...(point.latitudeDms === undefined ? {} : { publishedLatitude: point.latitudeDms }),
    ...(point.longitudeDms === undefined ? {} : { publishedLongitude: point.longitudeDms }),
    ...(point.latitude === undefined ? {} : { latitude: point.latitude }),
    ...(point.longitude === undefined ? {} : { longitude: point.longitude }),
    reviewNote: point.reviewNote ?? reviewNote,
  };
}

function splitControls(chart: ReviewedChart) {
  if (chart.graticuleControl !== undefined) return graticuleControls(chart);
  if (chart.fitPoints !== undefined || chart.validationPoints !== undefined) {
    if (chart.fitPoints === undefined || chart.validationPoints === undefined) {
      throw new Error('Reviewed graticule controls require both fitPoints and validationPoints');
    }
    return {
      fitPoints: chart.fitPoints.map(preparationPoint),
      validationPoints: chart.validationPoints.map(preparationPoint),
    };
  }
  const { points = [], cropPdfPoints: crop } = chart;
  const minimumPoints = chart.transformOrder === 1 ? 6 : 8;
  if (points.length < minimumPoints) {
    throw new Error(`National VAC preparation requires at least ${minimumPoints} matched published points for transform order ${chart.transformOrder ?? 2}`);
  }
  const minimumSpan = chart.minimumControlSpanFraction ?? 0.35;
  // The source table is stably ordered by published name. This deterministic
  // split is deliberately independent of measured residuals. A later pair is
  // used only when the preferred pair would remove too much spatial coverage.
  const preferred: readonly [number, number] = [0, Math.floor(points.length / 3)];
  const candidates: Array<readonly [number, number]> = [preferred];
  for (let firstIndex = 0; firstIndex < points.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < points.length; secondIndex += 1) {
      if (firstIndex !== preferred[0] || secondIndex !== preferred[1]) candidates.push([firstIndex, secondIndex]);
    }
  }
  const selected = candidates.find(([firstIndex, secondIndex]) => {
    const fit = points.filter((_, index) => index !== firstIndex && index !== secondIndex);
    const width = Math.max(...fit.map(({ sourcePointX }) => sourcePointX)) - Math.min(...fit.map(({ sourcePointX }) => sourcePointX));
    const height = Math.max(...fit.map(({ sourcePointY }) => sourcePointY)) - Math.min(...fit.map(({ sourcePointY }) => sourcePointY));
    return width >= (crop.right - crop.left) * minimumSpan && height >= (crop.bottom - crop.top) * minimumSpan;
  });
  if (selected === undefined) throw new Error('No independent holdout pair preserves the required control-point extent');
  const first = points[selected[0]]!;
  const second = points[selected[1]]!;
  const validationNames = new Set([first.name, second.name]);
  return {
    fitPoints: points.filter((point) => !validationNames.has(point.name)).map(preparationPoint),
    validationPoints: points.filter((point) => validationNames.has(point.name)).map(preparationPoint),
  };
}

function createConfig(chart: ReviewedChart): VacPreparationConfig {
  const split = splitControls(chart);
  const adPage = `https://aim-prod.avinor.no/no/AIP/View/Index/155/2026-09-03-AIRAC/html/eAIP/EN-AD-2.${chart.icao}-en-GB.html`;
  return {
    configVersion: 1,
    preparationRevision: 3,
    id: `vac:${chart.icao}:${chart.chartDate}${chart.chartKey === undefined ? '' : `:${chart.chartKey}`}`,
    icao: chart.icao,
    aerodromeFeatureId: `aerodrome:${chart.icao}`,
    title: chart.title,
    chartDate: chart.chartDate,
    sourceUrl: chart.sourceUrl,
    sourcePdfSha256: chart.sourcePdfSha256,
    page: chart.page,
    renderDpi: 1200,
    cropPdfPoints: chart.cropPdfPoints,
    transformOrder: chart.transformOrder ?? 2,
    minimumZoom: 9,
    maximumZoom: 13,
    defaultOpacity: 0.75,
    outputFormat: 'webp-image',
    webpQuality: 92,
    qualityThresholds: { maximumRmsMeters: 100, maximumErrorMeters: 200 },
    minimumControlSpanFraction: chart.minimumControlSpanFraction ?? 0.35,
    ...split,
    sourceReferences: [
      {
        sourceType: 'vac-pdf',
        sourceAerodrome: chart.icao,
        sourceDocument: `Visual Approach Chart - ICAO AD 2 ${chart.icao} 6-1`,
        aipSection: `AD 2 ${chart.icao} 6-1`,
        sourcePage: String(chart.page),
        publishedIdentifier: `${chart.icao} VAC`,
        sourceReference: chart.sourceUrl,
      },
      {
        sourceType: 'eAIP-html',
        sourceAerodrome: chart.icao,
        sourceDocument: `AD 2 ${chart.icao}`,
        aipSection: 'AD 2.24',
        sourceReference: adPage,
      },
    ],
  };
}

export const NATIONAL_VAC_PREPARATIONS: readonly VacPreparationConfig[] =
  ([
    ...controls.charts,
    ...graticuleControlsData.charts,
    ...remainingGraticuleControlsData.charts,
  ] as readonly ReviewedChart[]).map(createConfig);
