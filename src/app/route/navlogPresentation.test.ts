import { describe, expect, it } from 'vitest';

import {
  calculateNavlogDirectionDisplay,
  roundNavlogAccumulatedIncrement,
} from './navlogPresentation';

describe('navlog presentation', () => {
  it('derives magnetic track and heading from individually rounded display values', () => {
    expect(calculateNavlogDirectionDisplay(100.7, 9.7, 105.1)).toEqual({
      trueTrackDeg: 101,
      variationDegEast: 10,
      magneticTrackDeg: 91,
      windCorrectionDeg: 4,
      magneticHeadingDeg: 95,
    });
    expect(calculateNavlogDirectionDisplay(100.7, -9.7, 105.1)).toMatchObject({
      magneticTrackDeg: 111,
      magneticHeadingDeg: 115,
    });
  });

  it('keeps a rounded intermediate value equal to the change in accumulated values', () => {
    expect(roundNavlogAccumulatedIncrement(17.3, 0)).toBe(17);
    expect(roundNavlogAccumulatedIncrement(60.2, 17.3)).toBe(43);
    expect(roundNavlogAccumulatedIncrement(91.6, 60.2)).toBe(32);
  });
});
