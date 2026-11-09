import { isEmail } from 'class-validator';

const EMAIL_HEADER_PATTERN = /^e-?mail(?:\s*address)?$/i;
const NAME_HEADER_PATTERN = /^(?:name|full\s*name|first\s*name)$/i;
const TAGS_HEADER_PATTERN = /^(?:tags?|labels?)$/i;
const TAG_SPLIT_PATTERN = /[;|]/;
const LINE_SPLIT_PATTERN = /[\s,;]+/;
const CSV_QUOTE_PATTERN = /[",\n\r]/;
/** Spreadsheet formula prefixes; a leading quote makes the cell plain text. */
const FORMULA_PREFIX_PATTERN = /^[=+\-@\t\r]/;
const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 50;
const MAX_NAME_LENGTH = 120;

export interface SubscriberCsvColumns {
  email?: string;
  name?: string;
  tags?: string;
}

export interface ParsedSubscriberRow {
  /** 1-based row number in the file, header included. */
  row: number;
  email: string;
  name: string | null;
  tags: string[];
}

export interface ParsedSubscriberFile {
  rows: ParsedSubscriberRow[];
  invalid: { row: number; value: string }[];
}

/** RFC 4180 CSV: quoted fields, doubled quotes, CRLF or LF line ends. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let isQuoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (isQuoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        isQuoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"' && field === '') {
      isQuoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidSubscriberEmail(email: string): boolean {
  return email.length <= 254 && isEmail(email);
}

function findColumn(
  header: string[],
  requested: string | undefined,
  pattern: RegExp,
): number {
  if (requested) {
    return header.findIndex(
      (cell) => cell.trim().toLowerCase() === requested.trim().toLowerCase(),
    );
  }
  return header.findIndex((cell) => pattern.test(cell.trim()));
}

function readTags(value: string | undefined): string[] {
  if (!value) return [];
  return [
    ...new Set(
      value
        .split(TAG_SPLIT_PATTERN)
        .map((tag) => tag.trim().slice(0, MAX_TAG_LENGTH))
        .filter(Boolean),
    ),
  ].slice(0, MAX_TAGS);
}

/**
 * Map a subscriber CSV to rows. A header row is detected by an email column
 * name; without one, the first column holding an address is the email.
 */
export function parseSubscriberCsv(
  text: string,
  columns: SubscriberCsvColumns = {},
): ParsedSubscriberFile {
  const table = parseCsv(text);
  const first = table[0] ?? [];
  const emailHeader = findColumn(first, columns.email, EMAIL_HEADER_PATTERN);
  const hasHeader = emailHeader >= 0;
  const emailColumn = hasHeader
    ? emailHeader
    : Math.max(
        0,
        first.findIndex((cell) => cell.includes('@')),
      );
  const nameColumn = hasHeader
    ? findColumn(first, columns.name, NAME_HEADER_PATTERN)
    : -1;
  const tagsColumn = hasHeader
    ? findColumn(first, columns.tags, TAGS_HEADER_PATTERN)
    : -1;
  const result: ParsedSubscriberFile = { invalid: [], rows: [] };
  table.forEach((cells, index) => {
    if (hasHeader && index === 0) return;
    const raw = cells[emailColumn] ?? '';
    const email = normalizeEmail(raw);
    if (!isValidSubscriberEmail(email)) {
      result.invalid.push({ row: index + 1, value: raw.trim().slice(0, 254) });
      return;
    }
    const name =
      nameColumn >= 0
        ? cells[nameColumn]?.trim().slice(0, MAX_NAME_LENGTH) || null
        : null;
    result.rows.push({
      email,
      name,
      row: index + 1,
      tags: tagsColumn >= 0 ? readTags(cells[tagsColumn]) : [],
    });
  });
  return result;
}

/** Addresses pasted one per line, or separated by commas or spaces. */
export function parseEmailList(values: string[]): ParsedSubscriberFile {
  const result: ParsedSubscriberFile = { invalid: [], rows: [] };
  let row = 0;
  for (const value of values) {
    for (const token of value.split(LINE_SPLIT_PATTERN)) {
      if (!token.trim()) continue;
      row += 1;
      const email = normalizeEmail(token);
      if (isValidSubscriberEmail(email)) {
        result.rows.push({ email, name: null, row, tags: [] });
      } else {
        result.invalid.push({ row, value: token.trim().slice(0, 254) });
      }
    }
  }
  return result;
}

function csvCell(raw: string): string {
  const value = FORMULA_PREFIX_PATTERN.test(raw) ? `'${raw}` : raw;
  return CSV_QUOTE_PATTERN.test(value)
    ? `"${value.replaceAll('"', '""')}"`
    : value;
}

export function toCsv(header: string[], rows: string[][]): string {
  return [header, ...rows]
    .map((cells) => cells.map(csvCell).join(','))
    .join('\n');
}
