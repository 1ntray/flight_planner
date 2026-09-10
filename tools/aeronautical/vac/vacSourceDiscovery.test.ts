import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { discoverVacChartSources } from './vacSourceDiscovery';

const fixture = readFileSync(fileURLToPath(
  new URL('./fixtures/ad-2.24-vac.html', import.meta.url),
), 'utf8');
const pageUrl = 'https://aim-prod.avinor.no/no/AIP/View/Index/155/2026-09-03-AIRAC/html/eAIP/EN-AD-2.ENSR-en-GB.html';

describe('Avinor AD 2.24 VAC discovery', () => {
  it('selects the semantic VAC row and resolves its edition-specific PDF URL', () => {
    expect(discoverVacChartSources(fixture, pageUrl, 'ENSR')).toEqual([{
      icao: 'ENSR',
      title: 'Visual Approach Chart - ICAO',
      aipPage: 'AD 2 ENSR 6 - 1',
      sourceUrl: 'https://aim-prod.avinor.no/no/AIP/View/Index/155/2026-09-03-AIRAC/graphics/643749.pdf',
    }]);
  });

  it('returns an empty list when AD 2.24 publishes no VAC', () => {
    expect(discoverVacChartSources(
      fixture.replace('Visual Approach Chart - ICAO', 'Aerodrome Ground Movement Chart'),
      pageUrl,
      'ENSR',
    )).toEqual([]);
  });

  it('fails explicitly for an ambiguous VAC row', () => {
    expect(() => discoverVacChartSources(
      fixture.replace('</td>\n        </tr>', '<a href="../../graphics/other.pdf">AD 2 ENSR 6 - 2</a></td></tr>'),
      pageUrl,
      'ENSR',
    )).toThrow(/contains 2 PDF links/);
  });
});

