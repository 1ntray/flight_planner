import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { NormalizedAeronauticalDataset } from '../../../src/aeronautical/normalizedDataset';
import type {
  AeronauticalFeature,
  AeronauticalFeatureDetails,
  VacChartManifest,
} from '../../../src/domain';
import {
  discoverAd2Aerodromes,
  importAvinorEaipAerodromes,
} from './batchImport';
import {
  importPreparedVacReportingPoints,
  type PreparedVacImportWarning,
  type PreparedVacReportingPointDataset,
} from './preparedVacReportingPoints';
import {
  validatePreparedNationalBoundaryDataset,
  type PreparedNationalBoundaryDataset,
} from './nationalBoundary';
import type {
  AvinorEaipAerodromeSource,
  AvinorEaipBatchEditionConfig,
  AvinorEaipBatchFailure,
  AvinorEaipBatchWarning,
  AvinorEaipEnrSource,
} from './types';

export interface AeronauticalImportFeatureCounts {
  readonly aerodromes: number;
  readonly airspaces: number;
  readonly tmas: number;
  readonly tias: number;
  readonly ctas: number;
  readonly atsServiceAreas: number;
  readonly resolvedAtsServiceAreas: number;
  readonly unresolvedAtsServiceAreas: number;
  readonly atsUnits: number;
  readonly communicationServices: number;
  readonly frequencies: number;
  readonly reportingPoints: number;
  readonly aerodromesWithPublishedReportingPointCoordinates: number;
  readonly vacCharts: number;
}

export interface CarriedForwardSupplementalData {
  readonly status: 'carried-forward';
  readonly sourceDatasetId: string;
  readonly reportingPoints: number;
  readonly vacCharts: number;
  readonly reason: string;
}

export interface AvinorEaipImportReport {
  readonly provider: 'Avinor';
  readonly source: 'eAIP';
  readonly editionLabel: string;
  readonly effectiveFromUtc: string;
  readonly sourceIndexUrl: string;
  readonly sourceEnr21Url: string;
  readonly sourceEnr22Url: string;
  readonly retrievedAtUtc: string;
  readonly importedAtUtc: string;
  readonly discoveredAerodromeCount: number;
  readonly importedAerodromes: readonly string[];
  readonly featureCounts: AeronauticalImportFeatureCounts;
  readonly warnings: readonly AvinorEaipBatchWarning[];
  readonly vacReportingPointWarnings: readonly PreparedVacImportWarning[];
  readonly failures: readonly AvinorEaipBatchFailure[];
  readonly supplementalData?: CarriedForwardSupplementalData;
}

export type SupplementalAeronauticalData =
  | {
      readonly kind: 'prepared-vac-reporting-points';
      readonly prepared: PreparedVacReportingPointDataset;
    }
  | {
      readonly kind: 'carry-forward-approved';
      readonly approvedDataset: NormalizedAeronauticalDataset;
      readonly priorVacWarnings: readonly PreparedVacImportWarning[];
    }
  | { readonly kind: 'none' };

export interface AvinorEaipImportPipelineOptions {
  readonly edition: AvinorEaipBatchEditionConfig;
  readonly inputIndexPath?: string;
  readonly inputDirectory?: string;
  readonly retrievedAtUtc?: string;
  readonly aerodromes?: readonly string[];
  readonly fetchImplementation?: typeof fetch;
  readonly nationalBoundary?: PreparedNationalBoundaryDataset;
  readonly supplementalData: SupplementalAeronauticalData;
}

export interface AvinorEaipImportArtifacts {
  readonly dataset: NormalizedAeronauticalDataset;
  readonly report: AvinorEaipImportReport;
}

interface AcquiredSources {
  readonly sources: readonly AvinorEaipAerodromeSource[];
  readonly enr21Source: AvinorEaipEnrSource | null;
  readonly enr22Source: AvinorEaipEnrSource | null;
  readonly retrievalFailures: readonly AvinorEaipBatchFailure[];
  readonly discoveredAerodromeCount: number;
  readonly retrievedAtUtc: string;
}

function validTimestamp(value: string, optionName: string): string {
  if (Number.isNaN(Date.parse(value))) {
    throw new Error(`${optionName} must be an ISO timestamp`);
  }
  return new Date(value).toISOString();
}

function filterDiscoveredAerodromes<T extends { readonly sourceAerodrome: string }>(
  aerodromes: readonly T[],
  requestedAerodromes: readonly string[] | undefined,
): readonly T[] {
  if (requestedAerodromes === undefined) return aerodromes;
  const requested = new Set(requestedAerodromes);
  const selected = aerodromes.filter(({ sourceAerodrome }) =>
    requested.has(sourceAerodrome),
  );
  const missing = requestedAerodromes.filter((icao) =>
    !selected.some(({ sourceAerodrome }) => sourceAerodrome === icao),
  );
  if (missing.length > 0) {
    throw new Error(`AD 1.3 does not list requested aerodrome(s): ${missing.join(', ')}`);
  }
  return selected;
}

async function fetchPage(url: string, fetchImplementation: typeof fetch): Promise<Buffer> {
  const response = await fetchImplementation(url, {
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'user-agent': 'FlightPlanner-eAIP-Importer/1.0',
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return Buffer.from(await response.arrayBuffer());
}

function retrievalFailure(
  sourceAerodrome: string,
  sourceUrl: string,
  error: unknown,
  aipSection: string | null,
): AvinorEaipBatchFailure {
  return {
    sourceAerodrome,
    sourceUrl,
    code: 'source-retrieval-failed',
    message: error instanceof Error ? error.message : String(error),
    aipSection,
  };
}

async function acquireOnlineSources(
  options: AvinorEaipImportPipelineOptions,
): Promise<AcquiredSources> {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const indexHtml = await fetchPage(options.edition.indexUrl, fetchImplementation);
  const discovered = filterDiscoveredAerodromes(
    discoverAd2Aerodromes(indexHtml, options.edition.indexUrl),
    options.aerodromes,
  );
  const retrievedAtUtc = new Date().toISOString();
  const results = await Promise.all(discovered.map(async (aerodrome) => {
    try {
      return {
        source: {
          ...aerodrome,
          html: await fetchPage(aerodrome.sourceUrl, fetchImplementation),
        },
        failure: null,
      };
    } catch (error: unknown) {
      return {
        source: null,
        failure: retrievalFailure(
          aerodrome.sourceAerodrome,
          aerodrome.sourceUrl,
          error,
          null,
        ),
      };
    }
  }));
  let enr21Source: AvinorEaipEnrSource | null = null;
  let enr21Failure: AvinorEaipBatchFailure | null = null;
  let enr22Source: AvinorEaipEnrSource | null = null;
  let enr22Failure: AvinorEaipBatchFailure | null = null;
  if (options.aerodromes === undefined) {
    try {
      enr21Source = {
        sourceUrl: options.edition.enr21Url,
        html: await fetchPage(options.edition.enr21Url, fetchImplementation),
      };
    } catch (error: unknown) {
      enr21Failure = retrievalFailure(
        'ENR 2.1', options.edition.enr21Url, error, 'ENR 2.1',
      );
    }
    try {
      enr22Source = {
        sourceUrl: options.edition.enr22Url,
        html: await fetchPage(options.edition.enr22Url, fetchImplementation),
      };
    } catch (error: unknown) {
      enr22Failure = retrievalFailure(
        'ENR 2.2', options.edition.enr22Url, error, 'ENR 2.2',
      );
    }
  }
  return {
    sources: results.flatMap(({ source }) => source === null ? [] : [source]),
    enr21Source,
    enr22Source,
    retrievalFailures: [
      ...results.flatMap(({ failure }) => failure === null ? [] : [failure]),
      ...(enr21Failure === null ? [] : [enr21Failure]),
      ...(enr22Failure === null ? [] : [enr22Failure]),
    ],
    discoveredAerodromeCount: discovered.length,
    retrievedAtUtc,
  };
}

async function acquireOfflineSources(
  options: AvinorEaipImportPipelineOptions,
): Promise<AcquiredSources> {
  if (
    options.inputIndexPath === undefined ||
    options.inputDirectory === undefined ||
    options.retrievedAtUtc === undefined
  ) {
    throw new Error(
      'Offline import requires inputIndexPath, inputDirectory, and retrievedAtUtc',
    );
  }
  const inputDirectory = options.inputDirectory;
  const retrievedAtUtc = validTimestamp(options.retrievedAtUtc, 'retrievedAtUtc');
  const indexHtml = await readFile(resolve(options.inputIndexPath));
  const discovered = filterDiscoveredAerodromes(
    discoverAd2Aerodromes(indexHtml, options.edition.indexUrl),
    options.aerodromes,
  );
  const results = await Promise.all(discovered.map(async (aerodrome) => {
    try {
      return {
        source: {
          ...aerodrome,
          html: await readFile(resolve(inputDirectory, `${aerodrome.sourceAerodrome}.html`)),
        },
        failure: null,
      };
    } catch (error: unknown) {
      return {
        source: null,
        failure: {
          ...retrievalFailure(
            aerodrome.sourceAerodrome, aerodrome.sourceUrl, error, null,
          ),
          code: 'source-read-failed',
        },
      };
    }
  }));
  const readEnr = async (
    name: 'ENR 2.1' | 'ENR 2.2',
    filename: 'ENR-2.1.html' | 'ENR-2.2.html',
    sourceUrl: string,
  ): Promise<{ source: AvinorEaipEnrSource | null; failure: AvinorEaipBatchFailure | null }> => {
    try {
      return {
        source: { sourceUrl, html: await readFile(resolve(inputDirectory, filename)) },
        failure: null,
      };
    } catch (error: unknown) {
      return {
        source: null,
        failure: {
          ...retrievalFailure(name, sourceUrl, error, name),
          code: 'source-read-failed',
        },
      };
    }
  };
  const enr21 = options.aerodromes === undefined
    ? await readEnr('ENR 2.1', 'ENR-2.1.html', options.edition.enr21Url)
    : { source: null, failure: null };
  const enr22 = options.aerodromes === undefined
    ? await readEnr('ENR 2.2', 'ENR-2.2.html', options.edition.enr22Url)
    : { source: null, failure: null };
  return {
    sources: results.flatMap(({ source }) => source === null ? [] : [source]),
    enr21Source: enr21.source,
    enr22Source: enr22.source,
    retrievalFailures: [
      ...results.flatMap(({ failure }) => failure === null ? [] : [failure]),
      ...(enr21.failure === null ? [] : [enr21.failure]),
      ...(enr22.failure === null ? [] : [enr22.failure]),
    ],
    discoveredAerodromeCount: discovered.length,
    retrievedAtUtc,
  };
}

function countFeatures(
  dataset: NormalizedAeronauticalDataset,
  aerodromesWithPublishedCoordinates: number,
): AeronauticalImportFeatureCounts {
  return {
    aerodromes: dataset.features.filter((feature) =>
      feature.geometryType === 'point' && feature.pointKind === 'aerodrome',
    ).length,
    airspaces: dataset.features.filter((feature) => feature.geometryType === 'area').length,
    tmas: dataset.features.filter((feature) =>
      feature.geometryType === 'area' && feature.areaKind === 'tma',
    ).length,
    tias: dataset.features.filter((feature) =>
      feature.geometryType === 'area' && feature.areaKind === 'tia',
    ).length,
    ctas: dataset.features.filter((feature) =>
      feature.geometryType === 'area' && feature.areaKind === 'cta',
    ).length,
    atsServiceAreas: dataset.atsServiceAreas.length,
    resolvedAtsServiceAreas: dataset.atsServiceAreas.filter(
      ({ geometryStatus }) => geometryStatus === 'resolved',
    ).length,
    unresolvedAtsServiceAreas: dataset.atsServiceAreas.filter(
      ({ geometryStatus }) => geometryStatus === 'unresolved',
    ).length,
    atsUnits: dataset.atsUnits.length,
    communicationServices: dataset.communicationServices.length,
    frequencies: dataset.communicationServices.reduce(
      (sum, service) => sum + service.frequencies.length, 0,
    ),
    reportingPoints: dataset.features.filter((feature) =>
      feature.geometryType === 'point' && feature.pointKind === 'reporting-point',
    ).length,
    aerodromesWithPublishedReportingPointCoordinates:
      aerodromesWithPublishedCoordinates,
    vacCharts: dataset.vacCharts.length,
  };
}

export function approvedSupplementalFeatures(
  approved: NormalizedAeronauticalDataset,
): {
  features: readonly AeronauticalFeature[];
  details: readonly AeronauticalFeatureDetails[];
  vacCharts: readonly VacChartManifest[];
} {
  const features = approved.features.filter((feature) =>
    feature.geometryType === 'point' && feature.pointKind === 'reporting-point',
  );
  const ids = new Set(features.map(({ ref }) => ref.featureId));
  return {
    features,
    details: approved.featureDetails.filter(({ ref }) => ids.has(ref.featureId)),
    vacCharts: approved.vacCharts,
  };
}

export async function loadPreparedNationalBoundary(): Promise<PreparedNationalBoundaryDataset> {
  return validatePreparedNationalBoundaryDataset(JSON.parse(await readFile(
    new URL('./prepared/norway-national-boundary-2026.json', import.meta.url),
    'utf8',
  )));
}

export async function runAvinorEaipImportPipeline(
  options: AvinorEaipImportPipelineOptions,
): Promise<AvinorEaipImportArtifacts> {
  const offline = options.inputIndexPath !== undefined || options.inputDirectory !== undefined;
  if (offline && (options.inputIndexPath === undefined || options.inputDirectory === undefined)) {
    throw new Error('inputIndexPath and inputDirectory must be provided together');
  }
  const acquired = offline
    ? await acquireOfflineSources(options)
    : await acquireOnlineSources(options);
  const importedAtUtc = new Date().toISOString();
  const nationalBoundary = options.nationalBoundary ?? await loadPreparedNationalBoundary();
  const result = importAvinorEaipAerodromes(
    acquired.sources,
    options.edition,
    { retrievedAtUtc: acquired.retrievedAtUtc, importedAtUtc },
    acquired.enr21Source ?? undefined,
    acquired.enr22Source ?? undefined,
    nationalBoundary,
  );
  const failures = [...acquired.retrievalFailures, ...result.failures];
  if (result.importedAerodromes.length === 0) {
    throw new Error('No aerodromes were successfully imported');
  }

  let supplementalFeatures: readonly AeronauticalFeature[] = [];
  let supplementalDetails: readonly AeronauticalFeatureDetails[] = [];
  let vacCharts: readonly VacChartManifest[] = [];
  let vacWarnings: readonly PreparedVacImportWarning[] = [];
  let aerodromesWithCoordinates = 0;
  let supplementalReport: CarriedForwardSupplementalData | undefined;
  if (options.supplementalData.kind === 'prepared-vac-reporting-points') {
    const imported = importPreparedVacReportingPoints(
      options.supplementalData.prepared,
      {
        datasetId: result.dataset.metadata.datasetId,
        providerId: result.dataset.metadata.providerId,
        sourceName: result.dataset.metadata.sourceName,
        airacCycle: result.dataset.metadata.airacCycle,
        effectiveFromUtc: result.dataset.metadata.effectiveFromUtc,
        effectiveToUtc: result.dataset.metadata.effectiveToUtc,
        ...(result.dataset.metadata.revisionId === undefined
          ? {}
          : { revisionId: result.dataset.metadata.revisionId }),
      },
      new Set(result.importedAerodromes),
    );
    supplementalFeatures = imported.features;
    supplementalDetails = imported.details;
    vacWarnings = imported.warnings;
    aerodromesWithCoordinates = imported.aerodromesWithPublishedCoordinates.length;
  } else if (options.supplementalData.kind === 'carry-forward-approved') {
    const carried = approvedSupplementalFeatures(
      options.supplementalData.approvedDataset,
    );
    supplementalFeatures = carried.features;
    supplementalDetails = carried.details;
    vacCharts = carried.vacCharts;
    vacWarnings = options.supplementalData.priorVacWarnings;
    aerodromesWithCoordinates = new Set(supplementalFeatures.flatMap((feature) =>
      feature.geometryType === 'point' && feature.pointKind === 'reporting-point'
        ? [feature.ref.featureId.split(':')[1] ?? '']
        : [],
    )).size;
    supplementalReport = {
      status: 'carried-forward',
      sourceDatasetId: options.supplementalData.approvedDataset.metadata.datasetId,
      reportingPoints: supplementalFeatures.length,
      vacCharts: vacCharts.length,
      reason: 'VAC-derived structured data and chart assets require separate review and are not silently updated with eAIP discovery.',
    };
  }

  const dataset: NormalizedAeronauticalDataset = {
    ...result.dataset,
    features: [...result.dataset.features, ...supplementalFeatures],
    featureDetails: [...result.dataset.featureDetails, ...supplementalDetails],
    vacCharts,
  };
  const report: AvinorEaipImportReport = {
    provider: 'Avinor',
    source: 'eAIP',
    editionLabel: options.edition.editionLabel,
    effectiveFromUtc: options.edition.effectiveFromUtc,
    sourceIndexUrl: options.edition.indexUrl,
    sourceEnr21Url: options.edition.enr21Url,
    sourceEnr22Url: options.edition.enr22Url,
    retrievedAtUtc: acquired.retrievedAtUtc,
    importedAtUtc,
    discoveredAerodromeCount: acquired.discoveredAerodromeCount,
    importedAerodromes: result.importedAerodromes,
    featureCounts: countFeatures(dataset, aerodromesWithCoordinates),
    warnings: result.warnings,
    vacReportingPointWarnings: vacWarnings,
    failures,
    ...(supplementalReport === undefined ? {} : { supplementalData: supplementalReport }),
  };
  return { dataset, report };
}
