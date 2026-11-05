import { inflateRawSync, inflateSync } from 'node:zlib';
import { KnowledgeBaseCategory } from '@genfeedai/contracts';
import { safeFetch } from '@libs/security/destination-guard';
import * as cheerio from 'cheerio';

const WHITESPACE_RUNS_PATTERN = /\s+/g;
const WHITESPACE_BEFORE_NEWLINE_PATTERN = /\s+\n/g;
const ESCAPED_NEWLINES_PATTERN = /\\n/g;
const ESCAPED_CARRIAGE_RETURNS_PATTERN = /\\r/g;
const ESCAPED_TABS_PATTERN = /\\t/g;
const ESCAPED_OPEN_PARENS_PATTERN = /\\\(/g;
const ESCAPED_CLOSE_PARENS_PATTERN = /\\\)/g;
const ESCAPED_BACKSLASHES_PATTERN = /\\\\/g;
const ESCAPED_OCTALS_PATTERN = /\\(\d{1,3})/g;
const PDF_TJ_OPERATORS_PATTERN = /\((?:\\.|[^\\)])*\)\s*Tj/g;
const LEADING_OPEN_PAREN_PATTERN = /^[(]/;
const TRAILING_TJ_OPERATOR_PATTERN = /\)\s*Tj$/;
const PDF_TJ_ARRAYS_PATTERN = /\[([\s\S]*?)\]\s*TJ/g;
const PDF_STRING_LITERALS_PATTERN = /\((?:\\.|[^\\)])*\)/g;
const PDF_STREAMS_PATTERN = /stream\r?\n([\s\S]*?)endstream/g;

export const KNOWLEDGE_SOURCE_MAX_BYTES = 2_000_000;

/**
 * Inflation ceiling for one PDF Flate stream, for the sum of successful
 * inflations in one document, and for the extracted text. A quota-compliant
 * PDF can carry highly compressible streams that expand into hundreds of
 * megabytes on the request thread. Non-text streams never move the extracted
 * text counter, so the document budget is separate from that counter.
 */
export const PDF_MAX_INFLATED_BYTES = 16 * 1024 * 1024;
export const PDF_MAX_DOCUMENT_INFLATED_BYTES = PDF_MAX_INFLATED_BYTES;
export const PDF_MAX_EXTRACTED_CHARS = 2_000_000;

export const INGESTIBLE_KNOWLEDGE_SOURCE_CATEGORIES = [
  KnowledgeBaseCategory.AUDIO,
  KnowledgeBaseCategory.DOCUMENT,
  KnowledgeBaseCategory.RSS,
  KnowledgeBaseCategory.URL,
  KnowledgeBaseCategory.VIDEO,
] as const;

export type IngestibleKnowledgeSourceCategory =
  (typeof INGESTIBLE_KNOWLEDGE_SOURCE_CATEGORIES)[number];

export class UnsupportedKnowledgeSourceError extends Error {
  readonly category: KnowledgeBaseCategory;

  constructor(category: KnowledgeBaseCategory) {
    super(`${category} sources are not ingested yet`);
    this.category = category;
    this.name = 'UnsupportedKnowledgeSourceError';
  }
}

export interface ExtractedSourceText {
  etag?: string;
  lastModified?: string;
  mimeType: string;
  notModified?: boolean;
  text: string;
}

export type SourceTextFetch = (
  input: string,
  init?: RequestInit,
) => Promise<{
  arrayBuffer: () => Promise<ArrayBuffer>;
  body?: ReadableStream<Uint8Array> | null;
  headers: Headers;
  ok: boolean;
  status: number;
}>;

export interface ExtractSourceTextInput {
  capturedText?: string;
  category: KnowledgeBaseCategory;
  conditional?: { etag?: string; lastModified?: string };
  fetchImpl?: SourceTextFetch;
  referenceUrl: string;
}

const TEXT_FETCH_HEADERS = {
  Accept:
    'text/html,application/xhtml+xml,text/plain,text/markdown,application/pdf,application/json,text/csv,*/*;q=0.8',
  'User-Agent':
    'Mozilla/5.0 (compatible; GenfeedKnowledgeIngest/1.0; +https://genfeed.ai)',
} as const;

export function isIngestibleKnowledgeSourceCategory(
  category: KnowledgeBaseCategory,
): category is IngestibleKnowledgeSourceCategory {
  return (INGESTIBLE_KNOWLEDGE_SOURCE_CATEGORIES as readonly string[]).includes(
    category,
  );
}

export function extractHtmlText(html: string): string {
  const $ = cheerio.load(html);
  $(
    'script, style, noscript, iframe, svg, nav, header, footer, aside',
  ).remove();
  $('[class*="view-count"], [class*="timestamp"], time[datetime]').remove();
  const title = $('title').first().text().trim();
  const article = (
    $('main, article').first().text() ||
    $('body').text() ||
    $.root().text()
  )
    .replace(WHITESPACE_RUNS_PATTERN, ' ')
    .trim();
  return [title, article]
    .filter(Boolean)
    .join(' ')
    .replace(WHITESPACE_RUNS_PATTERN, ' ')
    .trim();
}

export function extractRssText(xml: string): string {
  const $ = cheerio.load(xml, { xml: true });
  const isFeed = $('rss, feed, channel').length > 0;
  if (!isFeed) {
    throw new Error('Source is not a valid RSS or Atom feed');
  }
  const items = $('item, entry').toArray();
  if (items.length > 200) {
    throw new Error('Feed exceeds the 200-entry ingest limit');
  }
  const feedTitle = (
    $('channel > title, feed > title').first().text() || ''
  ).trim();
  const entries = items.map((item) => {
    const node = $(item);
    const identity =
      node.find('guid, id').first().text().trim() ||
      node.find('link').first().attr('href') ||
      node.find('link').first().text().trim();
    const title = node.find('title').first().text().trim();
    const summary = (
      node.find('description, summary, content').first().text() || ''
    )
      .replace(WHITESPACE_RUNS_PATTERN, ' ')
      .trim();
    return [identity, title, summary].filter(Boolean).join(' ');
  });
  const snapshot = [feedTitle, ...entries]
    .filter(Boolean)
    .join('\n')
    .replace(WHITESPACE_BEFORE_NEWLINE_PATTERN, '\n')
    .trim();
  if (!snapshot && items.length === 0) {
    return feedTitle || 'empty-feed';
  }
  return snapshot;
}

function decodePdfLiteral(literal: string): string {
  return literal
    .replace(ESCAPED_NEWLINES_PATTERN, '\n')
    .replace(ESCAPED_CARRIAGE_RETURNS_PATTERN, '\r')
    .replace(ESCAPED_TABS_PATTERN, '\t')
    .replace(ESCAPED_OPEN_PARENS_PATTERN, '(')
    .replace(ESCAPED_CLOSE_PARENS_PATTERN, ')')
    .replace(ESCAPED_BACKSLASHES_PATTERN, '\\')
    .replace(ESCAPED_OCTALS_PATTERN, (_match, octal: string) =>
      String.fromCharCode(Number.parseInt(octal, 8)),
    );
}

function collectPdfLiterals(payload: string, parts: string[]): void {
  for (const match of payload.matchAll(PDF_TJ_OPERATORS_PATTERN)) {
    const literal = match[0]
      .replace(LEADING_OPEN_PAREN_PATTERN, '')
      .replace(TRAILING_TJ_OPERATOR_PATTERN, '');
    const decoded = decodePdfLiteral(literal).trim();
    if (decoded) {
      parts.push(decoded);
    }
  }

  for (const match of payload.matchAll(PDF_TJ_ARRAYS_PATTERN)) {
    const block = match[1] ?? '';
    for (const inner of block.matchAll(PDF_STRING_LITERALS_PATTERN)) {
      const literal = inner[0].slice(1, -1);
      const decoded = decodePdfLiteral(literal).trim();
      if (decoded) {
        parts.push(decoded);
      }
    }
  }
}

function inflateWithinLimit(
  bytes: Buffer,
  maxOutputLength: number,
): Buffer | null {
  const limits = { maxOutputLength };
  try {
    return inflateSync(bytes, limits);
  } catch {
    try {
      return inflateRawSync(bytes, limits);
    } catch {
      return null;
    }
  }
}

function inflatePdfStream(
  bytes: Buffer,
  remainingBudget: number,
): { exhaustedBudget: boolean; inflatedBytes: number; text: string | null } {
  const maxOutputLength = Math.min(PDF_MAX_INFLATED_BYTES, remainingBudget);
  if (maxOutputLength <= 0) {
    return { exhaustedBudget: true, inflatedBytes: 0, text: null };
  }

  const inflated = inflateWithinLimit(bytes, maxOutputLength);
  if (!inflated) {
    return {
      exhaustedBudget: maxOutputLength < PDF_MAX_INFLATED_BYTES,
      inflatedBytes: 0,
      text: null,
    };
  }

  return {
    exhaustedBudget: false,
    inflatedBytes: inflated.length,
    text: inflated.toString('latin1'),
  };
}

export function extractPdfText(buffer: Buffer): string {
  const raw = buffer.toString('latin1');
  const parts: string[] = [];

  let extractedChars = 0;
  let countedParts = 0;
  const countNewParts = (): number => {
    for (; countedParts < parts.length; countedParts++) {
      extractedChars += parts[countedParts].length;
    }
    return extractedChars;
  };

  collectPdfLiterals(raw, parts);
  countNewParts();

  let inflatedBytes = 0;
  for (const match of raw.matchAll(PDF_STREAMS_PATTERN)) {
    if (inflatedBytes >= PDF_MAX_DOCUMENT_INFLATED_BYTES) {
      break;
    }

    const payload = Buffer.from(match[1] ?? '', 'latin1');
    const inflated = inflatePdfStream(
      payload,
      PDF_MAX_DOCUMENT_INFLATED_BYTES - inflatedBytes,
    );
    collectPdfLiterals(inflated.text ?? payload.toString('latin1'), parts);
    inflatedBytes += inflated.inflatedBytes;

    // A stream that cannot fit in the remaining document budget must not be
    // followed by another inflation. A per-stream failure still falls through
    // to the compressed bytes and leaves the budget unchanged.
    if (inflated.exhaustedBudget || countNewParts() > PDF_MAX_EXTRACTED_CHARS) {
      break;
    }
  }

  const text = parts
    .join(' ')
    .slice(0, PDF_MAX_EXTRACTED_CHARS)
    .replace(WHITESPACE_RUNS_PATTERN, ' ')
    .trim();
  if (!text) {
    throw new Error('No extractable text in PDF');
  }
  return text;
}

function sniffMimeType(
  contentType: string | null,
  referenceUrl: string,
  bytes: Buffer,
): string {
  const header = contentType?.split(';')[0]?.trim().toLowerCase();
  if (header) {
    return header;
  }

  if (bytes.subarray(0, 5).toString('latin1') === '%PDF-') {
    return 'application/pdf';
  }

  const pathname = new URL(referenceUrl).pathname.toLowerCase();
  if (pathname.endsWith('.pdf')) return 'application/pdf';
  if (pathname.endsWith('.md')) return 'text/markdown';
  if (pathname.endsWith('.txt')) return 'text/plain';
  if (pathname.endsWith('.csv')) return 'text/csv';
  if (pathname.endsWith('.json')) return 'application/json';
  if (pathname.endsWith('.html') || pathname.endsWith('.htm'))
    return 'text/html';

  return 'application/octet-stream';
}

function decodeTextBytes(bytes: Buffer): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

function extractByMimeType(
  bytes: Buffer,
  mimeType: string,
  category: KnowledgeBaseCategory,
): string {
  if (category === KnowledgeBaseCategory.RSS) {
    return extractRssText(decodeTextBytes(bytes));
  }
  if (
    category === KnowledgeBaseCategory.AUDIO ||
    category === KnowledgeBaseCategory.VIDEO
  ) {
    throw new Error('No transcript is available for this media source');
  }
  if (
    mimeType === 'text/html' ||
    mimeType === 'application/xhtml+xml' ||
    mimeType === 'application/xml' ||
    mimeType === 'text/xml'
  ) {
    return extractHtmlText(decodeTextBytes(bytes));
  }

  if (mimeType === 'application/pdf') {
    return extractPdfText(bytes);
  }

  if (
    mimeType === 'text/plain' ||
    mimeType === 'text/markdown' ||
    mimeType === 'text/csv' ||
    mimeType === 'application/json'
  ) {
    return decodeTextBytes(bytes).replace(WHITESPACE_RUNS_PATTERN, ' ').trim();
  }

  const preview = decodeTextBytes(bytes.subarray(0, 256)).trim();
  if (preview.startsWith('<') && preview.toLowerCase().includes('html')) {
    return extractHtmlText(decodeTextBytes(bytes));
  }

  throw new Error(`Unsupported document mime type: ${mimeType}`);
}

function cancelSourceBody(
  body: ReadableStream<Uint8Array> | null | undefined,
): void {
  void body?.cancel().catch(() => {});
}

async function readSourceBytes(
  response: Awaited<ReturnType<SourceTextFetch>>,
): Promise<Buffer> {
  const limitMessage = `Source exceeds the ${KNOWLEDGE_SOURCE_MAX_BYTES} byte ingest limit`;
  if (
    Number(response.headers.get('content-length')) > KNOWLEDGE_SOURCE_MAX_BYTES
  ) {
    cancelSourceBody(response.body);
    throw new Error(limitMessage);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > KNOWLEDGE_SOURCE_MAX_BYTES) {
      throw new Error(limitMessage);
    }
    return bytes;
  }

  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  let completed = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        completed = true;
        break;
      }
      byteLength += value.byteLength;
      if (byteLength > KNOWLEDGE_SOURCE_MAX_BYTES) {
        throw new Error(limitMessage);
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks, byteLength);
  } finally {
    if (!completed) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function extractSourceText(
  input: ExtractSourceTextInput,
): Promise<ExtractedSourceText> {
  if (!isIngestibleKnowledgeSourceCategory(input.category)) {
    throw new UnsupportedKnowledgeSourceError(input.category);
  }
  if (input.capturedText) {
    return { mimeType: 'text/plain', text: input.capturedText };
  }

  const fetchImpl = input.fetchImpl ?? safeFetch;
  const headers: Record<string, string> = { ...TEXT_FETCH_HEADERS };
  if (input.conditional?.etag) {
    headers['If-None-Match'] = input.conditional.etag;
  }
  if (input.conditional?.lastModified) {
    headers['If-Modified-Since'] = input.conditional.lastModified;
  }
  const response = await fetchImpl(input.referenceUrl, {
    headers,
    redirect: 'manual',
  });

  if (response.status === 304) {
    cancelSourceBody(response.body);
    if (!input.conditional?.etag && !input.conditional?.lastModified) {
      throw new Error('Unsolicited not-modified response');
    }
    return { mimeType: 'text/plain', notModified: true, text: '' };
  }

  if (!response.ok) {
    cancelSourceBody(response.body);
    throw new Error(`Failed to fetch source (${response.status})`);
  }

  const bytes = await readSourceBytes(response);

  const mimeType = sniffMimeType(
    response.headers.get('content-type'),
    input.referenceUrl,
    bytes,
  );
  const text = extractByMimeType(bytes, mimeType, input.category);
  if (!text) {
    throw new Error('Source did not contain extractable text');
  }

  return {
    etag: response.headers.get('etag') ?? undefined,
    lastModified: response.headers.get('last-modified') ?? undefined,
    mimeType,
    text,
  };
}
