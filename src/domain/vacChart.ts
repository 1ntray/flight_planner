import type {
  AeronauticalSourceReference,
  Wgs84Bounds,
} from './aeronautical';

export interface VacChartGroundControlPoint {
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
  readonly tileUrlTemplate: string;
  readonly targetCrs: 'EPSG:3857';
  readonly bounds: Wgs84Bounds;
  readonly minimumZoom: number;
  readonly maximumZoom: number;
  readonly defaultOpacity: number;
  readonly groundControlPoints: readonly VacChartGroundControlPoint[];
  readonly validation?: {
    readonly residualRmsPixels: number;
    readonly maximumResidualPixels: number;
  };
  readonly sourceReferences: readonly AeronauticalSourceReference[];
}
