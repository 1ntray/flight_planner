import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { NORWAY_EAIP_EDITION } from './edition';
import {
  compareAvinorEaipEditions,
  parseAvinorEaipEditionHistory,
} from './editionDiscovery';

const fixture = readFileSync(fileURLToPath(
  new URL('./fixtures/edition-history.html', import.meta.url),
), 'utf8');
const historyUrl =
  'https://aim-prod.avinor.no/no/AIP/View/Index/155/history-en-GB.html';

describe('Avinor eAIP edition discovery', () => {
  it('selects the newest published current/next issue and constructs exact source URLs', () => {
    expect(parseAvinorEaipEditionHistory(fixture, historyUrl)).toEqual({
      historyUrl,
      publicationDate: '2026-07-02',
      publicationReason: 'This package contains AIP AMDT 05/2026',
      edition: {
        datasetId: 'avinor-eaip-2026-09-03',
        editionLabel: '2026-09-03-AIRAC',
        airacCycle: null,
        effectiveFromUtc: '2026-09-03T00:00:00Z',
        revisionId: 'AIP AMDT 05/2026',
        indexUrl: 'https://aim-prod.avinor.no/no/AIP/View/Index/155/2026-09-03-AIRAC/html/eAIP/EN-AD-1.3-en-GB.html',
        enr21Url: 'https://aim-prod.avinor.no/no/AIP/View/Index/155/2026-09-03-AIRAC/html/eAIP/EN-ENR-2.1-en-GB.html',
        enr22Url: 'https://aim-prod.avinor.no/no/AIP/View/Index/155/2026-09-03-AIRAC/html/eAIP/EN-ENR-2.2-en-GB.html',
      },
    });
  });

  it('detects current and newer editions', () => {
    const currentOnly = fixture.replace(
      /<tbody>\s*<tr>\s*<td><a href="2026-09-03-AIRAC[\s\S]*?<\/tbody>/,
      '<tbody></tbody>',
    );
    const current = parseAvinorEaipEditionHistory(
      currentOnly,
      historyUrl.replace('/Index/155/', '/Index/154/'),
    );
    expect(compareAvinorEaipEditions(NORWAY_EAIP_EDITION, current).status)
      .toBe('current');
    const newer = parseAvinorEaipEditionHistory(fixture, historyUrl);
    expect(compareAvinorEaipEditions(NORWAY_EAIP_EDITION, newer).status)
      .toBe('update-available');
  });

  it('fails explicitly for malformed, ambiguous, or inconsistent discovery data', () => {
    expect(() => parseAvinorEaipEditionHistory(
      fixture.replace('03 SEP 2026', '04 SEP 2026'),
      historyUrl,
    )).toThrow(/does not match/);
    expect(() => parseAvinorEaipEditionHistory(
      fixture.replace(
        '</tbody>\n    </table>\n  </body>',
        '<tr><td><a href="2026-10-01-AIRAC/html/index-en-GB.html">01 OCT 2026</a></td><td>01 AUG 2026</td><td>AIP AMDT 06/2026</td></tr></tbody></table></body>',
      ),
      historyUrl,
    )).toThrow(/more than one issue/);
    expect(() => parseAvinorEaipEditionHistory(
      '<html><body><h2>Current issue</h2></body></html>',
      historyUrl,
    )).toThrow(/has no table/);
    expect(() => parseAvinorEaipEditionHistory(
      fixture.replace('<h2>Next issue</h2>', '<h2>Current issue</h2>'),
      historyUrl,
    )).toThrow(/more than one current issue section/);
    expect(() => parseAvinorEaipEditionHistory(
      fixture
        .replaceAll('2026-09-03-AIRAC', '2026-06-11-AIRAC')
        .replace('03 SEP 2026', '11 JUN 2026'),
      historyUrl,
    )).toThrow(/same effective date/);
  });
});
