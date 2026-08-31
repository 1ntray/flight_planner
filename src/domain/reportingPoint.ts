import type {
  AeronauticalFeatureRef,
  AeronauticalSourceReference,
} from './aeronautical';

export type ReportingPointCoordinateMethod =
  | 'published-coordinate'
  | 'calculated-from-published-definition'
  | 'derived-from-georeferenced-vac';

export interface ReportingPointDetails {
  readonly detailKind: 'reporting-point';
  readonly ref: AeronauticalFeatureRef;
  readonly associatedAerodromeFeatureId?: string;
  readonly coordinateMethod: ReportingPointCoordinateMethod;
  readonly useInformation?: string;
  readonly sourceReferences: readonly AeronauticalSourceReference[];
}
