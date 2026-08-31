import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { NormalizedAeronauticalDataset } from '../../../src/aeronautical/normalizedDataset';
import type { AeronauticalDatasetRef } from '../../../src/domain';
import { importAd2OperationalData, importEnr21Airspace, importVacReportingPoints } from './importOperationalData.ts';

const datasetPath = fileURLToPath(new URL('../../../src/aeronautical/data/avinor-eaip-2026-06-11.json', import.meta.url));
const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8');
const current = JSON.parse(readFileSync(datasetPath, 'utf8')) as NormalizedAeronauticalDataset;
const datasetRef: AeronauticalDatasetRef = {
  datasetId: current.metadata.datasetId, providerId: current.metadata.providerId,
  sourceName: current.metadata.sourceName, airacCycle: current.metadata.airacCycle,
  effectiveFromUtc: current.metadata.effectiveFromUtc, effectiveToUtc: current.metadata.effectiveToUtc,
  ...(current.metadata.revisionId === undefined ? {} : { revisionId: current.metadata.revisionId }),
};
const effectiveDate = current.metadata.effectiveFromUtc.slice(0, 10);
const editionRoot = 'https://aim-prod.avinor.no/no/AIP/View/Index/154/2026-06-11-AIRAC';
const endu = importAd2OperationalData(fixture('endu.html'), {
  dataset: datasetRef, effectiveDate, sourceAerodrome: 'ENDU', aerodromeFeatureId: 'aerodrome:ENDU',
  sourceUrl: `${editionRoot}/html/eAIP/EN-AD-2.ENDU-en-GB.html`,
});
const enhf = importAd2OperationalData(fixture('enhf-operational.html'), {
  dataset: datasetRef, effectiveDate, sourceAerodrome: 'ENHF', aerodromeFeatureId: 'aerodrome:ENHF',
  sourceUrl: `${editionRoot}/html/eAIP/EN-AD-2.ENHF-en-GB.html`,
});
const bardufossTma = importEnr21Airspace(fixture('bardufoss-enr21.html'), {
  dataset: datasetRef, effectiveDate, aerodromeFeatureId: 'aerodrome:ENDU',
  publishedName: 'Bardufoss TMA', associatedAerodromeFeatureIds: ['aerodrome:ENDU'],
  sourceUrl: `${editionRoot}/html/eAIP/EN-ENR-2.1-en-GB.html`,
});
const reportingPoints = importVacReportingPoints(fixture('endu-vac.txt'), {
  dataset: datasetRef, effectiveDate, aerodromeFeatureId: 'aerodrome:ENDU', aerodromeIdentifier: 'ENDU',
  sourceUrl: `${editionRoot}/graphics/623256.pdf`, sourcePage: '1',
});
const enduApproach = endu.communicationServices.find((service) => service.serviceType === 'approach');
const tmaApproach = bardufossTma.communicationServices[0];
if (enduApproach === undefined || tmaApproach === undefined) {
  throw new Error('The reviewed Bardufoss AD/ENR fixtures must contain an approach service');
}
const tmaUnitId = tmaApproach.unitId;
if (tmaUnitId === undefined) {
  throw new Error('The reviewed Bardufoss ENR fixture must identify its ATS unit');
}
const consolidatedBardufossApproach = {
  ...enduApproach,
  unitId: tmaUnitId,
  associations: [...enduApproach.associations, ...tmaApproach.associations.filter(
    (association) => !enduApproach.associations.some(
      (existing) => existing.featureId === association.featureId && existing.featureKind === association.featureKind,
    ),
  )],
  sourceReferences: [...enduApproach.sourceReferences, ...tmaApproach.sourceReferences],
};
const bardufossDetails = bardufossTma.featureDetails.map((details) =>
  details.detailKind === 'airspace'
    ? { ...details, communicationServiceIds: [consolidatedBardufossApproach.id] }
    : details,
);
const generatedPrefixes = ['airspace:ad2:', 'airspace:enr21:', 'reporting-point:endu:'];
const keep = (featureId: string) => !generatedPrefixes.some((prefix) => featureId.startsWith(prefix));
const result: NormalizedAeronauticalDataset = {
  schemaVersion: 2,
  metadata: { ...current.metadata, importer: { name: 'avinor-eaip-normalizer', version: '2' } },
  features: [...current.features.filter((feature) => keep(feature.ref.featureId)), ...endu.features, ...enhf.features, ...bardufossTma.features, ...reportingPoints.features],
  featureDetails: [...current.featureDetails.filter((details) => keep(details.ref.featureId)), ...endu.featureDetails, ...enhf.featureDetails, ...bardufossDetails, ...reportingPoints.details],
  atsUnits: bardufossTma.atsUnits,
  communicationServices: [
    ...endu.communicationServices.filter((service) => service.id !== enduApproach.id),
    consolidatedBardufossApproach,
    ...enhf.communicationServices,
  ],
  vacCharts: [],
};
writeFileSync(datasetPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(`Normalized ${result.features.length} features, ${result.communicationServices.length} communication services, and ${reportingPoints.features.length} published reporting points.`);
