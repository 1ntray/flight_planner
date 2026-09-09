import type { AeronauticalSourceReference, VacChartGroundControlPoint, Wgs84Bounds } from '../../../src/domain';

export interface VacPreparationPoint {
  readonly label: string;
  /** Pixel-independent coordinate in PDF points, measured from the top-left. */
  readonly sourcePointX: number;
  readonly sourcePointY: number;
  readonly publishedLatitude: string;
  readonly publishedLongitude: string;
  readonly reviewNote: string;
}

export interface VacPreparationConfig {
  readonly configVersion: 1;
  /** Increment whenever reviewed preparation inputs or raster settings change. */
  readonly preparationRevision: number;
  readonly id: string;
  readonly icao: string;
  readonly aerodromeFeatureId: string;
  readonly title: string;
  readonly chartDate: string;
  readonly sourceUrl: string;
  readonly sourcePdfSha256: string;
  readonly page: number;
  readonly renderDpi: number;
  readonly cropPdfPoints: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number };
  readonly transformOrder: 1 | 2 | 3;
  readonly minimumZoom: number;
  readonly maximumZoom: number;
  readonly defaultOpacity: number;
  readonly qualityThresholds: { readonly maximumRmsMeters: number; readonly maximumErrorMeters: number };
  readonly fitPoints: readonly VacPreparationPoint[];
  readonly validationPoints: readonly VacPreparationPoint[];
  readonly sourceReferences: readonly AeronauticalSourceReference[];
}

export interface VacPointResidual {
  readonly label: string;
  readonly horizontalErrorMeters: number;
  readonly pixelError: number;
  readonly predictedLatitude: number;
  readonly predictedLongitude: number;
}

export interface VacValidationMetrics {
  readonly residualRmsPixels: number;
  readonly maximumResidualPixels: number;
  readonly residualRmsMeters: number;
  readonly maximumResidualMeters: number;
  readonly fitPointCount: number;
  readonly validationPointCount: number;
  readonly residuals: readonly VacPointResidual[];
}

export interface VacPreparationReport {
  readonly reportVersion: 1;
  readonly preparationTool: { readonly name: 'flight-planner-vac-preparer'; readonly version: 1 };
  readonly configVersion: 1;
  readonly preparationRevision: number;
  readonly chartId: string;
  readonly sourceUrl: string;
  readonly sourcePdfFilename: string;
  readonly sourcePdfSha256: string;
  readonly retrievedAtUtc: string;
  readonly preparedAtUtc: string;
  readonly sourcePage: number;
  readonly renderDpi: number;
  readonly cropPixels: { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
  readonly tools: Readonly<Record<string, string>>;
  readonly targetCrs: 'EPSG:3857';
  readonly transform: string;
  readonly bounds: Wgs84Bounds;
  readonly tileCount: number;
  readonly tileBytes: number;
  readonly tileUrlTemplate: string;
  readonly outputTileDirectory: string;
  readonly validation: VacValidationMetrics;
  readonly fitPoints: readonly VacChartGroundControlPoint[];
  readonly validationPoints: readonly VacChartGroundControlPoint[];
  readonly thresholds: VacPreparationConfig['qualityThresholds'];
  readonly passed: boolean;
}
