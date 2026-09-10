import type {
  AeronauticalSourceReference,
  Wgs84Bounds,
} from './aeronautical';

export interface VacChartGroundControlPoint {
  readonly label?: string;
  readonly reviewNote?: string;
  readonly pixelX: number;
  readonly pixelY: number;
  readonly latitude: number;
  readonly longitude: number;
}

export interface VacChartManifest {
  readonly id: string;
  readonly aerodromeFeatureId: string;
  readonly title: string;
  readonly chartDate: string;
  readonly sourcePdfSha256?: string;
  /** One prewarped Web Mercator image, preferred for compact national coverage. */
  readonly imageUrl?: string;
  /** Legacy/prepared XYZ pyramid. Exactly one raster source must be present. */
  readonly tileUrlTemplate?: string;
  readonly targetCrs: 'EPSG:3857';
  readonly bounds: Wgs84Bounds;
  readonly minimumZoom: number;
  readonly maximumZoom: number;
  readonly defaultOpacity: number;
  readonly groundControlPoints: readonly VacChartGroundControlPoint[];
  readonly validation?: {
    readonly residualRmsPixels: number;
    readonly maximumResidualPixels: number;
    readonly residualRmsMeters?: number;
    readonly maximumResidualMeters?: number;
    readonly fitPointCount?: number;
    readonly validationPointCount?: number;
    readonly qualityThresholds?: {
      readonly maximumRmsMeters: number;
      readonly maximumErrorMeters: number;
    };
  };
  readonly sourceReferences: readonly AeronauticalSourceReference[];
}
