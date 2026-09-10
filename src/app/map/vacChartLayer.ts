import { validateProductionVacChartManifest } from '../../aeronautical';
import type { VacChartManifest } from '../../domain';

/** Show an approved chart one map zoom below its prepared native detail. */
export const VAC_DISPLAY_ZOOM_OFFSET = 1;

export function vacDisplayMinimumZoom(chart: VacChartManifest): number {
  return Math.max(0, chart.minimumZoom - VAC_DISPLAY_ZOOM_OFFSET);
}

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
    zoom >= vacDisplayMinimumZoom(chart) &&
    validateProductionVacChartManifest(chart).length === 0,
  );
}
