import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { ENDU_EAIP_EDITION } from './edition';
import { importEnduEaip } from './importEndu';
import { AvinorEaipImportError } from './types';

interface CliOptions {
  readonly inputPath: string | null;
  readonly outputPath: string;
  readonly reportPath: string;
  readonly retrievedAtUtc: string | null;
}

function optionValue(arguments_: readonly string[], name: string): string | null {
  const index = arguments_.indexOf(name);
  if (index < 0) {
    return null;
  }
  const value = arguments_[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function parseOptions(arguments_: readonly string[]): CliOptions {
  return {
    inputPath: optionValue(arguments_, '--input'),
    outputPath:
      optionValue(arguments_, '--output') ??
      'src/aeronautical/data/avinor-eaip-2026-06-11.json',
    reportPath:
      optionValue(arguments_, '--report') ??
      'data/aeronautical/import-reports/avinor-eaip-2026-06-11-ENDU.json',
    retrievedAtUtc: optionValue(arguments_, '--retrieved-at'),
  };
}

function validTimestamp(value: string, optionName: string): string {
  if (Number.isNaN(Date.parse(value))) {
    throw new Error(`${optionName} must be an ISO timestamp`);
  }
  return new Date(value).toISOString();
}

async function acquireSource(options: CliOptions): Promise<{
  readonly html: Buffer;
  readonly retrievedAtUtc: string;
}> {
  if (options.inputPath !== null) {
    if (options.retrievedAtUtc === null) {
      throw new Error(
        '--retrieved-at is required with --input so provenance is not guessed',
      );
    }
    return {
      html: await readFile(resolve(options.inputPath)),
      retrievedAtUtc: validTimestamp(
        options.retrievedAtUtc,
        '--retrieved-at',
      ),
    };
  }

  const response = await fetch(ENDU_EAIP_EDITION.sourceUrl, {
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'user-agent': 'FlightPlanner-eAIP-Importer/0.1',
    },
  });
  if (!response.ok) {
    throw new Error(
      `Avinor eAIP retrieval failed: ${response.status} ${response.statusText}`,
    );
  }
  return {
    html: Buffer.from(await response.arrayBuffer()),
    retrievedAtUtc: new Date().toISOString(),
  };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  const absolutePath = resolve(path);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const source = await acquireSource(options);
  const importedAtUtc = new Date().toISOString();
  const result = importEnduEaip(source.html, {
    ...ENDU_EAIP_EDITION,
    retrievedAtUtc: source.retrievedAtUtc,
    importedAtUtc,
  });

  await writeJson(options.outputPath, result.dataset);
  await writeJson(options.reportPath, {
    provider: 'Avinor',
    source: 'eAIP',
    editionLabel: ENDU_EAIP_EDITION.editionLabel,
    sourceAerodrome: ENDU_EAIP_EDITION.sourceAerodrome,
    sourceUrl: ENDU_EAIP_EDITION.sourceUrl,
    retrievedAtUtc: source.retrievedAtUtc,
    importedAtUtc,
    warnings: result.warnings,
  });

  console.log(`Wrote ${options.outputPath}`);
  console.log(`Wrote ${options.reportPath}`);
  console.log(`Importer warnings: ${result.warnings.length}`);
}

main().catch((error: unknown) => {
  if (error instanceof AvinorEaipImportError) {
    console.error(
      `${error.code}${error.aipSection === null ? '' : ` (${error.aipSection})`}: ${error.message}`,
    );
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
