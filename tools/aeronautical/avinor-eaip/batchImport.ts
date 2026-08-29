import { load, loadBuffer } from 'cheerio';
import type { CheerioAPI } from 'cheerio';

import type {
  AeronauticalDatasetMetadata,
  AeronauticalFeature,
  AeronauticalFeatureDetails,
} from '../../../src/domain';
import { NORMALIZED_AERONAUTICAL_DATASET_SCHEMA_VERSION } from '../../../src/aeronautical/normalizedDataset';
import { expandTable } from './htmlTable';
import { importAerodromeEaip } from './importEndu';
import type {
  AvinorEaipAerodromeSource,
  AvinorEaipBatchEditionConfig,
  AvinorEaipBatchFailure,
  AvinorEaipBatchImportResult,
  AvinorEaipBatchWarning,
  AvinorEaipImportConfig,
} from './types';
import { AvinorEaipImportError } from './types';

export interface DiscoveredAvinorEaipAerodrome {
  readonly sourceAerodrome: string;
  readonly sourceUrl: string;
}

function parseHtml(source: string | Buffer): CheerioAPI {
  return typeof source === 'string' ? load(source) : loadBuffer(source);
}

/**
 * Discovers only AD 2 aerodrome pages from the selected edition's AD 1.3
 * index. AD 3 heliports are deliberately outside this importer scope.
 */
export function discoverAd2Aerodromes(
  indexHtml: string | Buffer,
  indexUrl: string,
): readonly DiscoveredAvinorEaipAerodrome[] {
  const discovered = new Map<string, DiscoveredAvinorEaipAerodrome>();
  const $ = parseHtml(indexHtml);

  const addAerodrome = (sourceAerodrome: string, sourceUrl: string): void => {
    const existing = discovered.get(sourceAerodrome);
    if (existing !== undefined && existing.sourceUrl !== sourceUrl) {
      throw new AvinorEaipImportError(
        'ambiguous-aerodrome-source',
        `AD 1.3 lists multiple source URLs for ${sourceAerodrome}`,
        'AD 1.3',
      );
    }
    discovered.set(sourceAerodrome, { sourceAerodrome, sourceUrl });
  };

  for (const link of $('a[href]').toArray()) {
    const href = link.attribs.href;
    if (href === undefined) {
      continue;
    }

    const match = /EN-AD-2\.([A-Z]{4})-en-GB\.html$/i.exec(href);
    if (match === null || match[1] === undefined) {
      continue;
    }

    const sourceAerodrome = match[1].toUpperCase();
    const sourceUrl = new URL(href, indexUrl).toString();
    addAerodrome(sourceAerodrome, sourceUrl);
  }

  // Avinor's published AD 1.3 index currently lists AD 2/AD 3 in table cells
  // rather than linking every row. The AD 2 page filename is a stable eAIP
  // convention, so derive it only from the semantic AD 2 row and ICAO code.
  for (const table of $('table').toArray()) {
    for (const row of expandTable($, $(table))) {
      const rowText = row.join(' ');
      if (!/\bAD\s*2\b/.test(rowText)) {
        continue;
      }
      const icaoMatch = /\b(EN[A-Z]{2})\b/.exec(rowText);
      if (icaoMatch?.[1] === undefined) {
        continue;
      }
      const sourceAerodrome = icaoMatch[1];
      addAerodrome(
        sourceAerodrome,
        new URL(`EN-AD-2.${sourceAerodrome}-en-GB.html`, indexUrl).toString(),
      );
    }
  }

  if (discovered.size === 0) {
    throw new AvinorEaipImportError(
      'missing-aerodrome-index-links',
      'AD 1.3 does not contain any AD 2 aerodrome entries',
      'AD 1.3',
    );
  }

  return [...discovered.values()];
}

function pageConfig(
  edition: AvinorEaipBatchEditionConfig,
  source: AvinorEaipAerodromeSource,
  retrievedAtUtc: string,
  importedAtUtc: string,
): AvinorEaipImportConfig {
  return {
    sourceAerodrome: source.sourceAerodrome,
    datasetId: edition.datasetId,
    editionLabel: edition.editionLabel,
    airacCycle: edition.airacCycle,
    effectiveFromUtc: edition.effectiveFromUtc,
    ...(edition.revisionId === undefined
      ? {}
      : { revisionId: edition.revisionId }),
    sourceUrl: source.sourceUrl,
    retrievedAtUtc,
    importedAtUtc,
  };
}

function asFailure(
  source: AvinorEaipAerodromeSource,
  error: unknown,
): AvinorEaipBatchFailure {
  if (error instanceof AvinorEaipImportError) {
    return {
      sourceAerodrome: source.sourceAerodrome,
      sourceUrl: source.sourceUrl,
      code: error.code,
      message: error.message,
      aipSection: error.aipSection,
    };
  }

  return {
    sourceAerodrome: source.sourceAerodrome,
    sourceUrl: source.sourceUrl,
    code: 'unexpected-import-error',
    message: error instanceof Error ? error.message : String(error),
    aipSection: null,
  };
}

function batchMetadata(
  edition: AvinorEaipBatchEditionConfig,
  retrievedAtUtc: string,
  importedAtUtc: string,
): AeronauticalDatasetMetadata {
  return {
    datasetId: edition.datasetId,
    providerId: 'avinor',
    sourceName: 'eAIP',
    airacCycle: edition.airacCycle,
    effectiveFromUtc: edition.effectiveFromUtc,
    effectiveToUtc: null,
    ...(edition.revisionId === undefined
      ? {}
      : { revisionId: edition.revisionId }),
    editionLabel: edition.editionLabel,
    retrievedAtUtc,
    importedAtUtc,
    sourceReference: edition.indexUrl,
  };
}

/**
 * Imports each AD 2 page independently so malformed or unavailable pages are
 * reported without discarding successfully normalized aerodromes.
 */
export function importAvinorEaipAerodromes(
  sources: readonly AvinorEaipAerodromeSource[],
  edition: AvinorEaipBatchEditionConfig,
  timestamps: { readonly retrievedAtUtc: string; readonly importedAtUtc: string },
): AvinorEaipBatchImportResult {
  const features: AeronauticalFeature[] = [];
  const featureDetails: AeronauticalFeatureDetails[] = [];
  const importedAerodromes: string[] = [];
  const warnings: AvinorEaipBatchWarning[] = [];
  const failures: AvinorEaipBatchFailure[] = [];
  const sourceAerodromes = new Set<string>();

  for (const source of sources) {
    if (sourceAerodromes.has(source.sourceAerodrome)) {
      failures.push({
        sourceAerodrome: source.sourceAerodrome,
        sourceUrl: source.sourceUrl,
        code: 'duplicate-aerodrome-source',
        message: `AD 1.3 contains ${source.sourceAerodrome} more than once`,
        aipSection: 'AD 1.3',
      });
      continue;
    }
    sourceAerodromes.add(source.sourceAerodrome);

    try {
      const result = importAerodromeEaip(
        source.html,
        pageConfig(
          edition,
          source,
          timestamps.retrievedAtUtc,
          timestamps.importedAtUtc,
        ),
      );
      features.push(...result.dataset.features);
      featureDetails.push(...result.dataset.featureDetails);
      importedAerodromes.push(source.sourceAerodrome);
      warnings.push(
        ...result.warnings.map((warning) => ({
          ...warning,
          sourceAerodrome: source.sourceAerodrome,
          sourceUrl: source.sourceUrl,
        })),
      );
    } catch (error: unknown) {
      failures.push(asFailure(source, error));
    }
  }

  return {
    dataset: {
      schemaVersion: NORMALIZED_AERONAUTICAL_DATASET_SCHEMA_VERSION,
      metadata: batchMetadata(
        edition,
        timestamps.retrievedAtUtc,
        timestamps.importedAtUtc,
      ),
      features,
      featureDetails,
    },
    importedAerodromes,
    warnings,
    failures,
  };
}
