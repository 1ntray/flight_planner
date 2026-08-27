import { describe, expect, it } from 'vitest';

import type { CalculatedLeg } from '../../domain';
import {
  calculateTotalEetSeconds,
  calculateTotalDistanceNm,
  formatDistanceNm,
  formatDistanceNmValue,
  formatEetMinutesValue,
  formatEetSeconds,
  formatGroundSpeedKt,
  formatGroundSpeedKtValue,
  formatTrueHeadingDeg,
  formatTrueTrackDeg,
  formatWindCorrectionDeg,
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
    expect(formatDistanceNmValue(24.56)).toBe('24.6');
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

describe('wind-adjusted navigation formatting', () => {
  it('formats true heading using the same normalized angle convention as track', () => {
    expect(formatTrueHeadingDeg(359.6)).toBe('000°');
  });

  it.each([
    { correction: 7.26, expected: '+7.3°' },
    { correction: -7.26, expected: '-7.3°' },
    { correction: -0, expected: '0.0°' },
  ])(
    'formats a signed wind correction of $correction degrees',
    ({ correction, expected }) => {
      expect(formatWindCorrectionDeg(correction)).toBe(expected);
    },
  );

  it('formats groundspeed and EET without changing internal precision', () => {
    expect(formatGroundSpeedKt(97.9795897)).toBe('98.0 kt');
    expect(formatGroundSpeedKtValue(97.9795897)).toBe('98.0');
    expect(formatEetSeconds(2204.540769)).toBe('36.7 min');
    expect(formatEetMinutesValue(2204.540769)).toBe('36.7');
  });

  it('totals unrounded EET values only when every leg has a solution', () => {
    const first = {
      status: 'ok' as const,
      windCorrectionDeg: 1,
      trueHeadingDeg: 91,
      groundSpeedKt: 105,
      eetSeconds: 600.25,
    };
    const second = {
      status: 'ok' as const,
      windCorrectionDeg: -1,
      trueHeadingDeg: 179,
      groundSpeedKt: 95,
      eetSeconds: 700.25,
    };

    expect(calculateTotalEetSeconds([first, second])).toBe(1300.5);
    expect(
      calculateTotalEetSeconds([
        first,
        {
          status: 'no-solution',
          reason: 'non-positive-groundspeed',
        },
      ]),
    ).toBeNull();
    expect(calculateTotalEetSeconds([first, null])).toBeNull();
  });
});
