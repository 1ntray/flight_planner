import { describe, expect, it } from 'vitest';

import type { CalculatedLeg } from '../../domain';
import {
  calculateTotalDistanceNm,
  formatDistanceNm,
  formatTrueTrackDeg,
} from './routeFormatting';

describe('formatTrueTrackDeg', () => {
  it('formats a true track as zero-padded whole degrees', () => {
    expect(formatTrueTrackDeg(7.4)).toBe('007°');
  });

  it('keeps rounded display values in [0, 360)', () => {
    expect(formatTrueTrackDeg(359.6)).toBe('000°');
  });

  it('formats a null track as an em dash', () => {
    expect(formatTrueTrackDeg(null)).toBe('—');
  });
});

describe('distance formatting', () => {
  it('formats nautical miles to one decimal place', () => {
    expect(formatDistanceNm(24.56)).toBe('24.6 NM');
  });

  it('totals unrounded leg distances before display formatting', () => {
    const legs: CalculatedLeg[] = [
      { fromId: 'A', toId: 'B', distanceNm: 1.26, trueTrackDeg: 10 },
      { fromId: 'B', toId: 'C', distanceNm: 1.26, trueTrackDeg: 20 },
    ];

    expect(calculateTotalDistanceNm(legs)).toBe(2.52);
    expect(formatDistanceNm(calculateTotalDistanceNm(legs))).toBe('2.5 NM');
  });
});

