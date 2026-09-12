import { describe, expect, it } from 'vitest';
import { formatDistance, formatDurationHhMm, formatHeading, formatOptionalNumber, formatTimeMinutes } from './ofpFormatting';

describe('OFP presentation formatters', () => {
  it('formats headings, fuel, distance and time without changing source precision', () => {
    expect(formatHeading(360.4)).toBe('000°');
    expect(formatOptionalNumber(36.44, 1)).toBe('36.4');
    expect(formatDistance(106.9)).toBe('107');
    expect(formatTimeMinutes(3660)).toBe('61');
    expect(formatDurationHhMm(91)).toBe('01:31');
  });

  it('keeps unavailable values blank', () => {
    expect(formatOptionalNumber(null)).toBeNull();
    expect(formatDistance(null)).toBeNull();
    expect(formatTimeMinutes(null)).toBeNull();
  });
});
