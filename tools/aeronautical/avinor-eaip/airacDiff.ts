import { createRequire } from 'node:module';

import type { NormalizedAeronauticalDataset } from '../../../src/aeronautical/normalizedDataset';
import type {
  AerodromeDetails,
  AeronauticalAreaFeature,
  AeronauticalFeature,
  AeronauticalPointFeature,
  AirspaceDetails,
  AtsServiceArea,
  AtsUnit,
  CommunicationService,
  ReportingPointDetails,
} from '../../../src/domain';
import type { AvinorEaipImportReport } from './importPipeline';

// geographiclib-geodesic is CommonJS. Loading it through Node's require keeps
// this Node-only report generator compatible with the tsx ESM runner while
// still using the same GeographicLib WGS84 implementation as route geodesy.
const { Geodesic } = createRequire(import.meta.url)('geographiclib-geodesic') as
  typeof import('geographiclib-geodesic');

export interface AiracCountChange {
  readonly label: string;
  readonly before: number;
  readonly after: number;
}

export interface AiracDatasetChangeReport {
  readonly fromEdition: string;
  readonly toEdition: string;
  readonly counts: readonly AiracCountChange[];
  readonly notableChanges: readonly string[];
  readonly importer: {
    readonly warnings: number;
    readonly vacReportingPointWarnings: number;
    readonly errors: number;
  };
  readonly carriedForwardSupplementalData: boolean;
}

function pointFeatures(
  dataset: NormalizedAeronauticalDataset,
  kind: AeronauticalPointFeature['pointKind'],
): readonly AeronauticalPointFeature[] {
  return dataset.features.filter(
    (feature): feature is AeronauticalPointFeature =>
      feature.geometryType === 'point' && feature.pointKind === kind,
  );
}

function areaFeatures(
  dataset: NormalizedAeronauticalDataset,
): readonly AeronauticalAreaFeature[] {
  return dataset.features.filter(
    (feature): feature is AeronauticalAreaFeature => feature.geometryType === 'area',
  );
}

function count(
  label: string,
  before: number,
  after: number,
): AiracCountChange {
  return { label, before, after };
}

function counts(
  before: NormalizedAeronauticalDataset,
  after: NormalizedAeronauticalDataset,
): readonly AiracCountChange[] {
  const beforeAreas = areaFeatures(before);
  const afterAreas = areaFeatures(after);
  const areaKind = (features: readonly AeronauticalAreaFeature[], kind: string) =>
    features.filter((feature) => feature.areaKind === kind).length;
  return [
    count('Aerodromes', pointFeatures(before, 'aerodrome').length, pointFeatures(after, 'aerodrome').length),
    count('Airspace volumes', beforeAreas.length, afterAreas.length),
    count('CTR / TIZ', areaKind(beforeAreas, 'ctr') + areaKind(beforeAreas, 'tiz'), areaKind(afterAreas, 'ctr') + areaKind(afterAreas, 'tiz')),
    count('TMA', areaKind(beforeAreas, 'tma'), areaKind(afterAreas, 'tma')),
    count('TIA', areaKind(beforeAreas, 'tia'), areaKind(afterAreas, 'tia')),
    count('CTA', areaKind(beforeAreas, 'cta'), areaKind(afterAreas, 'cta')),
    count('ATS service areas', before.atsServiceAreas.length, after.atsServiceAreas.length),
    count('ATS units', before.atsUnits.length, after.atsUnits.length),
    count('Communication services', before.communicationServices.length, after.communicationServices.length),
    count(
      'Frequency assignments',
      before.communicationServices.reduce((sum, service) => sum + service.frequencies.length, 0),
      after.communicationServices.reduce((sum, service) => sum + service.frequencies.length, 0),
    ),
    count('Reporting points', pointFeatures(before, 'reporting-point').length, pointFeatures(after, 'reporting-point').length),
    count('VAC chart manifests', before.vacCharts.length, after.vacCharts.length),
  ];
}

function mapById<T>(
  values: readonly T[],
  id: (value: T) => string,
): ReadonlyMap<string, T> {
  return new Map(values.map((value) => [id(value), value]));
}

function semanticFeature(feature: AeronauticalFeature): unknown {
  const { ref: _ref, ...semantic } = feature;
  return semantic;
}

function semanticDetails(
  details: AerodromeDetails | AirspaceDetails | ReportingPointDetails,
): unknown {
  const { ref: _ref, sourceReferences: _sourceReferences, ...semantic } = details;
  return semantic;
}

function semanticService(service: CommunicationService): unknown {
  const { sourceReferences: _sourceReferences, ...semantic } = service;
  return semantic;
}

function semanticServiceArea(serviceArea: AtsServiceArea): unknown {
  const { ref: _ref, sourceReferences: _sourceReferences, ...semantic } = serviceArea;
  return semantic;
}

function semanticAtsUnit(unit: AtsUnit): unknown {
  const { sourceReferences: _sourceReferences, ...semantic } = unit;
  return semantic;
}

function changed(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) !== JSON.stringify(right);
}

function formatMovementMeters(
  from: AeronauticalPointFeature,
  to: AeronauticalPointFeature,
): string {
  const distanceMeters = Geodesic.WGS84.Inverse(
    from.position.latitude,
    from.position.longitude,
    to.position.latitude,
    to.position.longitude,
  ).s12;
  if (distanceMeters === undefined || !Number.isFinite(distanceMeters)) {
    throw new Error('WGS84 coordinate comparison did not return a finite distance');
  }
  return `${distanceMeters.toFixed(1)} m`;
}

function pointChanges(
  before: NormalizedAeronauticalDataset,
  after: NormalizedAeronauticalDataset,
  kind: 'aerodrome' | 'reporting-point',
): readonly string[] {
  const oldPoints = mapById(pointFeatures(before, kind), ({ ref }) => ref.featureId);
  const newPoints = mapById(pointFeatures(after, kind), ({ ref }) => ref.featureId);
  const label = kind === 'aerodrome' ? 'Aerodrome' : 'Reporting point';
  const result: string[] = [];
  for (const id of [...oldPoints.keys()].filter((id) => !newPoints.has(id)).sort()) {
    result.push(`${label} removed: ${id}`);
  }
  for (const id of [...newPoints.keys()].filter((id) => !oldPoints.has(id)).sort()) {
    result.push(`${label} added: ${id}`);
  }
  for (const id of [...oldPoints.keys()].filter((id) => newPoints.has(id)).sort()) {
    const oldPoint = oldPoints.get(id)!;
    const newPoint = newPoints.get(id)!;
    if (changed(oldPoint.position, newPoint.position)) {
      result.push(`${label} coordinate changed: ${id} moved ${formatMovementMeters(oldPoint, newPoint)}`);
    }
    const oldWithoutPosition = { ...semanticFeature(oldPoint) as object, position: undefined };
    const newWithoutPosition = { ...semanticFeature(newPoint) as object, position: undefined };
    if (changed(oldWithoutPosition, newWithoutPosition)) {
      result.push(`${label} attributes changed: ${id}`);
    }
  }
  return result;
}

function detailsChanges(
  before: NormalizedAeronauticalDataset,
  after: NormalizedAeronauticalDataset,
): readonly string[] {
  const oldDetails = mapById(before.featureDetails, ({ ref }) => ref.featureId);
  const newDetails = mapById(after.featureDetails, ({ ref }) => ref.featureId);
  const result: string[] = [];
  for (const id of [...oldDetails.keys()].filter((id) => newDetails.has(id)).sort()) {
    const oldValue = oldDetails.get(id)!;
    const newValue = newDetails.get(id)!;
    if (oldValue.detailKind !== newValue.detailKind) {
      result.push(`Feature detail type changed: ${id}`);
      continue;
    }
    if (oldValue.detailKind === 'aerodrome' && newValue.detailKind === 'aerodrome') {
      if (oldValue.elevationFt !== newValue.elevationFt) {
        result.push(`Aerodrome elevation changed: ${id} ${String(oldValue.elevationFt)} → ${String(newValue.elevationFt)} ft`);
      }
      if (changed(oldValue.runways, newValue.runways)) {
        result.push(`Aerodrome runway/declared distances changed: ${id}`);
      }
    } else if (oldValue.detailKind === 'airspace' && newValue.detailKind === 'airspace') {
      if (changed(oldValue.lowerLimit, newValue.lowerLimit) || changed(oldValue.upperLimit, newValue.upperLimit)) {
        result.push(`Airspace vertical limits changed: ${id}`);
      }
      if (changed(oldValue.sourceGeometry, newValue.sourceGeometry)) {
        result.push(`Airspace source geometry changed: ${id}`);
      }
    }
    if (changed(semanticDetails(oldValue), semanticDetails(newValue)) &&
        !result.some((item) => item.endsWith(id))) {
      result.push(`Feature details changed: ${id}`);
    }
  }
  return result;
}

function airspaceChanges(
  before: NormalizedAeronauticalDataset,
  after: NormalizedAeronauticalDataset,
): readonly string[] {
  const oldAreas = mapById(areaFeatures(before), ({ ref }) => ref.featureId);
  const newAreas = mapById(areaFeatures(after), ({ ref }) => ref.featureId);
  const result: string[] = [];
  for (const id of [...oldAreas.keys()].filter((id) => !newAreas.has(id)).sort()) {
    result.push(`Airspace removed: ${id}`);
  }
  for (const id of [...newAreas.keys()].filter((id) => !oldAreas.has(id)).sort()) {
    result.push(`Airspace added: ${id}`);
  }
  for (const id of [...oldAreas.keys()].filter((id) => newAreas.has(id)).sort()) {
    if (changed(semanticFeature(oldAreas.get(id)!), semanticFeature(newAreas.get(id)!))) {
      result.push(`Airspace render geometry/attributes changed: ${id}`);
    }
  }
  return result;
}

function communicationChanges(
  before: NormalizedAeronauticalDataset,
  after: NormalizedAeronauticalDataset,
): readonly string[] {
  const grouped = (services: readonly CommunicationService[]) => {
    const result = new Map<string, CommunicationService[]>();
    for (const service of services) {
      result.set(service.id, [...(result.get(service.id) ?? []), service]);
    }
    return result;
  };
  const oldServices = grouped(before.communicationServices);
  const newServices = grouped(after.communicationServices);
  const result: string[] = [];
  for (const id of [...oldServices.keys()].filter((id) => !newServices.has(id)).sort()) {
    result.push(`Communication service removed: ${id}`);
  }
  for (const id of [...newServices.keys()].filter((id) => !oldServices.has(id)).sort()) {
    result.push(`Communication service added: ${id}`);
  }
  for (const id of [...oldServices.keys()].filter((id) => newServices.has(id)).sort()) {
    const oldService = oldServices.get(id)!;
    const newService = newServices.get(id)!;
    const frequencies = (services: readonly CommunicationService[]) =>
      services.flatMap((service) => service.frequencies)
        .map((frequency) => JSON.stringify(frequency))
        .sort();
    if (changed(frequencies(oldService), frequencies(newService))) {
      result.push(`Frequency assignments changed: ${id}`);
    } else if (changed(
      oldService.map(semanticService).map((value) => JSON.stringify(value)).sort(),
      newService.map(semanticService).map((value) => JSON.stringify(value)).sort(),
    )) {
      result.push(`Communication service changed: ${id}`);
    }
  }
  return result;
}

function atsStructureChanges(
  before: NormalizedAeronauticalDataset,
  after: NormalizedAeronauticalDataset,
): readonly string[] {
  const result: string[] = [];
  const oldAreas = mapById(before.atsServiceAreas, ({ ref }) => ref.serviceAreaId);
  const newAreas = mapById(after.atsServiceAreas, ({ ref }) => ref.serviceAreaId);
  for (const id of [...oldAreas.keys()].filter((id) => !newAreas.has(id)).sort()) {
    result.push(`ATS service area removed: ${id}`);
  }
  for (const id of [...newAreas.keys()].filter((id) => !oldAreas.has(id)).sort()) {
    result.push(`ATS service area added: ${id}`);
  }
  for (const id of [...oldAreas.keys()].filter((id) => newAreas.has(id)).sort()) {
    if (changed(semanticServiceArea(oldAreas.get(id)!), semanticServiceArea(newAreas.get(id)!))) {
      result.push(`ATS service area changed: ${id}`);
    }
  }

  const oldUnits = mapById(before.atsUnits, ({ id }) => id);
  const newUnits = mapById(after.atsUnits, ({ id }) => id);
  for (const id of [...oldUnits.keys()].filter((id) => !newUnits.has(id)).sort()) {
    result.push(`ATS unit removed: ${id}`);
  }
  for (const id of [...newUnits.keys()].filter((id) => !oldUnits.has(id)).sort()) {
    result.push(`ATS unit added: ${id}`);
  }
  for (const id of [...oldUnits.keys()].filter((id) => newUnits.has(id)).sort()) {
    if (changed(semanticAtsUnit(oldUnits.get(id)!), semanticAtsUnit(newUnits.get(id)!))) {
      result.push(`ATS unit changed: ${id}`);
    }
  }
  return result;
}

export function compareAeronauticalDatasets(
  before: NormalizedAeronauticalDataset,
  after: NormalizedAeronauticalDataset,
  candidateImportReport: Pick<
    AvinorEaipImportReport,
    'warnings' | 'vacReportingPointWarnings' | 'failures' | 'supplementalData'
  >,
): AiracDatasetChangeReport {
  return {
    fromEdition: before.metadata.editionLabel,
    toEdition: after.metadata.editionLabel,
    counts: counts(before, after),
    notableChanges: [
      ...pointChanges(before, after, 'aerodrome'),
      ...airspaceChanges(before, after),
      ...detailsChanges(before, after),
      ...atsStructureChanges(before, after),
      ...communicationChanges(before, after),
      ...pointChanges(before, after, 'reporting-point'),
    ].sort(),
    importer: {
      warnings: candidateImportReport.warnings.length,
      vacReportingPointWarnings:
        candidateImportReport.vacReportingPointWarnings.length,
      errors: candidateImportReport.failures.length,
    },
    carriedForwardSupplementalData:
      candidateImportReport.supplementalData?.status === 'carried-forward',
  };
}

const MAX_RENDERED_NOTABLE_CHANGES = 200;

export function renderAiracChangeReport(report: AiracDatasetChangeReport): string {
  const notable = report.notableChanges.slice(0, MAX_RENDERED_NOTABLE_CHANGES);
  const omitted = report.notableChanges.length - notable.length;
  const lines = [
    `# AIRAC update: ${report.fromEdition} → ${report.toEdition}`,
    '',
    '| Dataset concept | Before | Candidate |',
    '| --- | ---: | ---: |',
    ...report.counts.map(({ label, before, after }) =>
      `| ${label} | ${before} | ${after} |`,
    ),
    '',
    '## Notable semantic changes',
    '',
    ...(notable.length === 0 ? ['- No semantic changes detected.'] : notable.map((item) => `- ${item}`)),
    ...(omitted > 0 ? [`- …and ${omitted} additional changes omitted from this concise report.`] : []),
    '',
    '## Importer',
    '',
    `- Errors: ${report.importer.errors}`,
    `- eAIP warnings: ${report.importer.warnings}`,
    `- Carried/prepared VAC reporting-point warnings: ${report.importer.vacReportingPointWarnings}`,
    ...(report.carriedForwardSupplementalData
      ? ['- Reviewed VAC-derived reporting points and VAC manifests were carried forward unchanged with their original provenance; this workflow did not update VAC assets.']
      : []),
    '',
    '## Verification',
    '',
    '- [ ] `pnpm typecheck`',
    '- [ ] `pnpm test`',
    '- [ ] `pnpm build`',
    '',
    '> Merging this pull request is the human approval boundary. Discovery alone never activates the candidate dataset.',
    '',
  ];
  return lines.join('\n');
}
