import { describe, expect, it } from 'vitest';
import { detectTableColumnViolations } from './table-columns';

function linesFlagged(body: string, imports = ''): number[] {
  return detectTableColumnViolations(
    'apps/web/src/example.tsx',
    `${imports}\nexport const columns = [\n  { header: 'When', key: 'createdAt', render: (row) => ${body} },\n];\n`,
  ).map((violation) => violation.line);
}

describe('table dates guard', () => {
  it.each([
    ['formatDate()', 'formatDate(row.createdAt)'],
    ['formatDateInTimezone()', "formatDateInTimezone(row.at, 'UTC', 'short')"],
    ['toLocaleDateString()', 'row.at.toLocaleDateString()'],
    ['new Date().toLocaleString()', 'new Date(row.at).toLocaleString()'],
    [
      'ClientFormattedDate',
      '<ClientFormattedDate format="date" value={row.at} />',
    ],
  ])('flags a column that formats with %s', (_name, body) => {
    expect(linesFlagged(body)).toEqual([3]);
  });

  it('flags date-fns format only where the file imports it', () => {
    expect(
      linesFlagged(
        "format(row.at, 'PP')",
        "import { format } from 'date-fns';",
      ),
    ).toEqual([3]);
    expect(linesFlagged("format(row.at, 'PP')")).toEqual([]);
  });

  it.each([
    ['TableDateCell', '<TableDateCell value={row.createdAt} />'],
    [
      'a relative time',
      '<ClientFormattedDate format="relative" value={row.at} />',
    ],
    ['a number', "row.count.toLocaleString('en-US')"],
  ])('allows %s', (_name, body) => {
    expect(linesFlagged(body)).toEqual([]);
  });

  it('honours the escape hatch with a reason', () => {
    const source = [
      'export const columns = [',
      "  { header: 'When', key: 'at', render: (row) =>",
      '    // ui-guard-allow:table-date -- ISO export column',
      '    formatDate(row.at) },',
      '];',
    ].join('\n');
    expect(detectTableColumnViolations('apps/web/x.tsx', source)).toEqual([]);
  });

  it('ignores objects that are not table columns', () => {
    const source =
      "export const fact = { label: 'Created', render: () => formatDate(at) };";
    expect(detectTableColumnViolations('apps/web/x.tsx', source)).toEqual([]);
  });
});

describe('table row controls guard', () => {
  function rulesFor(body: string): string[] {
    return detectTableColumnViolations(
      'apps/web/src/example.tsx',
      `export const columns = [\n  { header: 'Name', key: 'name', render: (row) => ${body} },\n];\n`,
    ).map((violation) => violation.rule);
  }

  it.each([
    [
      'a button that acts',
      '<Button onClick={() => approve(row)}>Approve</Button>',
    ],
    ['a link button', '<Button asChild><Link href="/x">Open</Link></Button>'],
    ['a dropdown menu', '<DropdownMenu>{row.name}</DropdownMenu>'],
  ])('flags %s in a cell', (_name, body) => {
    expect(rulesFor(body)).toEqual(['action']);
  });

  it.each([
    [
      'an unstyled clickable name',
      '<Button variant={ButtonVariant.UNSTYLED} onClick={() => open(row)}>{row.name}</Button>',
    ],
    ['plain content', '<span>{row.name}</span>'],
  ])('allows %s', (_name, body) => {
    expect(rulesFor(body)).toEqual([]);
  });
});
