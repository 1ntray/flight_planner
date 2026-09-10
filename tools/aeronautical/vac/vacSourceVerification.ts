import type { VacChartManifest } from '../../../src/domain';
import type { PublishedVacChartSource } from './vacSourceDiscovery';

export interface VacSourceVerificationResult {
  readonly publishedCount: number;
  readonly activeCount: number;
  readonly matchedCount: number;
  readonly missingPublished: readonly PublishedVacChartSource[];
  readonly staleActive: readonly {
    readonly id: string;
    readonly icao: string;
    readonly sourceUrl: string;
  }[];
}

function vacPdfUrl(chart: VacChartManifest): string {
  const references = chart.sourceReferences.filter(({ sourceType }) => sourceType === 'vac-pdf');
  if (references.length !== 1) {
    throw new Error(`${chart.id} must have exactly one VAC PDF source reference`);
  }
  return references[0]!.sourceReference;
}

export function verifyVacChartSources(
  published: readonly PublishedVacChartSource[],
  active: readonly VacChartManifest[],
): VacSourceVerificationResult {
  const publishedUrls = new Set(published.map(({ sourceUrl }) => sourceUrl));
  const activeUrls = new Set(active.map(vacPdfUrl));
  return {
    publishedCount: published.length,
    activeCount: active.length,
    matchedCount: published.filter(({ sourceUrl }) => activeUrls.has(sourceUrl)).length,
    missingPublished: published.filter(({ sourceUrl }) => !activeUrls.has(sourceUrl)),
    staleActive: active.filter((chart) => !publishedUrls.has(vacPdfUrl(chart))).map((chart) => ({
      id: chart.id,
      icao: chart.aerodromeFeatureId.replace(/^aerodrome:/, ''),
      sourceUrl: vacPdfUrl(chart),
    })),
  };
}

