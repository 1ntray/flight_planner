import type { CheerioAPI } from 'cheerio';

type CheerioSelection = ReturnType<CheerioAPI>;

interface PendingRowspan {
  readonly value: string;
  rowsLeft: number;
}

export function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Reads published text without the hidden eAIP source-field markers. */
export function visibleText(
  selection: CheerioSelection,
): string {
  const copy = selection.clone();
  copy.find('.sdParams').remove();
  return normalizeText(copy.text());
}

export function findSectionTables(
  $: CheerioAPI,
  sectionHeadingPrefix: string,
): readonly CheerioSelection[] {
  const ordered = $('h4.Title, table').toArray();
  const start = ordered.findIndex(
    (node) =>
      node.type === 'tag' &&
      node.tagName === 'h4' &&
      visibleText($(node)).startsWith(sectionHeadingPrefix),
  );

  if (start < 0) {
    return [];
  }

  const tables: CheerioSelection[] = [];
  for (let index = start + 1; index < ordered.length; index += 1) {
    const node = ordered[index];
    if (node === undefined || node.type !== 'tag') {
      continue;
    }
    if (node.tagName === 'h4') {
      break;
    }
    if (node.tagName === 'table') {
      tables.push($(node));
    }
  }

  return tables;
}

function positiveSpan(value: string | undefined): number {
  if (value === undefined) {
    return 1;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

/** Expands HTML rowspans/colspans into a rectangular logical table. */
export function expandTable(
  $: CheerioAPI,
  table: CheerioSelection,
): readonly (readonly string[])[] {
  const pending = new Map<number, PendingRowspan>();
  const rows: string[][] = [];

  table.find('tr').each((_rowIndex, rowNode) => {
    const row: string[] = [];

    for (const [column, span] of pending) {
      row[column] = span.value;
      span.rowsLeft -= 1;
      if (span.rowsLeft === 0) {
        pending.delete(column);
      }
    }

    let column = 0;
    $(rowNode)
      .children('th, td')
      .each((_cellIndex, cellNode) => {
        while (row[column] !== undefined) {
          column += 1;
        }

        const cell = $(cellNode);
        const value = visibleText(cell);
        const colspan = positiveSpan(cell.attr('colspan'));
        const rowspan = positiveSpan(cell.attr('rowspan'));

        for (let offset = 0; offset < colspan; offset += 1) {
          const targetColumn = column + offset;
          row[targetColumn] = value;
          if (rowspan > 1) {
            pending.set(targetColumn, { value, rowsLeft: rowspan - 1 });
          }
        }

        column += colspan;
      });

    rows.push(row.map((value) => value ?? ''));
  });

  return rows;
}
