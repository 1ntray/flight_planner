import type {
  AeronauticalDatasetRef,
  AeronauticalFeature,
  AeronauticalFeatureKind,
} from '../domain';
import { InMemoryAeronauticalRepository } from './inMemoryRepository';

const DEMO_DATASET: AeronauticalDatasetRef = {
  datasetId: 'synthetic-demo-1',
  providerId: 'flight-planner-demo',
  sourceName: 'Synthetic development data — not for navigation',
  airacCycle: null,
  effectiveFromUtc: '2026-01-01T00:00:00Z',
  effectiveToUtc: null,
  revisionId: '1',
};

function featureRef(featureId: string, featureKind: AeronauticalFeatureKind) {
  return {
    dataset: DEMO_DATASET,
    featureId,
    featureKind,
  };
}

const DEMO_FEATURES: readonly AeronauticalFeature[] = [
  {
    geometryType: 'point',
    pointKind: 'aerodrome',
    ref: featureRef('demo-aerodrome', 'aerodrome'),
    identifier: 'DEMO AD',
    name: 'Synthetic demo aerodrome',
    suggestedWaypointName: 'DEMO AD',
    position: { latitude: 69.43, longitude: 18.92 },
  },
  {
    geometryType: 'point',
    pointKind: 'reporting-point',
    ref: featureRef('demo-reporting-point', 'reporting-point'),
    identifier: 'DEMO VRP',
    name: 'Synthetic demo reporting point',
    suggestedWaypointName: 'DEMO VRP',
    position: { latitude: 69.27, longitude: 19.2 },
  },
  {
    geometryType: 'point',
    pointKind: 'navaid',
    ref: featureRef('demo-navaid', 'navaid'),
    identifier: 'DEMO NAV',
    name: 'Synthetic demo navaid',
    suggestedWaypointName: 'DEMO NAV',
    position: { latitude: 69.2, longitude: 18.38 },
  },
  {
    geometryType: 'area',
    areaKind: 'ctr',
    ref: featureRef('demo-airspace', 'ctr'),
    identifier: 'DEMO CTR',
    name: 'Synthetic demo airspace',
    polygons: [
      {
        outerRing: [
          { latitude: 69.18, longitude: 18.45 },
          { latitude: 69.18, longitude: 19.15 },
          { latitude: 69.52, longitude: 19.15 },
          { latitude: 69.52, longitude: 18.45 },
          { latitude: 69.18, longitude: 18.45 },
        ],
        holes: [],
      },
    ],
  },
];

export const DEMO_AERONAUTICAL_REPOSITORY =
  new InMemoryAeronauticalRepository(DEMO_DATASET, DEMO_FEATURES);

