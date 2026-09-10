import { load, loadBuffer } from 'cheerio';

import { AvinorEaipImportError } from '../avinor-eaip/types';

export interface PublishedVacChartSource {
  readonly icao: string;
  readonly title: string;
  readonly aipPage: string;
  readonly sourceUrl: string;
}

function normalizeText(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Resolves VAC PDFs from the selected edition's semantic AD 2.24 table.
 * Numeric Avinor graphics ids are deliberately treated only as opaque URLs;
 * they are never carried across editions or used as stable chart identity.
 */
export function discoverVacChartSources(
  html: string | Buffer,
  adPageUrl: string,
  expectedIcao: string,
): readonly PublishedVacChartSource[] {
  const icao = expectedIcao.toUpperCase();
  const $ = typeof html === 'string' ? load(html) : loadBuffer(html);
  const discovered = new Map<string, PublishedVacChartSource>();

  for (const row of $('tr').toArray()) {
    const cells = $(row).find('th, td').toArray();
    if (cells.length < 2) continue;
    const title = normalizeText($(cells[0]).text());
    if (!/\bvisual\s+approach\s+chart\s*-\s*icao\b/i.test(title)) continue;

    const pdfLinks = $(row).find('a[href]').toArray().filter((link) =>
      /\.pdf(?:[?#].*)?$/i.test(link.attribs.href ?? ''),
    );
    if (pdfLinks.length !== 1) {
      throw new AvinorEaipImportError(
        'ambiguous-vac-source',
        `AD 2.24 ${icao} VAC row contains ${pdfLinks.length} PDF links`,
        'AD 2.24',
      );
    }

    const link = pdfLinks[0]!;
    const href = link.attribs.href!;
    const sourceUrl = new URL(href, adPageUrl).toString();
    const aipPage = normalizeText($(link).text());
    const pageMatch = new RegExp(`^AD\\s*2\\s*${icao}\\s*6\\s*-\\s*\\d+[A-Z]?$`, 'i');
    if (!pageMatch.test(aipPage)) {
      throw new AvinorEaipImportError(
        'malformed-vac-page-reference',
        `AD 2.24 ${icao} VAC has unexpected page reference "${aipPage}"`,
        'AD 2.24',
      );
    }
    const source = new URL(sourceUrl);
    const adPage = new URL(adPageUrl);
    if (source.protocol !== 'https:' || source.origin !== adPage.origin) {
      throw new AvinorEaipImportError(
        'malformed-vac-source',
        `AD 2.24 ${icao} VAC does not link to an Avinor HTTPS PDF`,
        'AD 2.24',
      );
    }

    const existing = discovered.get(aipPage.toUpperCase());
    if (existing !== undefined && existing.sourceUrl !== sourceUrl) {
      throw new AvinorEaipImportError(
        'ambiguous-vac-source',
        `AD 2.24 ${icao} lists multiple PDFs for ${aipPage}`,
        'AD 2.24',
      );
    }
    discovered.set(aipPage.toUpperCase(), { icao, title, aipPage, sourceUrl });
  }

  return [...discovered.values()].sort((left, right) => left.aipPage.localeCompare(right.aipPage));
}

