import { describe, expect, it } from 'vitest';

import { evaluateMinimumSafeAltitude } from './minimumSafeAltitude';

describe('evaluateMinimumSafeAltitude', () => {
  it('treats an omitted manual MSA as a warning, not a calculation error', () => {
    expect(evaluateMinimumSafeAltitude(undefined, 2500)).toBe('missing');
  });

  it('warns when MSA exceeds the planned leg altitude', () => {
    expect(evaluateMinimumSafeAltitude(2600, 2500)).toBe('above-planned-altitude');
    expect(evaluateMinimumSafeAltitude(2500, 2500)).toBeNull();
  });

  it('does not make an altitude comparison until a valid planned altitude exists', () => {
    expect(evaluateMinimumSafeAltitude(2600, null)).toBeNull();
  });
});
