import { validateProductionVacChartManifest } from '../../aeronautical';
import type { VacChartManifest } from '../../domain';

export function resolveVacTileUrlTemplate(template: string, baseUrl: string): string {
  if (/^(?:https?:)?\/\//i.test(template) || template.startsWith('/')) return template;
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}${template.replace(/^\.\//, '')}`;
}

export const resolveVacAssetUrl = resolveVacTileUrlTemplate;

export function filterRenderableVacCharts(
  charts: readonly VacChartManifest[],
  visible: boolean,
  zoom: number,
): readonly VacChartManifest[] {
  if (!visible) return [];
  return charts.filter((chart) =>
    zoom >= chart.minimumZoom && validateProductionVacChartManifest(chart).length === 0,
  );
}
