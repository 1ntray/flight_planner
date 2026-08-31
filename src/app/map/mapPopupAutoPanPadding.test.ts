import { describe, expect, it } from 'vitest';

import {
  calculateMapPopupAutoPanPadding,
  calculatePopupCollisionPan,
} from './mapPopupAutoPanPadding';

const map = { top: 0, left: 0, right: 1000, bottom: 700 };

describe('calculateMapPopupAutoPanPadding', () => {
  it('keeps the default edge gap when no controls cover the map', () => {
    expect(calculateMapPopupAutoPanPadding(map, [])).toEqual({
      topLeft: [12, 12],
      bottomRight: [12, 12],
    });
  });

  it('protects the top-left tool and zoom controls as a top band', () => {
    expect(
      calculateMapPopupAutoPanPadding(map, [
        { top: 12, left: 12, right: 48, bottom: 84 },
        { top: 12, left: 56, right: 410, bottom: 112 },
      ]),
    ).toEqual({
      topLeft: [12, 124],
      bottomRight: [12, 12],
    });
  });

  it('protects right-hand layers and a bottom entry bar', () => {
    expect(
      calculateMapPopupAutoPanPadding(map, [
        { top: 12, left: 730, right: 988, bottom: 185 },
        { top: 620, left: 540, right: 988, bottom: 688 },
      ]),
    ).toEqual({
      topLeft: [12, 197],
      bottomRight: [12, 92],
    });
  });

  it('includes a tall layer menu that extends below the map midpoint', () => {
    expect(
      calculateMapPopupAutoPanPadding(map, [
        { top: 12, left: 730, right: 988, bottom: 440 },
      ]),
    ).toEqual({
      topLeft: [12, 452],
      bottomRight: [12, 12],
    });
  });

  it('moves a popup sideways when that is the shortest valid separation', () => {
    expect(
      calculatePopupCollisionPan(
        map,
        { top: 190, left: 450, right: 750, bottom: 490 },
        [{ top: 12, left: 700, right: 988, bottom: 350 }],
      ),
    ).toEqual({ x: 62, y: 0 });
  });

  it('declines an impossible correction instead of fighting Leaflet auto-pan', () => {
    expect(
      calculatePopupCollisionPan(
        map,
        { top: 221, left: 93, right: 552, bottom: 634 },
        [{ top: 12, left: 200, right: 550, bottom: 296 }],
      ),
    ).toBeNull();
  });

  it('does not pan when the rendered popup is already clear of controls', () => {
    expect(
      calculatePopupCollisionPan(
        map,
        { top: 310, left: 93, right: 552, bottom: 634 },
        [{ top: 12, left: 200, right: 550, bottom: 296 }],
      ),
    ).toBeNull();
  });
});
