import type { AeronauticalFeatureKind } from '../../domain';

export type AeronauticalLayerId =
  | 'aerodromes'
  | 'reporting-points'
  | 'navaids'
  | 'airspace';

export type AeronauticalLayerVisibility = Readonly<
  Record<AeronauticalLayerId, boolean>
>;

export interface AeronauticalLayerDefinition {
  readonly id: AeronauticalLayerId;
  readonly label: string;
  readonly minimumZoom: number;
  readonly featureKinds: readonly AeronauticalFeatureKind[];
}

export const AERONAUTICAL_LAYER_DEFINITIONS: readonly AeronauticalLayerDefinition[] =
  [
    {
      id: 'aerodromes',
      label: 'Aerodromes',
      minimumZoom: 6,
      featureKinds: ['aerodrome'],
    },
    {
      id: 'reporting-points',
      label: 'Reporting points',
      minimumZoom: 8,
      featureKinds: ['reporting-point'],
    },
    {
      id: 'navaids',
      label: 'Navaids / designated points',
      minimumZoom: 7,
      featureKinds: ['navaid', 'designated-point'],
    },
    {
      id: 'airspace',
      label: 'Airspace',
      minimumZoom: 5,
      featureKinds: [
        'ctr',
        'tma',
        'restricted-area',
        'danger-area',
        'prohibited-area',
        'other-airspace',
      ],
    },
  ];

export const DEFAULT_AERONAUTICAL_LAYER_VISIBILITY: AeronauticalLayerVisibility =
  {
    aerodromes: true,
    'reporting-points': true,
    navaids: true,
    airspace: true,
  };

export function getVisibleAeronauticalFeatureKinds(
  visibility: AeronauticalLayerVisibility,
  zoom: number,
): AeronauticalFeatureKind[] {
  return AERONAUTICAL_LAYER_DEFINITIONS.flatMap((definition) =>
    visibility[definition.id] && zoom >= definition.minimumZoom
      ? definition.featureKinds
      : [],
  );
}

