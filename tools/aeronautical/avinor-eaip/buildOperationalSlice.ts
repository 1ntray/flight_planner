import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { NormalizedAeronauticalDataset } from '../../../src/aeronautical/normalizedDataset';
import type { AeronauticalDatasetRef } from '../../../src/domain';
import { importVacReportingPoints } from './importOperationalData.ts';

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
const reportingPoints = importVacReportingPoints(fixture('endu-vac.txt'), {
  dataset: datasetRef, effectiveDate, aerodromeFeatureId: 'aerodrome:ENDU', aerodromeIdentifier: 'ENDU',
  sourceUrl: `${editionRoot}/graphics/623256.pdf`, sourcePage: '1',
});
const keep = (featureId: string) => !featureId.startsWith('reporting-point:endu:');
const result: NormalizedAeronauticalDataset = {
  ...current,
  features: [...current.features.filter((feature) => keep(feature.ref.featureId)), ...reportingPoints.features],
  featureDetails: [...current.featureDetails.filter((details) => keep(details.ref.featureId)), ...reportingPoints.details],
};
writeFileSync(datasetPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(`Refreshed ${reportingPoints.features.length} reviewed ENDU reporting points without changing nationwide aerodrome, airspace, or communication data.`);
