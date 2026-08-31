import type { NormalizedAeronauticalDataset } from '../../../src/aeronautical/normalizedDataset';

export interface AvinorEaipImportConfig {
  readonly sourceAerodrome: string;
  readonly datasetId: string;
  readonly editionLabel: string;
  readonly airacCycle: string | null;
  readonly effectiveFromUtc: string;
  readonly revisionId?: string;
  readonly sourceUrl: string;
  readonly retrievedAtUtc: string;
  readonly importedAtUtc: string;
}

export interface AvinorEaipImportWarning {
  readonly code: string;
  readonly message: string;
  readonly aipSection: string | null;
}

export interface AvinorEaipImportResult {
  readonly dataset: NormalizedAeronauticalDataset;
  readonly warnings: readonly AvinorEaipImportWarning[];
}

export interface AvinorEaipBatchEditionConfig {
  readonly datasetId: string;
  readonly editionLabel: string;
  readonly airacCycle: string | null;
  readonly effectiveFromUtc: string;
  readonly revisionId?: string;
  /** AD 1.3 for the configured eAIP edition. */
  readonly indexUrl: string;
  /** ENR 2.1 for the same configured eAIP edition. */
  readonly enr21Url: string;
}

export interface AvinorEaipAerodromeSource {
  readonly sourceAerodrome: string;
  readonly sourceUrl: string;
  readonly html: string | Buffer;
}

export interface AvinorEaipEnrSource {
  readonly sourceUrl: string;
  readonly html: string | Buffer;
}

export interface AvinorEaipBatchWarning extends AvinorEaipImportWarning {
  readonly sourceAerodrome: string;
  readonly sourceUrl: string;
}

export interface AvinorEaipBatchFailure {
  readonly sourceAerodrome: string;
  readonly sourceUrl: string;
  readonly code: string;
  readonly message: string;
  readonly aipSection: string | null;
}

export interface AvinorEaipBatchImportResult {
  readonly dataset: NormalizedAeronauticalDataset;
  readonly importedAerodromes: readonly string[];
  readonly warnings: readonly AvinorEaipBatchWarning[];
  readonly failures: readonly AvinorEaipBatchFailure[];
}

export class AvinorEaipImportError extends Error {
  readonly code: string;
  readonly aipSection: string | null;

  constructor(
    code: string,
    message: string,
    aipSection: string | null,
  ) {
    super(message);
    this.name = 'AvinorEaipImportError';
    this.code = code;
    this.aipSection = aipSection;
  }
}
