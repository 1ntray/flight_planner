import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { NORWAY_EAIP_EDITION } from './edition';
import {
  runAvinorEaipImportPipeline,
  type AvinorEaipImportPipelineOptions,
} from './importPipeline';
import type { PreparedVacReportingPointDataset } from './preparedVacReportingPoints';

interface CliOptions {
  readonly inputIndexPath?: string;
  readonly inputDirectory?: string;
  readonly outputPath: string;
  readonly reportPath: string;
  readonly retrievedAtUtc?: string;
  readonly aerodromes?: readonly string[];
}

function optionValue(arguments_: readonly string[], name: string): string | undefined {
  const index = arguments_.indexOf(name);
  if (index < 0) return undefined;
  const value = arguments_[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function parseAerodromes(value: string | undefined): readonly string[] | undefined {
  if (value === undefined) return undefined;
  const aerodromes = value
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
  if (
    aerodromes.length === 0 ||
    aerodromes.some((icao) => !/^[A-Z]{4}$/.test(icao))
  ) {
    throw new Error('--aerodrome must be one or more comma-separated ICAO identifiers');
  }
  return aerodromes;
}

function parseOptions(arguments_: readonly string[]): CliOptions {
  const inputIndexPath = optionValue(arguments_, '--input-index');
  const inputDirectory = optionValue(arguments_, '--input-directory');
  if ((inputIndexPath === undefined) !== (inputDirectory === undefined)) {
    throw new Error('--input-index and --input-directory must be used together');
  }
  const retrievedAtUtc = optionValue(arguments_, '--retrieved-at');
  const aerodromes = parseAerodromes(optionValue(arguments_, '--aerodrome'));
  const suffix = aerodromes === undefined ? '' : `-${aerodromes.join('-')}`;
  const dataDirectory = aerodromes === undefined
    ? 'src/aeronautical/data'
    : 'data/aeronautical/development';
  const reportDirectory = aerodromes === undefined
    ? 'data/aeronautical/import-reports'
    : 'data/aeronautical/development';
  return {
    ...(inputIndexPath === undefined ? {} : { inputIndexPath }),
    ...(inputDirectory === undefined ? {} : { inputDirectory }),
    ...(retrievedAtUtc === undefined ? {} : { retrievedAtUtc }),
    ...(aerodromes === undefined ? {} : { aerodromes }),
    outputPath: optionValue(arguments_, '--output') ??
      `${dataDirectory}/${NORWAY_EAIP_EDITION.datasetId}${suffix}.json`,
    reportPath: optionValue(arguments_, '--report') ??
      `${reportDirectory}/${NORWAY_EAIP_EDITION.datasetId}${suffix}-aerodromes.json`,
  };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  const absolutePath = resolve(path);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const effectiveDate = NORWAY_EAIP_EDITION.effectiveFromUtc.slice(0, 10);
  const prepared = JSON.parse(await readFile(
    new URL(`./prepared/vac-reporting-points-${effectiveDate}.json`, import.meta.url),
    'utf8',
  )) as PreparedVacReportingPointDataset;
  const pipelineOptions: AvinorEaipImportPipelineOptions = {
    edition: NORWAY_EAIP_EDITION,
    supplementalData: { kind: 'prepared-vac-reporting-points', prepared },
    ...(options.inputIndexPath === undefined
      ? {}
      : { inputIndexPath: options.inputIndexPath }),
    ...(options.inputDirectory === undefined
      ? {}
      : { inputDirectory: options.inputDirectory }),
    ...(options.retrievedAtUtc === undefined
      ? {}
      : { retrievedAtUtc: options.retrievedAtUtc }),
    ...(options.aerodromes === undefined
      ? {}
      : { aerodromes: options.aerodromes }),
  };
  const artifacts = await runAvinorEaipImportPipeline(pipelineOptions);
  if (artifacts.report.failures.length > 0) {
    throw new Error(
      `Import produced ${artifacts.report.failures.length} failure(s); refusing to replace generated data`,
    );
  }
  await writeJson(options.outputPath, artifacts.dataset);
  await writeJson(options.reportPath, artifacts.report);
  console.log(`Wrote ${options.outputPath}`);
  console.log(`Wrote ${options.reportPath}`);
  console.log(
    `Imported aerodromes: ${artifacts.report.importedAerodromes.length}/${artifacts.report.discoveredAerodromeCount}`,
  );
  console.log(`Importer warnings: ${artifacts.report.warnings.length}`);
  console.log(`Importer failures: ${artifacts.report.failures.length}`);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
