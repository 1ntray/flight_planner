import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { NormalizedAeronauticalDataset } from '../../../src/aeronautical/normalizedDataset';
import { discoverAd2Aerodromes } from '../avinor-eaip/batchImport';
import { NORWAY_EAIP_EDITION } from '../avinor-eaip/edition';
import { discoverVacChartSources } from './vacSourceDiscovery';
import { verifyVacChartSources } from './vacSourceVerification';

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  return response.text();
}

const writeReport = process.argv.slice(2).filter((arg) => arg !== '--').includes('--write-report');
const root = resolve(import.meta.dirname, '../../..');
const indexHtml = await fetchText(NORWAY_EAIP_EDITION.indexUrl);
const aerodromes = discoverAd2Aerodromes(indexHtml, NORWAY_EAIP_EDITION.indexUrl);
const published = (await Promise.all(aerodromes.map(async ({ sourceAerodrome, sourceUrl }) =>
  discoverVacChartSources(await fetchText(sourceUrl), sourceUrl, sourceAerodrome),
))).flat().sort((left, right) => left.icao.localeCompare(right.icao) || left.aipPage.localeCompare(right.aipPage));
const datasetPath = resolve(root, `src/aeronautical/data/${NORWAY_EAIP_EDITION.datasetId}.json`);
const dataset = JSON.parse(await readFile(datasetPath, 'utf8')) as NormalizedAeronauticalDataset;
const result = verifyVacChartSources(published, dataset.vacCharts);
const report = {
  provider: 'Avinor', source: 'eAIP', datasetId: NORWAY_EAIP_EDITION.datasetId,
  editionLabel: NORWAY_EAIP_EDITION.editionLabel,
  effectiveFromUtc: NORWAY_EAIP_EDITION.effectiveFromUtc,
  verifiedAtUtc: new Date().toISOString(),
  ...result,
  published,
};

console.log(`Edition: ${report.editionLabel}`);
console.log(`Published VACs: ${result.publishedCount}`);
console.log(`Active VACs: ${result.activeCount}`);
console.log(`Exact source matches: ${result.matchedCount}`);
for (const chart of result.missingPublished) console.log(`MISSING ${chart.icao} ${chart.aipPage}: ${chart.sourceUrl}`);
for (const chart of result.staleActive) console.log(`STALE ${chart.icao} ${chart.id}: ${chart.sourceUrl}`);
if (writeReport) {
  const output = resolve(root, `data/aeronautical/vac-source-verification-${NORWAY_EAIP_EDITION.effectiveFromUtc.slice(0, 10)}.json`);
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Report: ${output}`);
}
if (result.missingPublished.length > 0 || result.staleActive.length > 0) process.exitCode = 2;

