import { describe, expect, it } from 'vitest';

import {
  formatDistanceNm,
  formatDistanceNmValue,
  formatEetMinutesValue,
  formatEetSeconds,
  formatGroundSpeedKt,
  formatGroundSpeedKtValue,
  formatMagneticHeadingDeg,
  formatMagneticTrackDeg,
  formatTrueHeadingDeg,
  formatTrueTrackDeg,
  formatUtcDateTime,
  formatUtcRouteTime,
  formatWindValue,
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

});

describe('wind-adjusted navigation formatting', () => {
  it('formats true heading using the same normalized angle convention as track', () => {
    expect(formatTrueHeadingDeg(359.6)).toBe('000°');
  });

  it('formats magnetic track and heading using the normalized angle convention', () => {
    expect(formatMagneticTrackDeg(7.4)).toBe('007°');
    expect(formatMagneticHeadingDeg(359.6)).toBe('000°');
    expect(formatMagneticHeadingDeg(null)).toBe('—');
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

  it('formats a compact direction-from and speed wind value', () => {
    expect(
      formatWindValue({ directionFromTrueDeg: 359.6, speedKt: 12.6 }),
    ).toBe('000/13');
    expect(formatWindValue(null)).toBe('—');
  });

});

describe('UTC time formatting', () => {
  const departureTimeUtcMs = Date.UTC(2026, 7, 27, 23, 30);

  it('formats a route time relative to the UTC departure day', () => {
    expect(
      formatUtcRouteTime(Date.UTC(2026, 7, 27, 23, 45), departureTimeUtcMs),
    ).toBe('23:45');
    expect(
      formatUtcRouteTime(Date.UTC(2026, 7, 28, 0, 30), departureTimeUtcMs),
    ).toBe('00:30 +1d');
  });

  it('rounds display times to the nearest minute', () => {
    const timestampUtcMs = Date.UTC(2026, 7, 27, 23, 59, 40);

    expect(formatUtcRouteTime(timestampUtcMs, departureTimeUtcMs)).toBe(
      '00:00 +1d',
    );
    expect(formatUtcDateTime(timestampUtcMs)).toBe('2026-08-28 00:00Z');
  });
});
