import { load, loadBuffer } from 'cheerio';
import type {
  AeronauticalAreaFeature,
  AeronauticalDatasetRef,
  AeronauticalFeatureDetails,
  AeronauticalPointFeature,
  AirspaceClass,
  AirspaceDetails,
  AirspaceType,
  AtsUnit,
  CommunicationService,
  CommunicationServiceType,
  Position,
  ReportingPointDetails,
} from '../../../src/domain';
import { expandTable, findSectionTables, normalizeText } from './htmlTable.ts';
import { parseCompactDmsPosition } from './parseCoordinate.ts';
import { parseVerticalLimit, parseVerticalLimitRange } from './parseVerticalLimit.ts';
import { AvinorEaipImportError } from './types.ts';

export interface OperationalImportConfig {
  readonly dataset: AeronauticalDatasetRef;
  readonly effectiveDate: string;
  readonly sourceUrl: string;
  readonly sourceAerodrome: string;
  readonly aerodromeFeatureId: string;
}

export interface OperationalImportResult {
  readonly features: readonly AeronauticalAreaFeature[];
  readonly featureDetails: readonly AeronauticalFeatureDetails[];
  readonly atsUnits: readonly AtsUnit[];
  readonly communicationServices: readonly CommunicationService[];
}

function cheerio(source: string | Buffer) {
  return Buffer.isBuffer(source) ? loadBuffer(source) : load(source);
}

function slug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function allPositions(value: string, section: string): readonly Position[] {
  const matches = value.match(/\b\d{6}(?:\.\d+)?[NS]\s+\d{7}(?:\.\d+)?[EW]\b/g) ?? [];
  if (matches.length < 3) {
    throw new AvinorEaipImportError(
      'insufficient-airspace-coordinates',
      `Expected at least three published coordinates in ${section}`,
      section,
    );
  }
  return matches.map((match) => parseCompactDmsPosition(match, section));
}

function semanticRing(positions: readonly Position[]) {
  const closed =
    positions[0]?.latitude === positions.at(-1)?.latitude &&
    positions[0]?.longitude === positions.at(-1)?.longitude
      ? positions
      : [...positions, positions[0] as Position];
  return {
    positions: closed,
    ring: {
      segments: closed.slice(0, -1).map((from, index) => ({
        kind: 'geodesic' as const,
        from,
        to: closed[index + 1] as Position,
      })),
    },
  };
}

function airspaceType(value: string): {
  readonly type: AirspaceType;
  readonly featureKind: AeronauticalAreaFeature['areaKind'];
} {
  const match = /\b(CTR|TMA|CTA|TIA|TIZ)\b/i.exec(value);
  if (match === null) {
    throw new AvinorEaipImportError(
      'unsupported-airspace-type',
      `Unsupported AD/ENR airspace designation: ${value}`,
      null,
    );
  }
  const type = match[1]?.toLowerCase() as 'ctr' | 'tma' | 'cta' | 'tia' | 'tiz';
  return { type, featureKind: type };
}

function serviceType(value: string): CommunicationServiceType {
  const normalized = value.trim().toUpperCase();
  if (normalized === 'ATIS') return 'atis';
  if (normalized === 'CLR') return 'clearance-delivery';
  if (normalized === 'GND') return 'ground';
  if (normalized === 'TWR') return 'tower';
  if (normalized === 'APP') return 'approach';
  if (normalized === 'AFIS') return 'afis';
  if (normalized === 'FIS') return 'flight-information';
  if (normalized === 'ACC') return 'area-control';
  return 'other';
}

function sourceReference(config: OperationalImportConfig, section: string) {
  return {
    sourceType: 'eAIP-html' as const,
    sourceAerodrome: config.sourceAerodrome,
    aipSection: section,
    sourceReference: config.sourceUrl,
  };
}

export function importAd2OperationalData(
  source: string | Buffer,
  config: OperationalImportConfig,
): OperationalImportResult {
  const $ = cheerio(source);
  const airspaceTable = findSectionTables($, `${config.sourceAerodrome} AD 2.17`)[0];
  if (airspaceTable === undefined) {
    throw new AvinorEaipImportError('missing-section', 'Missing AD 2.17 table', 'AD 2.17');
  }
  const rows = expandTable($, airspaceTable);
  const valueFor = (label: string) =>
    rows.find((row) => row.some((cell) => cell.toLowerCase().includes(label)))?.at(-1);
  const designation = valueFor('designation and lateral limits');
  const vertical = valueFor('vertical limits');
  const publishedClass = valueFor('airspace classification');
  const unitCallsign = valueFor('ats unit call sign');
  const remarks = valueFor('rmk');
  if (designation === undefined || vertical === undefined || publishedClass === undefined) {
    throw new AvinorEaipImportError(
      'malformed-required-airspace-data',
      'AD 2.17 is missing designation, vertical limits, or class',
      'AD 2.17',
    );
  }

  const { type, featureKind } = airspaceType(designation);
  const nameMatch = new RegExp(`^(.+?\\b${type.toUpperCase()}\\b)`).exec(designation);
  const publishedName = normalizeText(nameMatch?.[1] ?? '');
  if (publishedName === '') {
    throw new AvinorEaipImportError('malformed-airspace-name', 'Missing airspace name', 'AD 2.17');
  }
  const { lower, upper } = parseVerticalLimitRange(vertical, 'AD 2.17');
  if (!/^[A-G]$/.test(publishedClass.trim())) {
    throw new AvinorEaipImportError('malformed-airspace-class', `Invalid airspace class: ${publishedClass}`, 'AD 2.17');
  }
  const { positions, ring } = semanticRing(allPositions(designation, 'AD 2.17'));
  const featureId = `airspace:ad2:${config.sourceAerodrome.toLowerCase()}:${type}`;
  const featureRef = {
    dataset: config.dataset,
    featureId,
    featureVersionId: config.effectiveDate,
    featureKind,
  } as const;
  const serviceRows = findSectionTables($, `${config.sourceAerodrome} AD 2.18`)[0];
  if (serviceRows === undefined) {
    throw new AvinorEaipImportError('missing-section', 'Missing AD 2.18 table', 'AD 2.18');
  }

  const services: CommunicationService[] = [];
  let current: CommunicationService | null = null;
  for (const row of expandTable($, serviceRows).slice(2)) {
    const [publishedService = '', callsign = '', frequency = '', hours = '', rowRemarks = ''] = row;
    if (publishedService !== '') {
      current = {
        id: `communication:ad2:${config.sourceAerodrome.toLowerCase()}:${slug(publishedService)}`,
        serviceType: serviceType(publishedService),
        publishedServiceType: publishedService,
        ...(callsign === '' ? {} : { callsign }),
        frequencies: [],
        associations: [
          {
            featureId: config.aerodromeFeatureId,
            featureKind: 'aerodrome',
            basis: 'explicit',
          },
          ...((publishedService === 'TWR' || publishedService === 'AFIS') &&
          callsign !== '' && unitCallsign?.toLowerCase().startsWith(callsign.toLowerCase())
            ? [{ featureId, featureKind: 'airspace' as const, basis: 'unique-source-callsign-match' as const }]
            : []),
        ],
        sourceReferences: [sourceReference(config, 'AD 2.18')],
      };
      services.push(current);
    }
    if (current === null) continue;
    const match = /^(\d{3}\.\d{3})\s*MHZ$/i.exec(frequency);
    if (match === null) {
      throw new AvinorEaipImportError('malformed-frequency', `Malformed frequency: ${frequency}`, 'AD 2.18');
    }
    (current.frequencies as Array<{ valueMHz: string; hours?: string; remarks?: string }>).push({
      valueMHz: match[1] as string,
      ...(hours === '' ? {} : { hours }),
      ...(rowRemarks === '' || rowRemarks === 'NIL' ? {} : { remarks: rowRemarks }),
    });
  }

  const feature: AeronauticalAreaFeature = {
    geometryType: 'area',
    areaKind: featureKind,
    ref: featureRef,
    identifier: publishedName,
    name: publishedName,
    polygons: [{ outerRing: positions, holes: [] }],
  };
  const details: AirspaceDetails = {
    detailKind: 'airspace',
    ref: featureRef,
    identifier: publishedName,
    publishedName,
    airspaceType: type,
    publishedType: type.toUpperCase(),
    airspaceClass: publishedClass.trim() as AirspaceClass,
    lowerLimit: lower,
    upperLimit: upper,
    sourceGeometry: { kind: 'polygon', rings: [ring] },
    communicationServiceIds: services
      .filter((service) => service.associations.some((association) => association.featureId === featureId))
      .map((service) => service.id),
    ...(remarks === undefined || remarks === 'NIL' ? {} : { remarks }),
    sourceReferences: [sourceReference(config, 'AD 2.17')],
  };
  return { features: [feature], featureDetails: [details], atsUnits: [], communicationServices: services };
}

export interface EnrAirspaceImportConfig extends Omit<OperationalImportConfig, 'sourceAerodrome'> {
  readonly publishedName: string;
  readonly associatedAerodromeFeatureIds: readonly string[];
}

export function importEnr21Airspace(
  source: string | Buffer,
  config: EnrAirspaceImportConfig,
): OperationalImportResult {
  const $ = cheerio(source);
  const row = $('tr').toArray().find((candidate) =>
    normalizeText($(candidate).text()).startsWith(config.publishedName),
  );
  if (row === undefined) {
    throw new AvinorEaipImportError('missing-airspace', `Missing ${config.publishedName}`, 'ENR 2.1');
  }
  const cells = $(row).children('th, td').toArray().map((cell) => normalizeText($(cell).text()));
  const [definition = '', unitName = '', callsignHours = '', frequency = '', remarks = ''] = cells;
  const { type, featureKind } = airspaceType(definition);
  const positionsAndRing = semanticRing(allPositions(definition, 'ENR 2.1'));
  const upperText = /Upper limit:\s*(.+?)\s+Lower limit:/i.exec(definition)?.[1];
  const lowerText = /Lower limit:\s*(.+?)\s+Class\s+([A-G])/i.exec(definition);
  if (upperText === undefined || lowerText?.[1] === undefined || lowerText[2] === undefined) {
    throw new AvinorEaipImportError('malformed-vertical-limit-range', `Missing ENR limits: ${definition}`, 'ENR 2.1');
  }
  const featureId = `airspace:enr21:${slug(config.publishedName)}`;
  const featureRef = { dataset: config.dataset, featureId, featureVersionId: config.effectiveDate, featureKind } as const;
  const unitId = `ats-unit:${slug(unitName)}`;
  const serviceId = `communication:enr21:${slug(config.publishedName)}:approach`;
  const frequencyMatch = /^(\d{3}\.\d{3})\s*MHZ$/i.exec(frequency);
  if (frequencyMatch === null) {
    throw new AvinorEaipImportError('malformed-frequency', `Malformed frequency: ${frequency}`, 'ENR 2.1');
  }
  const sourceRef = {
    sourceType: 'eAIP-html' as const,
    sourceDocument: 'ENR 2.1',
    aipSection: 'ENR 2.1',
    publishedIdentifier: config.publishedName,
    sourceReference: config.sourceUrl,
  };
  const service: CommunicationService = {
    id: serviceId,
    serviceType: 'approach',
    publishedServiceType: 'APP',
    unitId,
    callsign: callsignHours.replace(/\s+English\b.*$/i, ''),
    frequencies: [{ valueMHz: frequencyMatch[1] as string, ...(remarks === '' ? {} : { remarks }) }],
    associations: [
      { featureId, featureKind: 'airspace', basis: 'explicit' },
      ...config.associatedAerodromeFeatureIds.map((associatedFeatureId) => ({
        featureId: associatedFeatureId,
        featureKind: 'aerodrome' as const,
        basis: 'explicit' as const,
      })),
    ],
    sourceReferences: [sourceRef],
  };
  const feature: AeronauticalAreaFeature = {
    geometryType: 'area', ref: featureRef, areaKind: featureKind,
    identifier: config.publishedName, name: config.publishedName,
    polygons: [{ outerRing: positionsAndRing.positions, holes: [] }],
  };
  const details: AirspaceDetails = {
    detailKind: 'airspace', ref: featureRef, identifier: config.publishedName,
    publishedName: config.publishedName, airspaceType: type, publishedType: type.toUpperCase(),
    airspaceClass: lowerText[2] as AirspaceClass,
    lowerLimit: parseVerticalLimit(lowerText[1], 'ENR 2.1'),
    upperLimit: parseVerticalLimit(upperText, 'ENR 2.1'),
    sourceGeometry: { kind: 'polygon', rings: [positionsAndRing.ring] },
    communicationServiceIds: [serviceId], sourceReferences: [sourceRef],
  };
  return {
    features: [feature], featureDetails: [details],
    atsUnits: [{ id: unitId, publishedName: unitName, sourceReferences: [sourceRef] }],
    communicationServices: [service],
  };
}

export interface VacReportingPointConfig {
  readonly dataset: AeronauticalDatasetRef;
  readonly effectiveDate: string;
  readonly aerodromeFeatureId: string;
  readonly aerodromeIdentifier: string;
  readonly sourceUrl: string;
  readonly sourcePage?: string;
}

export function importVacReportingPoints(
  extractedText: string,
  config: VacReportingPointConfig,
): { readonly features: readonly AeronauticalPointFeature[]; readonly details: readonly ReportingPointDetails[] } {
  const rows = extractedText.split(/\r?\n/);
  const features: AeronauticalPointFeature[] = [];
  const details: ReportingPointDetails[] = [];
  for (const row of rows) {
    const match = /^\s*([A-ZÆØÅ][A-ZÆØÅ -]*?)\s+(\d{6}[NS])\s+(\d{7}[EW])\s*$/u.exec(row);
    if (match === null) continue;
    const name = normalizeText(match[1] ?? '');
    const position = parseCompactDmsPosition(`${match[2]} ${match[3]}`, 'AD 2.24 VAC');
    const featureId = `reporting-point:${config.aerodromeIdentifier.toLowerCase()}:${slug(name)}`;
    const ref = {
      dataset: config.dataset, featureId, featureVersionId: config.effectiveDate,
      featureKind: 'reporting-point' as const,
    };
    const sourceRef = {
      sourceType: 'vac-pdf' as const,
      sourceAerodrome: config.aerodromeIdentifier,
      sourceDocument: 'Visual Approach Chart', aipSection: 'AD 2.24',
      ...(config.sourcePage === undefined ? {} : { sourcePage: config.sourcePage }),
      publishedIdentifier: name, sourceReference: config.sourceUrl,
    };
    features.push({ geometryType: 'point', pointKind: 'reporting-point', ref, identifier: name, name, suggestedWaypointName: name, position });
    details.push({ detailKind: 'reporting-point', ref, associatedAerodromeFeatureId: config.aerodromeFeatureId, coordinateMethod: 'published-coordinate', sourceReferences: [sourceRef] });
  }
  return { features, details };
}
