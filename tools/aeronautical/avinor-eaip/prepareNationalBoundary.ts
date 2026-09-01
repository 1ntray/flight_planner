import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
  parseKartverketNationalBoundaryWfs,
  simplifyNationalBoundaryLine,
  validatePreparedNationalBoundaryDataset,
  type PreparedNationalBoundaryDataset,
} from './nationalBoundary.ts';

const OUTPUT_PATH = 'tools/aeronautical/avinor-eaip/prepared/norway-national-boundary-2026.json';
const WFS_URL = 'https://wfs.geonorge.no/skwms1/wfs.norgesmaritimegrenser';

async function main(): Promise<void> {
  const retrievedAtUtc = new Date().toISOString();
  const pageSize = 250;
  const lines: (readonly (readonly [number, number])[])[] = [];
  let firstPage: PreparedNationalBoundaryDataset | null = null;
  for (const typeName of ['app:Riksgrense', 'app:AvtaltAvgrensningslinje']) {
    for (let startIndex = 0; ; startIndex += pageSize) {
      const requestUrl = new URL(WFS_URL);
      requestUrl.search = new URLSearchParams({
        service: 'WFS',
        version: '2.0.0',
        request: 'GetFeature',
        typeNames: typeName,
        srsName: 'EPSG:4326',
        count: String(pageSize),
        startIndex: String(startIndex),
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
      const source = await response.text();
      const page = parseKartverketNationalBoundaryWfs(
        source,
        retrievedAtUtc,
        requestUrl.toString(),
      );
      firstPage ??= page;
      lines.push(...page.lines);
      const numberReturned = Number(/\bnumberReturned="(\d+)"/.exec(source)?.[1]);
      if (!Number.isFinite(numberReturned) || numberReturned < pageSize) break;
    }
  }
  if (firstPage === null) throw new Error('Kartverket WFS returned no national-boundary data');
  const combinedDataset = validatePreparedNationalBoundaryDataset({
    ...firstPage,
    source: {
      ...firstPage.source,
      sourceUrl: `${WFS_URL}?service=WFS&request=GetCapabilities`,
    },
    lines: lines.map((line) => simplifyNationalBoundaryLine(line)),
  });
  const outputPath = resolve(OUTPUT_PATH);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(combinedDataset)}\n`, 'utf8');
  console.log(`Wrote ${OUTPUT_PATH} (${combinedDataset.lines.length} boundary lines)`);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
