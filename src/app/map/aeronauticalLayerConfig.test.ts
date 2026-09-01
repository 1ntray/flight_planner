import { describe, expect, it } from 'vitest';

import {
  DEFAULT_AERONAUTICAL_LAYER_VISIBILITY,
  DEFAULT_AIRSPACE_CATEGORY_VISIBILITY,
  getVisibleAeronauticalFeatureKinds,
} from './aeronauticalLayerConfig';

describe('aeronautical layer visibility', () => {
  it('applies independent layer visibility and minimum zoom levels', () => {
    expect(
      getVisibleAeronauticalFeatureKinds(
        DEFAULT_AERONAUTICAL_LAYER_VISIBILITY,
        DEFAULT_AIRSPACE_CATEGORY_VISIBILITY,
        5,
      ),
    ).toEqual([
      'ctr',
      'tiz',
      'tma',
      'tia',
      'restricted-area',
      'danger-area',
      'prohibited-area',
      'other-airspace',
    ]);

    expect(
      getVisibleAeronauticalFeatureKinds(
        DEFAULT_AERONAUTICAL_LAYER_VISIBILITY,
        DEFAULT_AIRSPACE_CATEGORY_VISIBILITY,
        8,
      ),
    ).toContain('reporting-point');

    expect(
      getVisibleAeronauticalFeatureKinds(
        { ...DEFAULT_AERONAUTICAL_LAYER_VISIBILITY, navaids: false },
        DEFAULT_AIRSPACE_CATEGORY_VISIBILITY,
        8,
      ),
    ).not.toContain('navaid');
  });

  it('applies the airspace category subfilters independently', () => {
    expect(getVisibleAeronauticalFeatureKinds(
      DEFAULT_AERONAUTICAL_LAYER_VISIBILITY,
      {
        ...DEFAULT_AIRSPACE_CATEGORY_VISIBILITY,
        'ctr-tiz': false,
        cta: true,
      },
      5,
    )).toEqual([
      'tma',
      'tia',
      'cta',
      'restricted-area',
      'danger-area',
      'prohibited-area',
      'other-airspace',
    ]);
  });
});
