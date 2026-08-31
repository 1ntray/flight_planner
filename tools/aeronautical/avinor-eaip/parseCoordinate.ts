import type { Position } from '../../../src/domain';
import { AvinorEaipImportError } from './types.ts';

function coordinateComponent(
  value: string,
  kind: 'latitude' | 'longitude',
  aipSection: string,
): number {
  const degreeDigits = kind === 'latitude' ? 2 : 3;
  const pattern = new RegExp(
    `^(\\d{${degreeDigits}})(\\d{2})(\\d{2}(?:\\.\\d+)?)([${
      kind === 'latitude' ? 'NS' : 'EW'
    }])$`,
  );
  const match = pattern.exec(value);
  if (match === null) {
    throw new AvinorEaipImportError(
      'malformed-coordinate',
      `Malformed ${kind}: ${value}`,
      aipSection,
    );
  }

  const degrees = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const hemisphere = match[4];
  const maximumDegrees = kind === 'latitude' ? 90 : 180;

  if (
    !Number.isFinite(degrees) ||
    !Number.isFinite(minutes) ||
    !Number.isFinite(seconds) ||
    degrees > maximumDegrees ||
    minutes >= 60 ||
    seconds >= 60 ||
    (degrees === maximumDegrees && (minutes !== 0 || seconds !== 0))
  ) {
    throw new AvinorEaipImportError(
      'coordinate-out-of-range',
      `Out-of-range ${kind}: ${value}`,
      aipSection,
    );
  }

  const unsigned = degrees + minutes / 60 + seconds / 3600;
  return hemisphere === 'S' || hemisphere === 'W' ? -unsigned : unsigned;
}

export function parseCompactDmsPosition(
  value: string,
  aipSection: string,
): Position {
  const match = /\b(\d{6}(?:\.\d+)?[NS])\s+(\d{7}(?:\.\d+)?[EW])\b/.exec(
    value,
  );
  if (match === null || match[1] === undefined || match[2] === undefined) {
    throw new AvinorEaipImportError(
      'malformed-position',
      `Malformed WGS84 position: ${value}`,
      aipSection,
    );
  }

  return {
    latitude: coordinateComponent(match[1], 'latitude', aipSection),
    longitude: coordinateComponent(match[2], 'longitude', aipSection),
  };
}
