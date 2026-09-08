import { load, loadBuffer } from 'cheerio';

import type { AvinorEaipBatchEditionConfig } from './types';
import { AvinorEaipImportError } from './types';

export const AVINOR_EAIP_PUBLICATION_INDEX_URL =
  'https://aim-prod.avinor.no/no/AIP/';

export interface DiscoveredAvinorEaipEdition {
  readonly edition: AvinorEaipBatchEditionConfig;
  readonly historyUrl: string;
  readonly publicationDate: string;
  readonly publicationReason: string;
}

export type AvinorEaipEditionComparison =
  | {
      readonly status: 'current';
      readonly approved: AvinorEaipBatchEditionConfig;
      readonly discovered: DiscoveredAvinorEaipEdition;
    }
  | {
      readonly status: 'update-available';
      readonly approved: AvinorEaipBatchEditionConfig;
      readonly discovered: DiscoveredAvinorEaipEdition;
    };

const MONTHS: Readonly<Record<string, string>> = {
  JAN: '01',
  FEB: '02',
  MAR: '03',
  APR: '04',
  MAY: '05',
  MAI: '05',
  JUN: '06',
  JUL: '07',
  AUG: '08',
  SEP: '09',
  OCT: '10',
  OKT: '10',
  NOV: '11',
  DEC: '12',
  DES: '12',
};

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function parsePublishedDate(value: string, field: string): string {
  const match = /^(\d{1,2})\s+([A-ZÆØÅ]{3})\s+(\d{4})$/i.exec(
    normalizeText(value).toUpperCase(),
  );
  const month = match?.[2] === undefined ? undefined : MONTHS[match[2]];
  if (match?.[1] === undefined || match[3] === undefined || month === undefined) {
    throw new AvinorEaipImportError(
      'malformed-edition-date',
      `Could not parse Avinor ${field}: ${normalizeText(value)}`,
      'eAIP publication history',
    );
  }
  const day = match[1].padStart(2, '0');
  const isoDate = `${match[3]}-${month}-${day}`;
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== isoDate) {
    throw new AvinorEaipImportError(
      'malformed-edition-date',
      `Invalid Avinor ${field}: ${normalizeText(value)}`,
      'eAIP publication history',
    );
  }
  return isoDate;
}

function normalizedHeading(value: string): 'current' | 'next' | null {
  const text = normalizeText(value).toLowerCase();
  if (text === 'current issue' || text === 'gjeldende utgave') return 'current';
  if (text === 'next issue' || text === 'neste utgave') return 'next';
  return null;
}

function descriptorFromRow(
  cells: readonly string[],
  href: string,
  historyUrl: string,
): DiscoveredAvinorEaipEdition {
  const issueUrl = new URL(href, historyUrl);
  if (issueUrl.origin !== new URL(historyUrl).origin) {
    throw new AvinorEaipImportError(
      'invalid-edition-link',
      'Avinor publication history points to another origin',
      'eAIP publication history',
    );
  }
  const pathMatch = /\/AIP\/View\/Index\/\d+\/(\d{4}-\d{2}-\d{2}-AIRAC)\/html\/index-(?:en-GB|no-NO)\.html$/i
    .exec(issueUrl.pathname);
  if (pathMatch?.[1] === undefined) {
    throw new AvinorEaipImportError(
      'invalid-edition-link',
      `Unsupported Avinor eAIP issue link: ${issueUrl.toString()}`,
      'eAIP publication history',
    );
  }
  const effectiveDate = pathMatch[1].slice(0, 10);
  const visibleEffectiveDate = parsePublishedDate(cells[0] ?? '', 'effective date');
  if (visibleEffectiveDate !== effectiveDate) {
    throw new AvinorEaipImportError(
      'ambiguous-edition-date',
      `Published effective date ${visibleEffectiveDate} does not match ${effectiveDate} in the issue link`,
      'eAIP publication history',
    );
  }
  const publicationDate = parsePublishedDate(cells[1] ?? '', 'publication date');
  const publicationReason = normalizeText(cells[2] ?? '');
  if (publicationReason === '') {
    throw new AvinorEaipImportError(
      'missing-edition-reason',
      'Avinor publication history does not describe the issue',
      'eAIP publication history',
    );
  }
  const revisionId = /\bAIP\s+AMDT\s+\d{2}\/\d{4}\b/i.exec(publicationReason)?.[0]
    .toUpperCase();
  const editionLabel = pathMatch[1];
  return {
    historyUrl,
    publicationDate,
    publicationReason,
    edition: {
      datasetId: `avinor-eaip-${effectiveDate}`,
      editionLabel,
      // The history page does not publish an AIRAC cycle number.
      airacCycle: null,
      effectiveFromUtc: `${effectiveDate}T00:00:00Z`,
      ...(revisionId === undefined ? {} : { revisionId }),
      indexUrl: new URL('eAIP/EN-AD-1.3-en-GB.html', issueUrl).toString(),
      enr21Url: new URL('eAIP/EN-ENR-2.1-en-GB.html', issueUrl).toString(),
      enr22Url: new URL('eAIP/EN-ENR-2.2-en-GB.html', issueUrl).toString(),
    },
  };
}

/**
 * Parses only Avinor's semantic current/next issue tables. Generated element
 * identifiers are deliberately ignored, and ambiguous publication rows fail.
 */
export function parseAvinorEaipEditionHistory(
  source: string | Buffer,
  historyUrl: string,
): DiscoveredAvinorEaipEdition {
  const $ = typeof source === 'string' ? load(source) : loadBuffer(source);
  const discovered: DiscoveredAvinorEaipEdition[] = [];
  const seenSections = new Set<'current' | 'next'>();

  for (const heading of $('h2').toArray()) {
    const section = normalizedHeading($(heading).text());
    if (section === null) continue;
    if (seenSections.has(section)) {
      throw new AvinorEaipImportError(
        'ambiguous-edition-section',
        `Avinor publication history contains more than one ${section} issue section`,
        'eAIP publication history',
      );
    }
    seenSections.add(section);
    const table = $(heading).nextAll('table').first();
    if (table.length === 0) {
      throw new AvinorEaipImportError(
        'missing-edition-table',
        `Avinor ${section} issue heading has no table`,
        'eAIP publication history',
      );
    }
    const headers = table.find('thead th').toArray().map((header) =>
      normalizeText($(header).text()).toLowerCase(),
    );
    if (
      headers.length < 3 ||
      !/(effective|ikrafttred)/.test(headers[0] ?? '') ||
      !/(publication|publikasjon)/.test(headers[1] ?? '') ||
      !/(reason|årsak)/.test(headers[2] ?? '')
    ) {
      throw new AvinorEaipImportError(
        'unsupported-edition-table',
        `Avinor ${section} issue table has unsupported headings`,
        'eAIP publication history',
      );
    }
    const rows = table.find('tbody tr').toArray();
    if (rows.length > 1) {
      throw new AvinorEaipImportError(
        'ambiguous-edition-table',
        `Avinor ${section} issue table contains more than one issue`,
        'eAIP publication history',
      );
    }
    const row = rows[0];
    if (row === undefined) continue;
    const cells = $(row).find('td').toArray().map((cell) =>
      normalizeText($(cell).text()),
    );
    const links = $(row).find('td').first().find('a[href]').toArray();
    if (cells.length < 3 || links.length !== 1 || links[0]?.attribs.href === undefined) {
      throw new AvinorEaipImportError(
        'malformed-edition-row',
        `Avinor ${section} issue row is incomplete or ambiguous`,
        'eAIP publication history',
      );
    }
    discovered.push(descriptorFromRow(
      cells,
      links[0].attribs.href,
      historyUrl,
    ));
  }

  if (discovered.length === 0) {
    throw new AvinorEaipImportError(
      'missing-published-edition',
      'Avinor publication history contains no current or next eAIP issue',
      'eAIP publication history',
    );
  }
  const effectiveDates = discovered.map(({ edition }) => edition.effectiveFromUtc);
  if (new Set(effectiveDates).size !== effectiveDates.length) {
    throw new AvinorEaipImportError(
      'ambiguous-published-edition',
      'Avinor publication history assigns the same effective date to multiple issue sections',
      'eAIP publication history',
    );
  }
  return [...discovered].sort((left, right) =>
    left.edition.effectiveFromUtc.localeCompare(right.edition.effectiveFromUtc),
  ).at(-1)!;
}

export async function discoverLatestAvinorEaipEdition(
  fetchImplementation: typeof fetch = fetch,
  publicationIndexUrl = AVINOR_EAIP_PUBLICATION_INDEX_URL,
): Promise<DiscoveredAvinorEaipEdition> {
  const response = await fetchImplementation(publicationIndexUrl, {
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'user-agent': 'FlightPlanner-eAIP-EditionDiscovery/1.0',
    },
    redirect: 'follow',
  });
  if (!response.ok) {
    throw new Error(
      `Avinor eAIP publication index returned ${response.status} ${response.statusText}`,
    );
  }
  return parseAvinorEaipEditionHistory(
    Buffer.from(await response.arrayBuffer()),
    response.url,
  );
}

function sameEdition(
  approved: AvinorEaipBatchEditionConfig,
  discovered: AvinorEaipBatchEditionConfig,
): boolean {
  return approved.datasetId === discovered.datasetId &&
    approved.editionLabel === discovered.editionLabel &&
    approved.airacCycle === discovered.airacCycle &&
    approved.effectiveFromUtc === discovered.effectiveFromUtc &&
    approved.revisionId === discovered.revisionId &&
    approved.indexUrl === discovered.indexUrl &&
    approved.enr21Url === discovered.enr21Url &&
    approved.enr22Url === discovered.enr22Url;
}

export function compareAvinorEaipEditions(
  approved: AvinorEaipBatchEditionConfig,
  discovered: DiscoveredAvinorEaipEdition,
): AvinorEaipEditionComparison {
  if (discovered.edition.effectiveFromUtc < approved.effectiveFromUtc) {
    throw new AvinorEaipImportError(
      'edition-discovery-regression',
      `Avinor publication index returned ${discovered.edition.editionLabel}, older than approved ${approved.editionLabel}`,
      'eAIP publication history',
    );
  }
  return {
    status: sameEdition(approved, discovered.edition)
      ? 'current'
      : 'update-available',
    approved,
    discovered,
  };
}
