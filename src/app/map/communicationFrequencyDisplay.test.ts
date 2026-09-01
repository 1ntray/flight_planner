import { describe, expect, it } from 'vitest';

import { isDisplayedCommunicationFrequency } from './communicationFrequencyDisplay';

describe('isDisplayedCommunicationFrequency', () => {
  it.each([
    ['118.000', true],
    ['118.805', true],
    ['125.855', true],
    ['136.000', true],
    ['121.500', false],
    ['117.995', false],
    ['136.005', false],
    ['275.300', false],
    ['397.375', false],
    ['invalid', false],
  ])('classifies %s for map display', (valueMHz, expected) => {
    expect(isDisplayedCommunicationFrequency({ valueMHz })).toBe(expected);
  });
});
