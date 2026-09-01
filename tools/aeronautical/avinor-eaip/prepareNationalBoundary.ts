import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { parseKartverketNationalBoundaryWfs } from './nationalBoundary';

const OUTPUT_PATH = 'tools/aeronautical/avinor-eaip/prepared/norway-national-boundary-2026.json';
const WFS_URL = 'https://wfs.geonorge.no/skwms1/wfs.administrative_enheter';
const FILTER = `
  <fes:Filter xmlns:fes="http://www.opengis.net/fes/2.0"
    xmlns:app="https://skjema.geonorge.no/SOSI/produktspesifikasjon/AdmEnheter/20240101">
    <fes:PropertyIsEqualTo>
      <fes:ValueReference>app:avgrensningstype</fes:ValueReference>
      <fes:Literal>Riksgrense</fes:Literal>
    </fes:PropertyIsEqualTo>
  </fes:Filter>
`.trim();

async function main(): Promise<void> {
  const requestUrl = new URL(WFS_URL);
  requestUrl.search = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: 'app:Grense',
    srsName: 'EPSG:4326',
    FILTER,
  }).toString();
  const response = await fetch(requestUrl, {
    headers: {
      accept: 'application/gml+xml,application/xml,text/xml',
      'user-agent': 'FlightPlanner-AeronauticalDataPreparer/0.1',
    },
  });
  if (!response.ok) {
    throw new Error(`Kartverket WFS returned ${response.status} ${response.statusText}`);
  }
  const retrievedAtUtc = new Date().toISOString();
  const dataset = parseKartverketNationalBoundaryWfs(
    await response.text(),
    retrievedAtUtc,
    requestUrl.toString(),
  );
  const outputPath = resolve(OUTPUT_PATH);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(dataset)}\n`, 'utf8');
  console.log(`Wrote ${OUTPUT_PATH} (${dataset.lines.length} boundary lines)`);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
