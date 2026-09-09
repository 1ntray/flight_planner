import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ROUTE_LAYER_VISIBILITY,
  ROUTE_LAYER_DEFINITIONS,
} from './routeLayerConfig';

describe('route layer visibility', () => {
  it('shows every route presentation layer by default', () => {
    expect(ROUTE_LAYER_DEFINITIONS.map(({ id }) => id)).toEqual([
      'legs',
      'waypoints',
      'waypoint-names',
      'shaping-points',
      'altitude-targets',
      'flight-phases',
    ]);
    expect(Object.values(DEFAULT_ROUTE_LAYER_VISIBILITY)).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      true,
    ]);
  });
});
