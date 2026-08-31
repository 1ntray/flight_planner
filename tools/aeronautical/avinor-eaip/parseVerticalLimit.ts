import type { VerticalLimit } from '../../../src/domain';
import { AvinorEaipImportError } from './types.ts';

export function parseVerticalLimit(
  publishedValue: string,
  aipSection: string,
): VerticalLimit {
  const publishedText = publishedValue.replace(/\s+/g, ' ').trim();
  const normalized = publishedText.toUpperCase();

  if (normalized === 'SFC' || normalized === 'GND') {
    return { kind: 'surface', value: normalized, publishedText };
  }
  if (normalized === 'MSL') {
    return { kind: 'mean-sea-level', publishedText };
  }
  if (normalized === 'UNL' || normalized === 'UNLIMITED') {
    return { kind: 'unlimited', publishedText };
  }

  const flightLevel = /^FL\s*(\d+)$/.exec(normalized);
  if (flightLevel !== null) {
    return {
      kind: 'flight-level',
      level: Number.parseInt(flightLevel[1] ?? '', 10),
      publishedText,
    };
  }

  const distance = /^(\d+(?:\.\d+)?)\s*(FT|M)(?:\s+(AMSL|AGL))?$/.exec(
    normalized,
  );
  if (distance !== null) {
    return {
      kind: 'distance',
      value: Number(distance[1]),
      unit: distance[2] as 'FT' | 'M',
      reference: (distance[3] as 'AMSL' | 'AGL' | undefined) ?? 'unspecified',
      publishedText,
    };
  }

  throw new AvinorEaipImportError(
    'malformed-vertical-limit',
    `Unsupported or malformed vertical limit: ${publishedText}`,
    aipSection,
  );
}

export function parseVerticalLimitRange(
  publishedValue: string,
  aipSection: string,
): { readonly lower: VerticalLimit; readonly upper: VerticalLimit } {
  const parts = publishedValue.split(/\s+to\s+/i);
  if (parts.length !== 2 || parts[0] === undefined || parts[1] === undefined) {
    throw new AvinorEaipImportError(
      'malformed-vertical-limit-range',
      `Expected a lower and upper limit separated by "to": ${publishedValue}`,
      aipSection,
    );
  }
  return {
    lower: parseVerticalLimit(parts[0], aipSection),
    upper: parseVerticalLimit(parts[1], aipSection),
  };
}
