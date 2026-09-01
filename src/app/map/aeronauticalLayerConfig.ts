import type { AeronauticalFeatureKind } from '../../domain';

export type AeronauticalLayerId =
  | 'aerodromes'
  | 'reporting-points'
  | 'navaids'
  | 'airspace';

export type AeronauticalLayerVisibility = Readonly<
  Record<AeronauticalLayerId, boolean>
>;

export type AirspaceCategoryId =
  | 'ctr-tiz'
  | 'tma-tia'
  | 'cta'
  | 'other-airspace';

export type AirspaceCategoryVisibility = Readonly<
  Record<AirspaceCategoryId, boolean>
>;

export interface AirspaceCategoryDefinition {
  readonly id: AirspaceCategoryId;
  readonly label: string;
  readonly featureKinds: readonly AeronauticalFeatureKind[];
}

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
        'cta',
        'tia',
        'tiz',
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

export const AIRSPACE_CATEGORY_DEFINITIONS: readonly AirspaceCategoryDefinition[] = [
  { id: 'ctr-tiz', label: 'CTR / TIZ', featureKinds: ['ctr', 'tiz'] },
  { id: 'tma-tia', label: 'TMA / TIA', featureKinds: ['tma', 'tia'] },
  { id: 'cta', label: 'CTA', featureKinds: ['cta'] },
  {
    id: 'other-airspace',
    label: 'Other airspace',
    featureKinds: [
      'restricted-area',
      'danger-area',
      'prohibited-area',
      'other-airspace',
    ],
  },
];

export const DEFAULT_AIRSPACE_CATEGORY_VISIBILITY: AirspaceCategoryVisibility = {
  'ctr-tiz': true,
  'tma-tia': true,
  // CTA is available but hidden initially because its published volumes are
  // broad enough to obscure the regional layers used more often for VFR work.
  cta: false,
  'other-airspace': true,
};

export function getVisibleAeronauticalFeatureKinds(
  visibility: AeronauticalLayerVisibility,
  airspaceCategoryVisibility: AirspaceCategoryVisibility,
  zoom: number,
): AeronauticalFeatureKind[] {
  return AERONAUTICAL_LAYER_DEFINITIONS.flatMap((definition) => {
    if (!visibility[definition.id] || zoom < definition.minimumZoom) return [];
    if (definition.id !== 'airspace') return definition.featureKinds;
    return AIRSPACE_CATEGORY_DEFINITIONS.flatMap((category) =>
      airspaceCategoryVisibility[category.id] ? category.featureKinds : [],
    );
  });
}
