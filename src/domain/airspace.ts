import type {
  AeronauticalFeatureRef,
  AeronauticalSourceReference,
} from './aeronautical';
import type { Position } from './position';

export type AirspaceType =
  | 'ctr'
  | 'tma'
  | 'cta'
  | 'tia'
  | 'tiz'
  | 'fir'
  | 'uir'
  | 'restricted-area'
  | 'danger-area'
  | 'prohibited-area'
  | 'other';

export type AirspaceClass = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

/** Preserves the published reference instead of flattening every limit to feet. */
export type VerticalLimit =
  | {
      readonly kind: 'surface';
      readonly value: 'SFC' | 'GND';
      readonly publishedText: string;
    }
  | {
      readonly kind: 'mean-sea-level';
      readonly publishedText: string;
    }
  | {
      readonly kind: 'distance';
      readonly value: number;
      readonly unit: 'FT' | 'M';
      readonly reference: 'AMSL' | 'AGL' | 'unspecified';
      readonly publishedText: string;
    }
  | {
      readonly kind: 'flight-level';
      readonly level: number;
      readonly publishedText: string;
    }
  | {
      readonly kind: 'unlimited';
      readonly publishedText: string;
    }
  | {
      readonly kind: 'unresolved';
      readonly publishedText: string;
      readonly reason: 'ambiguous';
    };

export type AirspaceBoundarySegment =
  | {
      readonly kind: 'geodesic';
      readonly from: Position;
      readonly to: Position;
    }
  | {
      readonly kind: 'arc';
      readonly from: Position;
      readonly to: Position;
      readonly center: Position;
      readonly direction: 'clockwise' | 'counterclockwise';
    }
  | {
      readonly kind: 'published-reference';
      readonly referenceType:
        | 'published-point'
        | 'national-boundary'
        | 'other';
      readonly publishedText: string;
      readonly resolvedGeometry?: readonly Position[];
    };

export interface AirspaceBoundaryRing {
  readonly segments: readonly AirspaceBoundarySegment[];
}

export type AirspaceGeometryDefinition =
  | {
      readonly kind: 'polygon';
      readonly rings: readonly AirspaceBoundaryRing[];
    }
  | {
      readonly kind: 'circle';
      readonly center: Position;
      readonly radiusNm: number;
    }
  | {
      readonly kind: 'sector';
      readonly center: Position;
      readonly innerRadiusNm?: number;
      readonly outerRadiusNm: number;
      readonly startBearingDegTrue: number;
      readonly endBearingDegTrue: number;
    }
  | {
      readonly kind: 'compound';
      readonly parts: readonly AirspaceGeometryDefinition[];
    };

export interface AirspaceDetails {
  readonly detailKind: 'airspace';
  readonly ref: AeronauticalFeatureRef;
  readonly identifier: string | null;
  readonly publishedName: string;
  readonly airspaceType: AirspaceType;
  readonly publishedType: string;
  readonly airspaceClass: AirspaceClass | null;
  readonly lowerLimit: VerticalLimit | null;
  readonly upperLimit: VerticalLimit | null;
  readonly sourceGeometry: AirspaceGeometryDefinition;
  readonly communicationServiceIds: readonly string[];
  readonly remarks?: string;
  readonly sourceReferences: readonly AeronauticalSourceReference[];
}
