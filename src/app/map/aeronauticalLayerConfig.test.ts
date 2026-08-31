import { describe, expect, it } from 'vitest';

import {
  DEFAULT_AERONAUTICAL_LAYER_VISIBILITY,
  getVisibleAeronauticalFeatureKinds,
} from './aeronauticalLayerConfig';

describe('aeronautical layer visibility', () => {
  it('applies independent layer visibility and minimum zoom levels', () => {
    expect(
      getVisibleAeronauticalFeatureKinds(
        DEFAULT_AERONAUTICAL_LAYER_VISIBILITY,
        5,
      ),
    ).toEqual([
      'ctr',
      'tma',
      'cta',
      'tia',
      'tiz',
      'restricted-area',
      'danger-area',
      'prohibited-area',
      'other-airspace',
    ]);

    expect(
      getVisibleAeronauticalFeatureKinds(
        DEFAULT_AERONAUTICAL_LAYER_VISIBILITY,
        8,
      ),
    ).toContain('reporting-point');

    expect(
      getVisibleAeronauticalFeatureKinds(
        { ...DEFAULT_AERONAUTICAL_LAYER_VISIBILITY, navaids: false },
        8,
      ),
    ).not.toContain('navaid');
  });
});
