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

export class AvinorEaipImportError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly aipSection: string | null,
  ) {
    super(message);
    this.name = 'AvinorEaipImportError';
  }
}
