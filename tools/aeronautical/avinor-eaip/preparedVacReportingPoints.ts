import type {
  AeronauticalDatasetRef,
  AeronauticalPointFeature,
  ReportingPointDetails,
} from '../../../src/domain';
import { importVacReportingPoints } from './importOperationalData';
import { AvinorEaipImportError } from './types';

export interface PreparedVacReportingPoint {
  readonly name: string;
  readonly latitudeDms: string;
  readonly longitudeDms: string;
}

export interface PreparedVacChartReportingPoints {
  readonly aerodromeIdentifier: string;
  readonly sourceUrl: string;
  readonly sourcePage: string;
  readonly points: readonly PreparedVacReportingPoint[];
}

export interface PreparedVacReportingPointDataset {
  readonly schemaVersion: 1;
  readonly provider: 'Avinor';
  readonly sourceType: 'VAC PDF';
  readonly editionLabel: string;
  readonly effectiveDate: string;
  readonly coordinateMethod: 'published-coordinate';
  readonly charts: readonly PreparedVacChartReportingPoints[];
  readonly aerodromesWithoutVac: readonly string[];
}

export interface PreparedVacImportWarning {
  readonly code: 'vac-not-published' | 'vac-has-no-published-coordinate-table';
  readonly aerodromeIdentifier: string;
  readonly sourceUrl?: string;
  readonly message: string;
}

export interface PreparedVacImportResult {
  readonly features: readonly AeronauticalPointFeature[];
  readonly details: readonly ReportingPointDetails[];
  readonly warnings: readonly PreparedVacImportWarning[];
  readonly aerodromesWithPublishedCoordinates: readonly string[];
}

function samePosition(
  left: AeronauticalPointFeature,
  right: AeronauticalPointFeature,
): boolean {
  return left.position.latitude === right.position.latitude &&
    left.position.longitude === right.position.longitude;
}

/**
 * Imports a reviewed, edition-specific VAC extraction. The preparation file
 * contains only coordinates printed as text in the source PDF; graphical-only
 * points are reported as unavailable and are never visually inferred here.
 */
export function importPreparedVacReportingPoints(
  prepared: PreparedVacReportingPointDataset,
  dataset: AeronauticalDatasetRef,
  includedAerodromes?: ReadonlySet<string>,
): PreparedVacImportResult {
  if (prepared.schemaVersion !== 1 || prepared.provider !== 'Avinor') {
    throw new AvinorEaipImportError(
      'unsupported-prepared-vac-dataset',
      'Unsupported prepared VAC reporting-point dataset',
      'AD 2.24 VAC',
    );
  }
  const featureById = new Map<string, AeronauticalPointFeature>();
  const detailsById = new Map<string, ReportingPointDetails>();
  const warnings: PreparedVacImportWarning[] = [];
  const aerodromesWithPublishedCoordinates = new Set<string>();

  for (const chart of prepared.charts) {
    if (includedAerodromes !== undefined && !includedAerodromes.has(chart.aerodromeIdentifier)) {
      continue;
    }
    if (chart.points.length === 0) {
      warnings.push({
        code: 'vac-has-no-published-coordinate-table',
        aerodromeIdentifier: chart.aerodromeIdentifier,
        sourceUrl: chart.sourceUrl,
        message: `${chart.aerodromeIdentifier} VAC has no machine-readable published reporting-point coordinate table`,
      });
      continue;
    }
    aerodromesWithPublishedCoordinates.add(chart.aerodromeIdentifier);
    const imported = importVacReportingPoints(
      chart.points.map((point) =>
        `${point.name} ${point.latitudeDms} ${point.longitudeDms}`,
      ).join('\n'),
      {
        dataset,
        effectiveDate: prepared.effectiveDate,
        aerodromeFeatureId: `aerodrome:${chart.aerodromeIdentifier}`,
        aerodromeIdentifier: chart.aerodromeIdentifier,
        sourceUrl: chart.sourceUrl,
        sourcePage: chart.sourcePage,
      },
    );

    imported.features.forEach((feature, index) => {
      const details = imported.details[index];
      if (details === undefined) {
        throw new AvinorEaipImportError(
          'missing-reporting-point-details',
          `Missing normalized details for ${feature.ref.featureId}`,
          'AD 2.24 VAC',
        );
      }
      const existing = featureById.get(feature.ref.featureId);
      if (existing !== undefined && !samePosition(existing, feature)) {
        throw new AvinorEaipImportError(
          'ambiguous-reporting-point-coordinate',
          `${feature.ref.featureId} has conflicting published VAC coordinates`,
          'AD 2.24 VAC',
        );
      }
      featureById.set(feature.ref.featureId, existing ?? feature);
      const existingDetails = detailsById.get(feature.ref.featureId);
      detailsById.set(feature.ref.featureId, existingDetails === undefined
        ? details
        : {
            ...existingDetails,
            sourceReferences: [
              ...existingDetails.sourceReferences,
              ...details.sourceReferences.filter((reference) =>
                !existingDetails.sourceReferences.some(
                  (existingReference) =>
                    existingReference.sourceReference === reference.sourceReference,
                ),
              ),
            ],
          });
    });
  }

  for (const aerodromeIdentifier of prepared.aerodromesWithoutVac) {
    if (includedAerodromes !== undefined && !includedAerodromes.has(aerodromeIdentifier)) {
      continue;
    }
    warnings.push({
      code: 'vac-not-published',
      aerodromeIdentifier,
      message: `${aerodromeIdentifier} has no VAC published in the selected AD 2 edition`,
    });
  }

  return {
    features: [...featureById.values()],
    details: [...detailsById.values()],
    warnings,
    aerodromesWithPublishedCoordinates: [...aerodromesWithPublishedCoordinates],
  };
}
