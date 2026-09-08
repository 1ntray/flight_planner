import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import type { NormalizedAeronauticalDataset } from '../../../src/aeronautical/normalizedDataset';
import {
  compareAeronauticalDatasets,
  renderAiracChangeReport,
} from './airacDiff';
import {
  renderApprovedEditionSource,
  renderApprovedRepositorySource,
} from './approvedEditionFiles';
import { validateAiracCandidate } from './candidateValidation';
import { NORWAY_EAIP_EDITION } from './edition';
import {
  compareAvinorEaipEditions,
  discoverLatestAvinorEaipEdition,
  type DiscoveredAvinorEaipEdition,
} from './editionDiscovery';
import {
  runAvinorEaipImportPipeline,
  type AvinorEaipImportReport,
} from './importPipeline';

export interface AiracUpdateCheck {
  readonly updateAvailable: boolean;
  readonly approvedEdition: string;
  readonly discovered: DiscoveredAvinorEaipEdition;
}

export interface AiracUpdateResult extends AiracUpdateCheck {
  readonly candidateValidated?: boolean;
  readonly datasetPath?: string;
  readonly importReportPath?: string;
  readonly changeReportPath?: string;
}

function approvedDatasetPath(): string {
  return resolve('src/aeronautical/data', `${NORWAY_EAIP_EDITION.datasetId}.json`);
}

function approvedImportReportPath(): string {
  return resolve(
    'data/aeronautical/import-reports',
    `${NORWAY_EAIP_EDITION.datasetId}-aerodromes.json`,
  );
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

async function atomicWrite(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.airac-candidate-${process.pid}`;
  await writeFile(temporaryPath, contents, 'utf8');
  await rename(temporaryPath, path);
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await atomicWrite(path, `${JSON.stringify(value, null, 2)}\n`);
}

function relativeForOutput(path: string): string {
  return path.replaceAll('\\', '/');
}

export async function writeGithubOutputs(
  result: AiracUpdateResult,
  outputPath = process.env.GITHUB_OUTPUT,
): Promise<void> {
  if (outputPath === undefined || outputPath === '') return;
  const entries: Readonly<Record<string, string>> = {
    update_available: String(result.updateAvailable),
    approved_edition: result.approvedEdition,
    edition_label: result.discovered.edition.editionLabel,
    effective_date: result.discovered.edition.effectiveFromUtc.slice(0, 10),
    dataset_id: result.discovered.edition.datasetId,
    ...(result.datasetPath === undefined
      ? {}
      : { dataset_path: relativeForOutput(result.datasetPath) }),
    ...(result.importReportPath === undefined
      ? {}
      : { import_report_path: relativeForOutput(result.importReportPath) }),
    ...(result.changeReportPath === undefined
      ? {}
      : { change_report_path: relativeForOutput(result.changeReportPath) }),
  };
  await appendFile(
    outputPath,
    Object.entries(entries).map(([key, value]) => `${key}=${value}\n`).join(''),
    'utf8',
  );
}

export async function checkForAiracUpdate(
  fetchImplementation: typeof fetch = fetch,
): Promise<AiracUpdateCheck> {
  const discovered = await discoverLatestAvinorEaipEdition(fetchImplementation);
  const comparison = compareAvinorEaipEditions(NORWAY_EAIP_EDITION, discovered);
  return {
    updateAvailable: comparison.status === 'update-available',
    approvedEdition: NORWAY_EAIP_EDITION.editionLabel,
    discovered,
  };
}

export async function prepareAiracUpdate(
  fetchImplementation: typeof fetch = fetch,
  writeCandidate = true,
): Promise<AiracUpdateResult> {
  const check = await checkForAiracUpdate(fetchImplementation);
  if (!check.updateAvailable) return check;

  const approvedDataset = await readJson<NormalizedAeronauticalDataset>(
    approvedDatasetPath(),
  );
  const approvedReport = await readJson<AvinorEaipImportReport>(
    approvedImportReportPath(),
  );
  const artifacts = await runAvinorEaipImportPipeline({
    edition: check.discovered.edition,
    fetchImplementation,
    supplementalData: {
      kind: 'carry-forward-approved',
      approvedDataset,
      priorVacWarnings: approvedReport.vacReportingPointWarnings,
    },
  });
  validateAiracCandidate(check.discovered.edition, artifacts.dataset, artifacts.report);

  const changeReport = compareAeronauticalDatasets(
    approvedDataset,
    artifacts.dataset,
    artifacts.report,
  );
  const datasetPath = `src/aeronautical/data/${check.discovered.edition.datasetId}.json`;
  const importReportPath =
    `data/aeronautical/import-reports/${check.discovered.edition.datasetId}-aerodromes.json`;
  const changeReportPath =
    `data/aeronautical/change-reports/${check.discovered.edition.datasetId}.md`;

  if (!writeCandidate) {
    return { ...check, candidateValidated: true };
  }

  // Versioned candidate artifacts are written first. The two small selector
  // files are written last, after import and validation have fully succeeded.
  await writeJson(resolve(datasetPath), artifacts.dataset);
  await writeJson(resolve(importReportPath), artifacts.report);
  await atomicWrite(resolve(changeReportPath), renderAiracChangeReport(changeReport));
  await atomicWrite(
    resolve('src/aeronautical/avinorRepository.ts'),
    renderApprovedRepositorySource(check.discovered.edition.datasetId),
  );
  await atomicWrite(
    resolve('tools/aeronautical/avinor-eaip/edition.ts'),
    renderApprovedEditionSource(check.discovered.edition),
  );

  return {
    ...check,
    candidateValidated: true,
    datasetPath,
    importReportPath,
    changeReportPath,
  };
}
