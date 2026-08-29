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
  aipSection: string,
  requiredColumns: readonly string[],
): { readonly rows: LogicalTable; readonly header: readonly string[] } {
  for (const table of findSectionTables($, `ENDU ${aipSection}`)) {
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
  warnings: AvinorEaipImportWarning[],
) {
  const { rows } = tableWithHeader($, 'AD 2.2', [
    'ARP coordinates and site at AD',
  ]);
  const arpRow = rows.find((row) =>
    row.some((cell) => cell.startsWith('ARP coordinates and site at AD')),
  );
  if (arpRow === undefined) {
    return importerError(
      'missing-arp',
      'ENDU AD 2.2 does not contain an ARP row',
      'AD 2.2',
    );
  }
  const arpCell = arpRow.find((cell) => /[NS]\s+\d{7}(?:\.\d+)?[EW]/.test(cell));
  if (arpCell === undefined) {
    return importerError(
      'missing-arp-position',
      'ENDU AD 2.2 ARP row does not contain a WGS84 position',
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
      const match = /^(-?\d+(?:\.\d+)?)\s*FT\b/.exec(valueCell);
      if (match === null || match[1] === undefined) {
        return importerError(
          'malformed-aerodrome-elevation',
          `Malformed aerodrome elevation: ${valueCell}`,
          'AD 2.2',
        );
      }
      elevationFt = Number(match[1]);
    }
  }

  return {
    arpPosition: parseCompactDmsPosition(arpCell, 'AD 2.2'),
    elevationFt,
  };
}

function optionalBearing(
  value: string,
  designator: string,
  warnings: AvinorEaipImportWarning[],
): number | null {
  if (value === '' || value === 'NIL') {
    addWarning(
      warnings,
      'missing-runway-bearing',
      `True bearing is unavailable for runway ${designator}`,
      'AD 2.12',
    );
    return null;
  }
  const match = /^(\d+(?:\.\d+)?)°$/.exec(value);
  if (match === null || match[1] === undefined) {
    return importerError(
      'malformed-runway-bearing',
      `Malformed true bearing for runway ${designator}: ${value}`,
      'AD 2.12',
    );
  }
  const bearing = Number(match[1]);
  if (!Number.isFinite(bearing) || bearing < 0 || bearing >= 360) {
    return importerError(
      'runway-bearing-out-of-range',
      `Out-of-range true bearing for runway ${designator}: ${value}`,
      'AD 2.12',
    );
  }
  return bearing;
}

function optionalPhysicalLength(
  value: string,
  designator: string,
  warnings: AvinorEaipImportWarning[],
): number | null {
  if (value === '' || value === 'NIL') {
    addWarning(
      warnings,
      'missing-physical-runway-length',
      `Physical length is unavailable for runway ${designator}`,
      'AD 2.12',
    );
    return null;
  }
  const match = /^(\d+(?:\.\d+)?)\s*x\s*\d+(?:\.\d+)?$/i.exec(value);
  if (match === null || match[1] === undefined) {
    return importerError(
      'malformed-runway-dimensions',
      `Malformed runway dimensions for runway ${designator}: ${value}`,
      'AD 2.12',
    );
  }
  return Number(match[1]);
}

function parseRunwaySourceRows(
  $: CheerioAPI,
  warnings: AvinorEaipImportWarning[],
): readonly RunwaySourceRow[] {
  const { rows, header } = tableWithHeader($, 'AD 2.12', [
    'RWY',
    'BRG GEO',
    'DMN (M)',
  ]);
  const designatorColumn = headerIndex(header, 'RWY', 'AD 2.12');
  const bearingColumn = headerIndex(header, 'BRG GEO', 'AD 2.12');
  const dimensionColumn = headerIndex(header, 'DMN (M)', 'AD 2.12');

  const sourceRows = rows
    .filter((row) => /^\d{2}[LCR]?$/.test(row[designatorColumn] ?? ''))
    .map((row): RunwaySourceRow => {
      const designator = row[designatorColumn];
      if (designator === undefined) {
        return importerError(
          'missing-runway-designator',
          'Runway row has no designator',
          'AD 2.12',
        );
      }
      return {
        designator,
        trueBearingDeg: optionalBearing(
          row[bearingColumn] ?? '',
          designator,
          warnings,
        ),
        lengthM: optionalPhysicalLength(
          row[dimensionColumn] ?? '',
          designator,
          warnings,
        ),
      };
    });

  if (sourceRows.length === 0) {
    return importerError(
      'missing-runways',
      'ENDU AD 2.12 does not contain any runway directions',
      'AD 2.12',
    );
  }
  return sourceRows;
}

function optionalDeclaredDistance(
  value: string,
  designator: string,
  distanceName: string,
  warnings: AvinorEaipImportWarning[],
): number | null {
  if (value === '' || value === 'NIL') {
    addWarning(
      warnings,
      'missing-declared-distance',
      `${distanceName} is unavailable for runway ${designator}`,
      'AD 2.13',
    );
    return null;
  }
  if (!/^\d+(?:\.\d+)?$/.test(value)) {
    return importerError(
      'malformed-declared-distance',
      `Malformed ${distanceName} for runway ${designator}: ${value}`,
      'AD 2.13',
    );
  }
  return Number(value);
}

function parseDeclaredDistances(
  $: CheerioAPI,
  warnings: AvinorEaipImportWarning[],
): ReadonlyMap<string, RunwayDeclaredDistances> {
  // Requiring LDA intentionally selects the standard table and excludes the
  // separate "Reduced (Alternate) Take-off PSN" table.
  const { rows, header } = tableWithHeader($, 'AD 2.13', [
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
      .filter((row) => /^\d{2}[LCR]?$/.test(row[designatorColumn] ?? ''))
      .map((row) => {
        const designator = row[designatorColumn];
        if (designator === undefined) {
          return importerError(
            'missing-runway-designator',
            'Declared-distance row has no runway designator',
            'AD 2.13',
          );
        }
        return [
          designator,
          {
            toraM: optionalDeclaredDistance(
              row[columns.toraM] ?? '',
              designator,
              'TORA',
              warnings,
            ),
            todaM: optionalDeclaredDistance(
              row[columns.todaM] ?? '',
              designator,
              'TODA',
              warnings,
            ),
            asdaM: optionalDeclaredDistance(
              row[columns.asdaM] ?? '',
              designator,
              'ASDA',
              warnings,
            ),
            ldaM: optionalDeclaredDistance(
              row[columns.ldaM] ?? '',
              designator,
              'LDA',
              warnings,
            ),
          },
        ] as const;
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

export function importEnduEaip(
  source: string | Buffer,
  config: AvinorEaipImportConfig,
): AvinorEaipImportResult {
  const $ = parseHtml(source);
  const warnings: AvinorEaipImportWarning[] = [];
  validateEditionMetadata($, config);

  const identity = sourceIdentity($, config.sourceAerodrome);
  const facts = parseAerodromeFacts($, warnings);
  const runwaySourceRows = parseRunwaySourceRows($, warnings);
  const declaredDistances = parseDeclaredDistances($, warnings);
  const runway = buildRunway(runwaySourceRows, declaredDistances, warnings);

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
          runways: [runway],
          sourceReferences,
        },
      ],
    },
    warnings,
  };
}
