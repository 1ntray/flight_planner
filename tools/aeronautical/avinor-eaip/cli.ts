import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
  discoverAd2Aerodromes,
  importAvinorEaipAerodromes,
} from './batchImport';
import { NORWAY_EAIP_EDITION } from './edition';
import type {
  AvinorEaipAerodromeSource,
  AvinorEaipBatchFailure,
} from './types';

interface CliOptions {
  readonly inputIndexPath: string | null;
  readonly inputDirectory: string | null;
  readonly outputPath: string;
  readonly reportPath: string;
  readonly retrievedAtUtc: string | null;
  readonly aerodromes: readonly string[] | null;
}

interface AcquiredSources {
  readonly sources: readonly AvinorEaipAerodromeSource[];
  readonly retrievalFailures: readonly AvinorEaipBatchFailure[];
  readonly discoveredAerodromeCount: number;
  readonly retrievedAtUtc: string;
}

function optionValue(arguments_: readonly string[], name: string): string | null {
  const index = arguments_.indexOf(name);
  if (index < 0) return null;
  const value = arguments_[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

function parseAerodromes(value: string | null): readonly string[] | null {
  if (value === null) return null;
  const aerodromes = value.split(',').map((value_) => value_.trim().toUpperCase()).filter(Boolean);
  if (aerodromes.length === 0 || aerodromes.some((icao) => !/^[A-Z]{4}$/.test(icao))) {
    throw new Error('--aerodrome must be one or more comma-separated ICAO identifiers');
  }
  return aerodromes;
}

function parseOptions(arguments_: readonly string[]): CliOptions {
  const inputIndexPath = optionValue(arguments_, '--input-index');
  const inputDirectory = optionValue(arguments_, '--input-directory');
  if ((inputIndexPath === null) !== (inputDirectory === null)) {
    throw new Error('--input-index and --input-directory must be used together');
  }
  return {
    inputIndexPath,
    inputDirectory,
    outputPath: optionValue(arguments_, '--output') ?? 'src/aeronautical/data/avinor-eaip-2026-06-11.json',
    reportPath: optionValue(arguments_, '--report') ?? 'data/aeronautical/import-reports/avinor-eaip-2026-06-11-aerodromes.json',
    retrievedAtUtc: optionValue(arguments_, '--retrieved-at'),
    aerodromes: parseAerodromes(optionValue(arguments_, '--aerodrome')),
  };
}

function validTimestamp(value: string, optionName: string): string {
  if (Number.isNaN(Date.parse(value))) throw new Error(`${optionName} must be an ISO timestamp`);
  return new Date(value).toISOString();
}

function filterDiscoveredAerodromes<T extends { readonly sourceAerodrome: string }>(
  aerodromes: readonly T[],
  requestedAerodromes: readonly string[] | null,
): readonly T[] {
  if (requestedAerodromes === null) return aerodromes;
  const requested = new Set(requestedAerodromes);
  const selected = aerodromes.filter(({ sourceAerodrome }) => requested.has(sourceAerodrome));
  const missing = requestedAerodromes.filter((icao) => !selected.some(({ sourceAerodrome }) => sourceAerodrome === icao));
  if (missing.length > 0) throw new Error(`AD 1.3 does not list requested aerodrome(s): ${missing.join(', ')}`);
  return selected;
}

async function fetchPage(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': 'FlightPlanner-eAIP-Importer/0.1' },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return Buffer.from(await response.arrayBuffer());
}

function combineAcquisitionResults(
  discoveredAerodromeCount: number,
  retrievedAtUtc: string,
  results: readonly { readonly source: AvinorEaipAerodromeSource | null; readonly failure: AvinorEaipBatchFailure | null }[],
): AcquiredSources {
  return {
    sources: results.flatMap(({ source }) => source === null ? [] : [source]),
    retrievalFailures: results.flatMap(({ failure }) => failure === null ? [] : [failure]),
    discoveredAerodromeCount,
    retrievedAtUtc,
  };
}

async function acquireOnlineSources(options: CliOptions): Promise<AcquiredSources> {
  const indexHtml = await fetchPage(NORWAY_EAIP_EDITION.indexUrl);
  const discovered = filterDiscoveredAerodromes(discoverAd2Aerodromes(indexHtml, NORWAY_EAIP_EDITION.indexUrl), options.aerodromes);
  const retrievedAtUtc = new Date().toISOString();
  const results = await Promise.all(discovered.map(async (aerodrome) => {
    try {
      return { source: { ...aerodrome, html: await fetchPage(aerodrome.sourceUrl) }, failure: null };
    } catch (error: unknown) {
      return {
        source: null,
        failure: {
          sourceAerodrome: aerodrome.sourceAerodrome,
          sourceUrl: aerodrome.sourceUrl,
          code: 'source-retrieval-failed',
          message: error instanceof Error ? error.message : String(error),
          aipSection: null,
        } satisfies AvinorEaipBatchFailure,
      };
    }
  }));
  return combineAcquisitionResults(discovered.length, retrievedAtUtc, results);
}

async function acquireOfflineSources(options: CliOptions): Promise<AcquiredSources> {
  if (options.inputIndexPath === null || options.inputDirectory === null || options.retrievedAtUtc === null) {
    throw new Error('Offline import requires --input-index, --input-directory, and --retrieved-at');
  }
  const inputDirectory = options.inputDirectory;
  const retrievedAtUtc = validTimestamp(options.retrievedAtUtc, '--retrieved-at');
  const indexHtml = await readFile(resolve(options.inputIndexPath));
  const discovered = filterDiscoveredAerodromes(discoverAd2Aerodromes(indexHtml, NORWAY_EAIP_EDITION.indexUrl), options.aerodromes);
  const results = await Promise.all(discovered.map(async (aerodrome) => {
    try {
      return { source: { ...aerodrome, html: await readFile(resolve(inputDirectory, `${aerodrome.sourceAerodrome}.html`)) }, failure: null };
    } catch (error: unknown) {
      return {
        source: null,
        failure: {
          sourceAerodrome: aerodrome.sourceAerodrome,
          sourceUrl: aerodrome.sourceUrl,
          code: 'source-read-failed',
          message: error instanceof Error ? error.message : String(error),
          aipSection: null,
        } satisfies AvinorEaipBatchFailure,
      };
    }
  }));
  return combineAcquisitionResults(discovered.length, retrievedAtUtc, results);
}

async function writeJson(path: string, value: unknown): Promise<void> {
  const absolutePath = resolve(path);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const acquired = options.inputIndexPath === null ? await acquireOnlineSources(options) : await acquireOfflineSources(options);
  const importedAtUtc = new Date().toISOString();
  const result = importAvinorEaipAerodromes(acquired.sources, NORWAY_EAIP_EDITION, { retrievedAtUtc: acquired.retrievedAtUtc, importedAtUtc });
  const failures = [...acquired.retrievalFailures, ...result.failures];
  if (result.importedAerodromes.length === 0) {
    throw new Error('No aerodromes were successfully imported; refusing to replace the dataset');
  }
  await writeJson(options.outputPath, result.dataset);
  await writeJson(options.reportPath, {
    provider: 'Avinor', source: 'eAIP', editionLabel: NORWAY_EAIP_EDITION.editionLabel,
    effectiveFromUtc: NORWAY_EAIP_EDITION.effectiveFromUtc, sourceIndexUrl: NORWAY_EAIP_EDITION.indexUrl,
    retrievedAtUtc: acquired.retrievedAtUtc, importedAtUtc,
    discoveredAerodromeCount: acquired.discoveredAerodromeCount,
    importedAerodromes: result.importedAerodromes, warnings: result.warnings, failures,
  });
  console.log(`Wrote ${options.outputPath}`);
  console.log(`Wrote ${options.reportPath}`);
  console.log(`Imported aerodromes: ${result.importedAerodromes.length}/${acquired.discoveredAerodromeCount}`);
  console.log(`Importer warnings: ${result.warnings.length}`);
  console.log(`Importer failures: ${failures.length}`);
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
