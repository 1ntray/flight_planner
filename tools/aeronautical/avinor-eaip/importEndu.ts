import { loadBuffer, load } from 'cheerio';
import type { CheerioAPI } from 'cheerio';

import type {
  AerodromeRunway,
  AeronauticalDatasetMetadata,
  AeronauticalDatasetRef,
  AeronauticalFeatureRef,
  RunwayDeclaredDistances,
  RunwayDirection,
} from '../../../src/domain';
import { NORMALIZED_AERONAUTICAL_DATASET_SCHEMA_VERSION } from '../../../src/aeronautical/normalizedDataset';
import {
  expandTable,
  findSectionTables,
  visibleText,
} from './htmlTable';
import { parseCompactDmsPosition } from './parseCoordinate';
import type {
  AvinorEaipImportConfig,
  AvinorEaipImportResult,
  AvinorEaipImportWarning,
} from './types';
import { AvinorEaipImportError } from './types';

type LogicalTable = readonly (readonly string[])[];

interface RunwaySourceRow {
  readonly designator: string;
  readonly trueBearingDeg: number | null;
  readonly lengthM: number | null;
}

function runwayDesignators(value: string): readonly string[] {
  return value.match(/\d{2}[LCRS]?/g) ?? [];
}

function alignDirectionalValues<T>(
  values: readonly T[],
  designators: readonly string[],
  valueName: string,
  aipSection: string,
): readonly T[] {
  if (values.length === 1) {
    return Array.from({ length: designators.length }, () => values[0] as T);
  }
  if (values.length === designators.length) {
    return values;
  }
  return importerError(
    'ambiguous-runway-value',
    `Published ${valueName} values do not align with runway designators: ${designators.join(' ')}`,
    aipSection,
  );
}

function importerError(
  code: string,
  message: string,
  aipSection: string | null,
): never {
  throw new AvinorEaipImportError(code, message, aipSection);
}

function addWarning(
  warnings: AvinorEaipImportWarning[],
  code: string,
  message: string,
  aipSection: string,
): void {
  warnings.push({ code, message, aipSection });
}

function parseHtml(source: string | Buffer): CheerioAPI {
  return typeof source === 'string' ? load(source) : loadBuffer(source);
}

function headerIndex(
  header: readonly string[],
  name: string,
  aipSection: string,
): number {
  const index = header.indexOf(name);
  if (index < 0) {
    importerError(
      'missing-column',
      `Missing required ${aipSection} column: ${name}`,
      aipSection,
    );
  }
  return index;
}

function tableWithHeader(
  $: CheerioAPI,
  sourceAerodrome: string,
  aipSection: string,
  requiredColumns: readonly string[],
): { readonly rows: LogicalTable; readonly header: readonly string[] } {
  for (const table of findSectionTables($, `${sourceAerodrome} ${aipSection}`)) {
    const rows = expandTable($, table);
    const header = rows.find((row) =>
      requiredColumns.every((column) => row.includes(column)),
    );
    if (header !== undefined) {
      return { rows, header };
    }
  }

  return importerError(
    'missing-table',
    `Could not find the expected ${aipSection} table`,
    aipSection,
  );
}

function sourceIdentity(
  $: CheerioAPI,
  expectedIcao: string,
): { readonly icaoIdentifier: string; readonly name: string } {
  const identityPattern = /^([A-Z]{4})\s+(?:—|–|-)\s+(.+)$/;
  for (const node of $('h1, h2, h3').toArray()) {
    const match = identityPattern.exec(visibleText($(node)));
    if (match === null || match[1] === undefined || match[2] === undefined) {
      continue;
    }
    if (match[1] !== expectedIcao) {
      importerError(
        'unexpected-aerodrome',
        `Expected ${expectedIcao}, found ${match[1]}`,
        'AD 2.1',
      );
    }
    return { icaoIdentifier: match[1], name: match[2].trim() };
  }

  return importerError(
    'missing-aerodrome-identity',
    `Could not find the ${expectedIcao} aerodrome name heading`,
    'AD 2.1',
  );
}

function parseAerodromeFacts(
  $: CheerioAPI,
  sourceAerodrome: string,
  warnings: AvinorEaipImportWarning[],
) {
  const { rows } = tableWithHeader($, sourceAerodrome, 'AD 2.2', [
    'ARP coordinates and site at AD',
  ]);
  const arpRow = rows.find((row) =>
    row.some((cell) => cell.startsWith('ARP coordinates and site at AD')),
  );
  if (arpRow === undefined) {
    return importerError(
      'missing-arp',
      `${sourceAerodrome} AD 2.2 does not contain an ARP row`,
      'AD 2.2',
    );
  }
  const arpCell = arpRow.find((cell) => /[NS]\s+\d{7}(?:\.\d+)?[EW]/.test(cell));
  if (arpCell === undefined) {
    return importerError(
      'missing-arp-position',
      `${sourceAerodrome} AD 2.2 ARP row does not contain a WGS84 position`,
      'AD 2.2',
    );
  }

  const elevationRow = rows.find((row) =>
    row.some((cell) => cell.startsWith('ELEV/REF TEMP')),
  );
  let elevationFt: number | null = null;
  if (elevationRow === undefined) {
    addWarning(
      warnings,
      'missing-aerodrome-elevation',
      'Aerodrome elevation is unavailable',
      'AD 2.2',
    );
  } else {
    const valueCell = elevationRow.find((cell) => /\bFT\b/.test(cell));
    if (valueCell === undefined || valueCell === '' || valueCell === 'NIL') {
      addWarning(
        warnings,
        'missing-aerodrome-elevation',
        'Aerodrome elevation is unavailable',
        'AD 2.2',
      );
    } else {
      const match = /^(-?[\d\s]+(?:\.\d+)?)\s*FT\b/.exec(valueCell);
      if (match === null || match[1] === undefined) {
        return importerError(
          'malformed-aerodrome-elevation',
          `Malformed aerodrome elevation: ${valueCell}`,
          'AD 2.2',
        );
      }
      elevationFt = Number(match[1].replaceAll(/\s/g, ''));
    }
  }

  return {
    arpPosition: parseCompactDmsPosition(arpCell, 'AD 2.2'),
    elevationFt,
  };
}

function optionalBearings(
  value: string,
  designators: readonly string[],
  warnings: AvinorEaipImportWarning[],
): readonly (number | null)[] {
  if (value === '' || value === 'NIL') {
    for (const designator of designators) {
      addWarning(
        warnings,
        'missing-runway-bearing',
        `True bearing is unavailable for runway ${designator}`,
        'AD 2.12',
      );
    }
    return designators.map(() => null);
  }
  const matches = [...value.matchAll(/(\d+(?:\.\d+)?)°/g)];
  if (matches.length === 0 || matches.join('') === '') {
    return importerError(
      'malformed-runway-bearing',
      `Malformed true bearing for runway ${designators[0] ?? 'unknown'}: ${value}`,
      'AD 2.12',
    );
  }
  const bearings = matches.map((match) => {
    const bearing = Number(match[1]);
    if (!Number.isFinite(bearing) || bearing < 0 || bearing >= 360) {
      return importerError(
        'runway-bearing-out-of-range',
        `Out-of-range true bearing for runway ${designators[0] ?? 'unknown'}: ${value}`,
        'AD 2.12',
      );
    }
    return bearing;
  });
  return alignDirectionalValues(bearings, designators, 'true bearing', 'AD 2.12');
}

function optionalPhysicalLengths(
  value: string,
  designators: readonly string[],
  warnings: AvinorEaipImportWarning[],
): readonly (number | null)[] {
  if (value === '' || value === 'NIL') {
    for (const designator of designators) {
      addWarning(
        warnings,
        'missing-physical-runway-length',
        `Physical length is unavailable for runway ${designator}`,
        'AD 2.12',
      );
    }
    return designators.map(() => null);
  }
  const match = /^(.+?)\s*x\s*\d+(?:\.\d+)?$/i.exec(value);
  if (match === null || match[1] === undefined) {
    return importerError(
      'malformed-runway-dimensions',
      `Malformed runway dimensions for runway ${designators[0] ?? 'unknown'}: ${value}`,
      'AD 2.12',
    );
  }
  const lengths = match[1].trim().split(/\s+/);
  if (lengths.some((length) => !/^\d+(?:\.\d+)?$/.test(length))) {
    return importerError(
      'malformed-runway-dimensions',
      `Malformed runway dimensions for runway ${designators[0] ?? 'unknown'}: ${value}`,
      'AD 2.12',
    );
  }
  return alignDirectionalValues(
    lengths.map(Number),
    designators,
    'physical runway length',
    'AD 2.12',
  );
}

function parseRunwaySourceRows(
  $: CheerioAPI,
  sourceAerodrome: string,
  warnings: AvinorEaipImportWarning[],
): readonly RunwaySourceRow[] {
  const { rows, header } = tableWithHeader($, sourceAerodrome, 'AD 2.12', [
    'RWY',
    'BRG GEO',
    'DMN (M)',
  ]);
  const designatorColumn = headerIndex(header, 'RWY', 'AD 2.12');
  const bearingColumn = headerIndex(header, 'BRG GEO', 'AD 2.12');
  const dimensionColumn = headerIndex(header, 'DMN (M)', 'AD 2.12');

  const sourceRows = rows
    .flatMap((row): readonly RunwaySourceRow[] => {
      const designatorCell = row[designatorColumn];
      if (designatorCell === undefined) {
        return importerError(
          'missing-runway-designator',
          'Runway row has no designator',
          'AD 2.12',
        );
      }
      const designators = runwayDesignators(designatorCell);
      if (designators.length === 0) return [];
      const bearings = optionalBearings(row[bearingColumn] ?? '', designators, warnings);
      const lengths = optionalPhysicalLengths(row[dimensionColumn] ?? '', designators, warnings);
      return designators.map((designator, index) => ({
        designator,
        trueBearingDeg: bearings[index] ?? null,
        lengthM: lengths[index] ?? null,
      }));
    });

  if (sourceRows.length === 0) {
    return importerError(
      'missing-runways',
      `${sourceAerodrome} AD 2.12 does not contain any runway directions`,
      'AD 2.12',
    );
  }
  return sourceRows;
}

function optionalDeclaredDistances(
  value: string,
  designators: readonly string[],
  distanceName: string,
  warnings: AvinorEaipImportWarning[],
): readonly (number | null)[] {
  if (value === '' || value === 'NIL') {
    for (const designator of designators) {
      addWarning(
        warnings,
        'missing-declared-distance',
        `${distanceName} is unavailable for runway ${designator}`,
        'AD 2.13',
      );
    }
    return designators.map(() => null);
  }
  const values = value.trim().split(/\s+/);
  if (values.some((distance) => !/^\d+(?:\.\d+)?$/.test(distance))) {
    return importerError(
      'malformed-declared-distance',
      `Malformed ${distanceName} for runway ${designators[0] ?? 'unknown'}: ${value}`,
      'AD 2.13',
    );
  }
  return alignDirectionalValues(
    values.map(Number),
    designators,
    distanceName,
    'AD 2.13',
  );
}

function parseDeclaredDistances(
  $: CheerioAPI,
  sourceAerodrome: string,
  warnings: AvinorEaipImportWarning[],
): ReadonlyMap<string, RunwayDeclaredDistances> {
  // Requiring LDA intentionally selects the standard table and excludes the
  // separate "Reduced (Alternate) Take-off PSN" table.
  const { rows, header } = tableWithHeader($, sourceAerodrome, 'AD 2.13', [
    'RWY',
    'TORA (M)',
    'ASDA (M)',
    'TODA (M)',
    'LDA (M)',
  ]);
  const designatorColumn = headerIndex(header, 'RWY', 'AD 2.13');
  const columns = {
    toraM: headerIndex(header, 'TORA (M)', 'AD 2.13'),
    asdaM: headerIndex(header, 'ASDA (M)', 'AD 2.13'),
    todaM: headerIndex(header, 'TODA (M)', 'AD 2.13'),
    ldaM: headerIndex(header, 'LDA (M)', 'AD 2.13'),
  };

  return new Map(
    rows
      .flatMap((row) => {
        const designatorCell = row[designatorColumn];
        if (designatorCell === undefined) {
          return importerError(
            'missing-runway-designator',
            'Declared-distance row has no runway designator',
            'AD 2.13',
          );
        }
        const designators = runwayDesignators(designatorCell);
        if (designators.length === 0) return [];
        const toraM = optionalDeclaredDistances(row[columns.toraM] ?? '', designators, 'TORA', warnings);
        const todaM = optionalDeclaredDistances(row[columns.todaM] ?? '', designators, 'TODA', warnings);
        const asdaM = optionalDeclaredDistances(row[columns.asdaM] ?? '', designators, 'ASDA', warnings);
        const ldaM = optionalDeclaredDistances(row[columns.ldaM] ?? '', designators, 'LDA', warnings);
        return designators.map((designator, index) => [
          designator,
          {
            toraM: toraM[index] ?? null,
            todaM: todaM[index] ?? null,
            asdaM: asdaM[index] ?? null,
            ldaM: ldaM[index] ?? null,
          },
        ] as const);
      }),
  );
}

function buildRunway(
  sourceRows: readonly RunwaySourceRow[],
  declaredDistances: ReadonlyMap<string, RunwayDeclaredDistances>,
  warnings: AvinorEaipImportWarning[],
): AerodromeRunway {
  const publishedLengths = new Set(
    sourceRows.flatMap((row) => (row.lengthM === null ? [] : [row.lengthM])),
  );
  if (publishedLengths.size > 1) {
    return importerError(
      'ambiguous-physical-runway-length',
      'Runway directions publish conflicting physical lengths',
      'AD 2.12',
    );
  }

  const directions = sourceRows.map((row): RunwayDirection => {
    const distances = declaredDistances.get(row.designator);
    if (distances === undefined) {
      addWarning(
        warnings,
        'missing-runway-declared-distances',
        `Standard declared distances are unavailable for runway ${row.designator}`,
        'AD 2.13',
      );
    }
    return {
      designator: row.designator,
      trueBearingDeg: row.trueBearingDeg,
      declaredDistances: distances ?? {
        toraM: null,
        todaM: null,
        asdaM: null,
        ldaM: null,
      },
    };
  });

  return {
    identifier: directions.map((direction) => direction.designator).join('/'),
    lengthM: publishedLengths.values().next().value ?? null,
    directions,
  };
}

function oppositeRunwayDesignator(designator: string): string | null {
  const match = /^(\d{2})([LCRS]?)$/.exec(designator);
  if (match === null || match[1] === undefined) {
    return null;
  }

  const number = Number(match[1]);
  if (number < 1 || number > 36) {
    return null;
  }

  const suffix = match[2] ?? '';
  const oppositeSuffix =
    suffix === 'L' ? 'R' : suffix === 'R' ? 'L' : suffix;
  const oppositeNumber = ((number + 17) % 36) + 1;

  return `${String(oppositeNumber).padStart(2, '0')}${oppositeSuffix}`;
}

function buildRunways(
  sourceRows: readonly RunwaySourceRow[],
  declaredDistances: ReadonlyMap<string, RunwayDeclaredDistances>,
  warnings: AvinorEaipImportWarning[],
): readonly AerodromeRunway[] {
  const rowsByDesignator = new Map(
    sourceRows.map((row) => [row.designator, row] as const),
  );
  const consumedDesignators = new Set<string>();
  const runways: AerodromeRunway[] = [];

  for (const row of sourceRows) {
    if (consumedDesignators.has(row.designator)) {
      continue;
    }

    const opposite = oppositeRunwayDesignator(row.designator);
    const reciprocal = opposite === null ? undefined : rowsByDesignator.get(opposite);
    const runwayRows = reciprocal === undefined ? [row] : [row, reciprocal];

    for (const runwayRow of runwayRows) {
      consumedDesignators.add(runwayRow.designator);
    }
    runways.push(buildRunway(runwayRows, declaredDistances, warnings));
  }

  return runways;
}

function validateEditionMetadata($: CheerioAPI, config: AvinorEaipImportConfig) {
  const publishedEffectiveDate = $('meta[name="EM.effectiveDateStart"]').attr(
    'content',
  );
  const configuredEffectiveDate = config.effectiveFromUtc.slice(0, 10);
  if (
    publishedEffectiveDate === undefined ||
    publishedEffectiveDate !== configuredEffectiveDate
  ) {
    importerError(
      'effective-date-mismatch',
      `Expected effective date ${configuredEffectiveDate}, found ${publishedEffectiveDate ?? 'none'}`,
      null,
    );
  }
}

function compactDatasetRef(
  metadata: AeronauticalDatasetMetadata,
): AeronauticalDatasetRef {
  return {
    datasetId: metadata.datasetId,
    providerId: metadata.providerId,
    sourceName: metadata.sourceName,
    airacCycle: metadata.airacCycle,
    effectiveFromUtc: metadata.effectiveFromUtc,
    effectiveToUtc: metadata.effectiveToUtc,
    ...(metadata.revisionId === undefined
      ? {}
      : { revisionId: metadata.revisionId }),
  };
}

export function importAerodromeEaip(
  source: string | Buffer,
  config: AvinorEaipImportConfig,
): AvinorEaipImportResult {
  const $ = parseHtml(source);
  const warnings: AvinorEaipImportWarning[] = [];
  validateEditionMetadata($, config);

  const identity = sourceIdentity($, config.sourceAerodrome);
  const facts = parseAerodromeFacts($, config.sourceAerodrome, warnings);
  const runwaySourceRows = parseRunwaySourceRows(
    $,
    config.sourceAerodrome,
    warnings,
  );
  const declaredDistances = parseDeclaredDistances(
    $,
    config.sourceAerodrome,
    warnings,
  );
  const runways = buildRunways(runwaySourceRows, declaredDistances, warnings);

  const metadata: AeronauticalDatasetMetadata = {
    datasetId: config.datasetId,
    providerId: 'avinor',
    sourceName: 'eAIP',
    airacCycle: config.airacCycle,
    effectiveFromUtc: config.effectiveFromUtc,
    effectiveToUtc: null,
    ...(config.revisionId === undefined
      ? {}
      : { revisionId: config.revisionId }),
    editionLabel: config.editionLabel,
    retrievedAtUtc: config.retrievedAtUtc,
    importedAtUtc: config.importedAtUtc,
    sourceReference: config.sourceUrl,
  };
  const datasetRef = compactDatasetRef(metadata);
  const featureRef: AeronauticalFeatureRef = {
    dataset: datasetRef,
    featureId: `aerodrome:${identity.icaoIdentifier}`,
    featureVersionId: config.effectiveFromUtc.slice(0, 10),
    featureKind: 'aerodrome',
  };
  const sourceReferences = ['AD 2.1', 'AD 2.2', 'AD 2.12', 'AD 2.13'].map(
    (aipSection) => ({
      sourceAerodrome: identity.icaoIdentifier,
      aipSection,
      sourceReference: config.sourceUrl,
    }),
  );

  return {
    dataset: {
      schemaVersion: NORMALIZED_AERONAUTICAL_DATASET_SCHEMA_VERSION,
      metadata,
      features: [
        {
          geometryType: 'point',
          pointKind: 'aerodrome',
          ref: featureRef,
          identifier: identity.icaoIdentifier,
          name: identity.name,
          suggestedWaypointName: identity.icaoIdentifier,
          position: facts.arpPosition,
        },
      ],
      featureDetails: [
        {
          detailKind: 'aerodrome',
          ref: featureRef,
          icaoIdentifier: identity.icaoIdentifier,
          name: identity.name,
          arpPosition: facts.arpPosition,
          elevationFt: facts.elevationFt,
          runways,
          sourceReferences,
        },
      ],
      atsServiceAreas: [],
      atsUnits: [],
      communicationServices: [],
      vacCharts: [],
    },
    warnings,
  };
}

/** @deprecated Use importAerodromeEaip for a configured aerodrome page. */
export const importEnduEaip = importAerodromeEaip;
