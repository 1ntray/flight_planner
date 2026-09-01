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
  CommunicationFrequencyAssignment,
  CommunicationService,
  CommunicationServiceType,
  Position,
  ReportingPointDetails,
} from '../../../src/domain';
import {
  expandTable,
  findSectionTables,
  normalizeText,
  visibleText,
} from './htmlTable.ts';
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
  readonly warnings: readonly OperationalImportWarning[];
}

export interface OperationalImportWarning {
  readonly code: string;
  readonly message: string;
  readonly aipSection: string;
  readonly publishedName?: string;
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
  const warnings: OperationalImportWarning[] = [];
  const airspaceTable = findSectionTables($, `${config.sourceAerodrome} AD 2.17`)[0];
  const features: AeronauticalAreaFeature[] = [];
  const detailsWithoutServices: AirspaceDetails[] = [];
  let unitCallsign: string | undefined;

  if (airspaceTable === undefined) {
    warnings.push({
      code: 'missing-section',
      message: 'Missing AD 2.17 table',
      aipSection: 'AD 2.17',
    });
  } else {
    const valuesFor = (label: string): readonly string[] | undefined => {
      const row = airspaceTable.find('tr').toArray().find((candidate) =>
        $(candidate).children('th, td').toArray().some((cell) =>
          visibleText($(cell)).toLowerCase().includes(label),
        ),
      );
      if (row === undefined) return undefined;
      const valueCell = $(row).children('th, td').last();
      const paragraphs = valueCell.children('p').toArray()
        .map((paragraph) => visibleText($(paragraph)))
        .filter((value) => value !== '');
      return paragraphs.length > 0 ? paragraphs : [visibleText(valueCell)];
    };

    const designationValues = valuesFor('designation and lateral limits');
    const verticalValues = valuesFor('vertical limits');
    const classValues = valuesFor('airspace classification');
    unitCallsign = valuesFor('ats unit call sign')?.join(' ');
    const remarks = valuesFor('rmk')?.join(' ');
    if (
      designationValues === undefined ||
      verticalValues === undefined ||
      classValues === undefined
    ) {
      throw new AvinorEaipImportError(
        'malformed-required-airspace-data',
        'AD 2.17 is missing designation, vertical limits, or class',
        'AD 2.17',
      );
    }

    const designation = designationValues.join(' ');
    if (designation.toUpperCase() !== 'NIL') {
      const { type, featureKind } = airspaceType(designation);
      const nameMatch = new RegExp(`^(.+?\\b${type.toUpperCase()}\\b)`, 'i').exec(designation);
      const publishedName = normalizeText(nameMatch?.[1] ?? '');
      if (publishedName === '') {
        throw new AvinorEaipImportError('malformed-airspace-name', 'Missing airspace name', 'AD 2.17');
      }
      const geometryValues = designationValues.filter(
        (value) => (value.match(/\b\d{6}(?:\.\d+)?[NS]\s+\d{7}(?:\.\d+)?[EW]\b/g) ?? []).length >= 3,
      );
      if (geometryValues.length === 0) {
        throw new AvinorEaipImportError(
          'insufficient-airspace-coordinates',
          `No published geometry volumes found for ${publishedName}`,
          'AD 2.17',
        );
      }
      if (verticalValues.length !== 1 && verticalValues.length !== geometryValues.length) {
        throw new AvinorEaipImportError(
          'ambiguous-airspace-volumes',
          `${publishedName} has ${geometryValues.length} geometries but ${verticalValues.length} vertical-limit ranges`,
          'AD 2.17',
        );
      }
      if (classValues.length !== 1 && classValues.length !== geometryValues.length) {
        throw new AvinorEaipImportError(
          'ambiguous-airspace-classes',
          `${publishedName} has ${geometryValues.length} geometries but ${classValues.length} classes`,
          'AD 2.17',
        );
      }

      geometryValues.forEach((geometry, index) => {
        const vertical = verticalValues.length === 1
          ? verticalValues[0]
          : verticalValues[index];
        const publishedClass = classValues.length === 1
          ? classValues[0]
          : classValues[index];
        if (vertical === undefined || publishedClass === undefined) {
          throw new AvinorEaipImportError(
            'ambiguous-airspace-volumes',
            `Unable to pair published values for ${publishedName}`,
            'AD 2.17',
          );
        }
        const { lower, upper } = parseVerticalLimitRange(vertical, 'AD 2.17');
        if (!/^[A-G]$/.test(publishedClass.trim())) {
          throw new AvinorEaipImportError(
            'malformed-airspace-class',
            `Invalid airspace class: ${publishedClass}`,
            'AD 2.17',
          );
        }
        const { positions, ring } = semanticRing(allPositions(geometry, 'AD 2.17'));
        const firstCoordinate = geometry.match(
          /\b\d{6}(?:\.\d+)?[NS]\s+\d{7}(?:\.\d+)?[EW]\b/,
        )?.[0];
        const featureId = geometryValues.length === 1
          ? `airspace:ad2:${config.sourceAerodrome.toLowerCase()}:${type}`
          : [
              `airspace:ad2:${config.sourceAerodrome.toLowerCase()}:${type}`,
              `${slug(vertical)}:${slug(firstCoordinate ?? String(index + 1))}`,
            ].join(':');
        const featureRef = {
          dataset: config.dataset,
          featureId,
          featureVersionId: config.effectiveDate,
          featureKind,
        } as const;
        features.push({
          geometryType: 'area',
          areaKind: featureKind,
          ref: featureRef,
          identifier: publishedName,
          name: geometryValues.length === 1
            ? publishedName
            : `${publishedName} (${lower.publishedText}–${upper.publishedText})`,
          polygons: [{ outerRing: positions, holes: [] }],
        });
        detailsWithoutServices.push({
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
          communicationServiceIds: [],
          ...(remarks === undefined || remarks === 'NIL' ? {} : { remarks }),
          sourceReferences: [sourceReference(config, 'AD 2.17')],
        });
      });
    }
  }

  const serviceRows = findSectionTables($, `${config.sourceAerodrome} AD 2.18`)[0];
  const serviceDrafts: Array<{
    publishedServiceType: string;
    callsign?: string;
    frequencies: CommunicationFrequencyAssignment[];
  }> = [];
  if (serviceRows === undefined) {
    warnings.push({
      code: 'missing-section',
      message: 'Missing AD 2.18 table',
      aipSection: 'AD 2.18',
    });
  } else {
    let current: (typeof serviceDrafts)[number] | null = null;
    for (const row of expandTable($, serviceRows).slice(2)) {
      const [publishedService = '', callsign = '', frequency = '', hours = '', rowRemarks = ''] = row;
      if (publishedService !== '') {
        if (publishedService === 'NIL') {
          current = null;
          continue;
        }
        current = {
          publishedServiceType: publishedService,
          ...(callsign === '' ? {} : { callsign }),
          frequencies: [],
        };
        serviceDrafts.push(current);
      }
      if (current === null || frequency === '') continue;
      const match = /^(\d{3}\.\d{3})\s*MHZ$/i.exec(frequency);
      if (match?.[1] === undefined) {
        throw new AvinorEaipImportError('malformed-frequency', `Malformed frequency: ${frequency}`, 'AD 2.18');
      }
      current.frequencies.push({
        valueMHz: match[1],
        ...(hours === '' ? {} : { hours }),
        ...(rowRemarks === '' || rowRemarks === 'NIL' ? {} : { remarks: rowRemarks }),
      });
    }
  }

  const duplicateServiceTypes = new Set(
    serviceDrafts
      .map(({ publishedServiceType }) => publishedServiceType)
      .filter((value, index, all) => all.indexOf(value) !== index),
  );
  const services: CommunicationService[] = serviceDrafts.map((draft) => {
    const isAirspaceService =
      (draft.publishedServiceType === 'TWR' || draft.publishedServiceType === 'AFIS') &&
      draft.callsign !== undefined &&
      unitCallsign?.toLowerCase().startsWith(draft.callsign.toLowerCase());
    const serviceIdSuffix = duplicateServiceTypes.has(draft.publishedServiceType)
      ? `:${slug(draft.frequencies[0]?.valueMHz ?? draft.callsign ?? 'unknown')}`
      : '';
    return {
      id: `communication:ad2:${config.sourceAerodrome.toLowerCase()}:${slug(draft.publishedServiceType)}${serviceIdSuffix}`,
      serviceType: serviceType(draft.publishedServiceType),
      publishedServiceType: draft.publishedServiceType,
      ...(draft.callsign === undefined ? {} : { callsign: draft.callsign }),
      frequencies: draft.frequencies,
      associations: [
        {
          featureId: config.aerodromeFeatureId,
          featureKind: 'aerodrome' as const,
          basis: 'explicit' as const,
        },
        ...(isAirspaceService
          ? features.map((feature) => ({
              featureId: feature.ref.featureId,
              featureKind: 'airspace' as const,
              basis: 'unique-source-callsign-match' as const,
            }))
          : []),
      ],
      sourceReferences: [sourceReference(config, 'AD 2.18')],
    };
  });

  const featureDetails = detailsWithoutServices.map((details) => ({
    ...details,
    communicationServiceIds: services
      .filter((service) => service.associations.some(
        (association) => association.featureId === details.ref.featureId,
      ))
      .map((service) => service.id),
  }));
  return {
    features,
    featureDetails,
    atsUnits: [],
    communicationServices: services,
    warnings,
  };
}

export interface EnrAirspaceImportConfig extends Omit<OperationalImportConfig, 'sourceAerodrome'> {
  readonly publishedName: string;
  readonly associatedAerodromeFeatureIds: readonly string[];
}

export interface Enr21AirspacesImportConfig {
  readonly dataset: AeronauticalDatasetRef;
  readonly effectiveDate: string;
  readonly sourceUrl: string;
  readonly includedTypes?: readonly Extract<AirspaceType, 'tma' | 'cta'>[];
  readonly includedPublishedNames?: readonly string[];
  readonly associatedAerodromeFeatureIdsByName?: Readonly<
    Record<string, readonly string[]>
  >;
}

interface Enr21Group {
  readonly publishedName: string;
  readonly type: Extract<AirspaceType, 'tma' | 'cta'>;
  readonly definitions: string[];
  unitName: string;
  callsignHours: string;
  readonly frequencies: CommunicationFrequencyAssignment[];
}

function enr21SourceReference(
  config: Enr21AirspacesImportConfig,
  publishedName: string,
) {
  return {
    sourceType: 'eAIP-html' as const,
    sourceDocument: 'ENR 2.1',
    aipSection: 'ENR 2.1',
    publishedIdentifier: publishedName,
    sourceReference: config.sourceUrl,
  };
}

function enr21DefinitionParts(definition: string): {
  readonly upperText: string;
  readonly lowerText: string;
  readonly airspaceClass: AirspaceClass;
} {
  const upperText = /Upper limit:\s*(.+?)\s+Lower limit:/i.exec(definition)?.[1];
  const lowerMatch = /Lower limit:\s*(.+?)\s+Class\s+([A-G])\b/i.exec(definition);
  if (
    upperText === undefined ||
    lowerMatch?.[1] === undefined ||
    lowerMatch[2] === undefined
  ) {
    throw new AvinorEaipImportError(
      'malformed-vertical-limit-range',
      `Missing ENR limits: ${definition}`,
      'ENR 2.1',
    );
  }
  return {
    upperText: normalizeText(upperText),
    lowerText: normalizeText(lowerMatch[1]),
    airspaceClass: lowerMatch[2] as AirspaceClass,
  };
}

function hasUnsupportedEnr21Geometry(definition: string): boolean {
  return /\b(?:arc|circle|radius|border|boundary|coast(?:line)?)\b/i.test(
    definition,
  );
}

function addUniqueFrequency(
  target: CommunicationFrequencyAssignment[],
  frequencyText: string,
  remarks: string,
): void {
  if (frequencyText === '') return;
  const match = /^(\d{3}\.\d{3})\s*MHZ$/i.exec(frequencyText);
  if (match?.[1] === undefined) {
    throw new AvinorEaipImportError(
      'malformed-frequency',
      `Malformed frequency: ${frequencyText}`,
      'ENR 2.1',
    );
  }
  if (target.some(({ valueMHz }) => valueMHz === match[1])) return;
  target.push({
    valueMHz: match[1],
    ...(remarks === '' ? {} : { remarks }),
  });
}

/**
 * Imports selected ENR 2.1 TMA/CTA rows. Avinor publishes additional vertical
 * volumes as unnamed rows immediately after the named row; these are retained
 * as separate normalized areas rather than being flattened into one polygon.
 */
export function importEnr21Airspaces(
  source: string | Buffer,
  config: Enr21AirspacesImportConfig,
): OperationalImportResult {
  const $ = cheerio(source);
  const includedTypes = new Set(config.includedTypes ?? ['tma']);
  const includedNames =
    config.includedPublishedNames === undefined
      ? null
      : new Set(config.includedPublishedNames.map((name) => name.toLowerCase()));
  const groups = new Map<string, Enr21Group>();
  let currentGroup: Enr21Group | null = null;

  for (const table of $('table').toArray()) {
    currentGroup = null;
    for (const row of expandTable($, $(table))) {
      const [definition = '', unitName = '', callsignHours = '', frequency = '', remarks = ''] = row;
      const named = /^(.+?\b(TMA|CTA)\b)(?=\s+\d{6}(?:\.\d+)?[NS]\b)/i.exec(
        definition,
      );
      if (named?.[1] !== undefined && named[2] !== undefined) {
        const publishedName = normalizeText(named[1]);
        const type = named[2].toLowerCase() as Extract<AirspaceType, 'tma' | 'cta'>;
        if (
          !includedTypes.has(type) ||
          (includedNames !== null && !includedNames.has(publishedName.toLowerCase()))
        ) {
          currentGroup = null;
          continue;
        }
        const key = publishedName.toLowerCase();
        currentGroup = groups.get(key) ?? {
          publishedName,
          type,
          definitions: [],
          unitName: '',
          callsignHours: '',
          frequencies: [],
        };
        groups.set(key, currentGroup);
        if (!currentGroup.definitions.includes(definition)) {
          currentGroup.definitions.push(definition);
        }
      } else if (
        currentGroup !== null &&
        /Upper limit:/i.test(definition) &&
        /Lower limit:/i.test(definition) &&
        !currentGroup.definitions.includes(definition)
      ) {
        currentGroup.definitions.push(definition);
      } else if (definition !== '') {
        currentGroup = null;
      }

      if (currentGroup === null) continue;
      if (unitName !== '') currentGroup.unitName = unitName;
      if (callsignHours !== '') currentGroup.callsignHours = callsignHours;
      addUniqueFrequency(currentGroup.frequencies, frequency, remarks);
    }
  }

  const features: AeronauticalAreaFeature[] = [];
  const featureDetails: AeronauticalFeatureDetails[] = [];
  const atsUnits = new Map<string, AtsUnit>();
  const communicationServices: CommunicationService[] = [];
  const warnings: OperationalImportWarning[] = [];

  for (const group of groups.values()) {
    const sourceRef = enr21SourceReference(config, group.publishedName);
    const groupFeatures: AeronauticalAreaFeature[] = [];
    const groupDetails: AirspaceDetails[] = [];

    for (const definition of group.definitions) {
      try {
        if (hasUnsupportedEnr21Geometry(definition)) {
          throw new AvinorEaipImportError(
            'unsupported-airspace-geometry',
            `Airspace uses a non-coordinate-list boundary that is not yet normalized: ${group.publishedName}`,
            'ENR 2.1',
          );
        }
        const { upperText, lowerText, airspaceClass } = enr21DefinitionParts(definition);
        const coordinateMatches =
          definition.match(/\b\d{6}(?:\.\d+)?[NS]\s+\d{7}(?:\.\d+)?[EW]\b/g) ?? [];
        const firstCoordinate = coordinateMatches[0];
        if (firstCoordinate === undefined) {
          throw new AvinorEaipImportError(
            'insufficient-airspace-coordinates',
            `Missing published coordinates for ${group.publishedName}`,
            'ENR 2.1',
          );
        }
        const positionsAndRing = semanticRing(allPositions(definition, 'ENR 2.1'));
        const featureId = [
          'airspace:enr21',
          slug(group.publishedName),
          `${slug(lowerText)}-to-${slug(upperText)}`,
          slug(firstCoordinate),
        ].join(':');
        if (features.some((feature) => feature.ref.featureId === featureId)) {
          throw new AvinorEaipImportError(
            'duplicate-semantic-airspace-id',
            `Two ENR 2.1 volumes resolve to ${featureId}`,
            'ENR 2.1',
          );
        }
        const featureRef = {
          dataset: config.dataset,
          featureId,
          featureVersionId: config.effectiveDate,
          featureKind: group.type,
        } as const;
        const displayName = `${group.publishedName} (${lowerText}–${upperText})`;
        groupFeatures.push({
          geometryType: 'area',
          ref: featureRef,
          areaKind: group.type,
          identifier: group.publishedName,
          name: displayName,
          polygons: [{ outerRing: positionsAndRing.positions, holes: [] }],
        });
        groupDetails.push({
          detailKind: 'airspace',
          ref: featureRef,
          identifier: group.publishedName,
          publishedName: group.publishedName,
          airspaceType: group.type,
          publishedType: group.type.toUpperCase(),
          airspaceClass,
          lowerLimit: parseVerticalLimit(lowerText, 'ENR 2.1'),
          upperLimit: parseVerticalLimit(upperText, 'ENR 2.1'),
          sourceGeometry: { kind: 'polygon', rings: [positionsAndRing.ring] },
          communicationServiceIds: [],
          sourceReferences: [sourceRef],
        });
      } catch (error: unknown) {
        const importError =
          error instanceof AvinorEaipImportError
            ? error
            : new AvinorEaipImportError(
                'unexpected-airspace-import-error',
                error instanceof Error ? error.message : String(error),
                'ENR 2.1',
              );
        warnings.push({
          code: importError.code,
          message: importError.message,
          aipSection: 'ENR 2.1',
          publishedName: group.publishedName,
        });
      }
    }

    if (groupFeatures.length === 0) continue;
    let serviceId: string | null = null;
    if (group.frequencies.length > 0) {
      serviceId = `communication:enr21:${slug(group.publishedName)}:${group.type === 'tma' ? 'approach' : 'area-control'}`;
      const unitId = group.unitName === '' ? undefined : `ats-unit:${slug(group.unitName)}`;
      if (unitId !== undefined && !atsUnits.has(unitId)) {
        atsUnits.set(unitId, {
          id: unitId,
          publishedName: group.unitName,
          sourceReferences: [sourceRef],
        });
      }
      const callsign = group.callsignHours.replace(/\s+English\b.*$/i, '').trim();
      const associatedAerodromes =
        config.associatedAerodromeFeatureIdsByName?.[group.publishedName] ?? [];
      communicationServices.push({
        id: serviceId,
        serviceType: group.type === 'tma' ? 'approach' : 'area-control',
        publishedServiceType: group.type === 'tma' ? 'APP' : 'ACC',
        ...(unitId === undefined ? {} : { unitId }),
        ...(callsign === '' ? {} : { callsign }),
        frequencies: group.frequencies,
        associations: [
          ...groupFeatures.map((feature) => ({
            featureId: feature.ref.featureId,
            featureKind: 'airspace' as const,
            basis: 'explicit' as const,
          })),
          ...associatedAerodromes.map((featureId) => ({
            featureId,
            featureKind: 'aerodrome' as const,
            basis: 'explicit' as const,
          })),
        ],
        sourceReferences: [sourceRef],
      });
    }

    features.push(...groupFeatures);
    featureDetails.push(
      ...groupDetails.map((details) => ({
        ...details,
        communicationServiceIds:
          serviceId === null ? [] : [serviceId],
      })),
    );
  }

  return {
    features,
    featureDetails,
    atsUnits: [...atsUnits.values()],
    communicationServices,
    warnings,
  };
}

export function importEnr21Airspace(
  source: string | Buffer,
  config: EnrAirspaceImportConfig,
): OperationalImportResult {
  const result = importEnr21Airspaces(source, {
    dataset: config.dataset,
    effectiveDate: config.effectiveDate,
    sourceUrl: config.sourceUrl,
    includedPublishedNames: [config.publishedName],
    associatedAerodromeFeatureIdsByName: {
      [config.publishedName]: config.associatedAerodromeFeatureIds,
    },
  });
  if (result.features.length === 0) {
    throw new AvinorEaipImportError('missing-airspace', `Missing ${config.publishedName}`, 'ENR 2.1');
  }
  return result;
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
  const features: AeronauticalPointFeature[] = [];
  const details: ReportingPointDetails[] = [];
  const matches = extractedText.matchAll(
    /(?<![A-ZÆØÅ])([A-ZÆØÅ][A-ZÆØÅ -]*?)\s+(\d{6}[NS])\s+(\d{7}[EW])/gu,
  );
  for (const match of matches) {
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
