import { describe, expect, it } from 'vitest';

import {
  formatLegAltitudeDraft,
  parseLegAltitudeDraft,
} from './legAltitudeDraft';

describe('leg altitude input drafts', () => {
  it('parses empty input as removal of the leg override', () => {
    expect(parseLegAltitudeDraft('')).toEqual({
      status: 'valid',
      value: null,
    });
    expect(parseLegAltitudeDraft('   ')).toEqual({
      status: 'valid',
      value: null,
    });
  });

  it('parses finite non-negative altitudes', () => {
    expect(parseLegAltitudeDraft('4500')).toEqual({
      status: 'valid',
      value: 4500,
    });
    expect(parseLegAltitudeDraft('0')).toEqual({
      status: 'valid',
      value: 0,
    });
    expect(parseLegAltitudeDraft('60000')).toEqual({
      status: 'valid',
      value: 60000,
    });
  });

  it('rejects negative, excessive, and non-finite values', () => {
    expect(parseLegAltitudeDraft('-1')).toEqual({ status: 'invalid' });
    expect(parseLegAltitudeDraft('60001')).toEqual({ status: 'invalid' });
    expect(parseLegAltitudeDraft('not a number')).toEqual({
      status: 'invalid',
    });
    expect(parseLegAltitudeDraft('Infinity')).toEqual({ status: 'invalid' });
  });

  it('formats stored overrides without inventing a value', () => {
    expect(formatLegAltitudeDraft(undefined)).toBe('');
    expect(formatLegAltitudeDraft(4500)).toBe('4500');
  });
});
