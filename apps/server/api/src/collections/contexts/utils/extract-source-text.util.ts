import { inflateRawSync, inflateSync } from 'node:zlib';
import { KnowledgeBaseCategory } from '@genfeedai/contracts';
import { safeFetch } from '@libs/security/destination-guard';
import * as cheerio from 'cheerio';

export const KNOWLEDGE_SOURCE_MAX_BYTES = 2_000_000;

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
    .replace(/\s+/g, ' ')
    .trim();
  return [title, article].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
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
      .replace(/\s+/g, ' ')
      .trim();
    return [identity, title, summary].filter(Boolean).join(' ');
  });
  const snapshot = [feedTitle, ...entries]
    .filter(Boolean)
    .join('\n')
    .replace(/\s+\n/g, '\n')
    .trim();
  if (!snapshot && items.length === 0) {
    return feedTitle || 'empty-feed';
  }
  return snapshot;
}

function decodePdfLiteral(literal: string): string {
  return literal
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
    .replace(/\\(\d{1,3})/g, (_match, octal: string) =>
      String.fromCharCode(Number.parseInt(octal, 8)),
    );
}

function collectPdfLiterals(payload: string, parts: string[]): void {
  for (const match of payload.matchAll(/\((?:\\.|[^\\)])*\)\s*Tj/g)) {
    const literal = match[0].replace(/^[(]/, '').replace(/\)\s*Tj$/, '');
    const decoded = decodePdfLiteral(literal).trim();
    if (decoded) {
      parts.push(decoded);
    }
  }

  for (const match of payload.matchAll(/\[([\s\S]*?)\]\s*TJ/g)) {
    const block = match[1] ?? '';
    for (const inner of block.matchAll(/\((?:\\.|[^\\)])*\)/g)) {
      const literal = inner[0].slice(1, -1);
      const decoded = decodePdfLiteral(literal).trim();
      if (decoded) {
        parts.push(decoded);
      }
    }
  }
}

function inflatePdfStream(bytes: Buffer): string | null {
  try {
    return inflateSync(bytes).toString('latin1');
  } catch {
    try {
      return inflateRawSync(bytes).toString('latin1');
    } catch {
      return null;
    }
  }
}

export function extractPdfText(buffer: Buffer): string {
  const raw = buffer.toString('latin1');
  const parts: string[] = [];

  collectPdfLiterals(raw, parts);

  for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    const payload = Buffer.from(match[1] ?? '', 'latin1');
    const inflated = inflatePdfStream(payload);
    collectPdfLiterals(inflated ?? payload.toString('latin1'), parts);
  }

  const text = parts.join(' ').replace(/\s+/g, ' ').trim();
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
    return decodeTextBytes(bytes).replace(/\s+/g, ' ').trim();
  }

  const preview = decodeTextBytes(bytes.subarray(0, 256)).trim();
  if (preview.startsWith('<') && preview.toLowerCase().includes('html')) {
    return extractHtmlText(decodeTextBytes(bytes));
  }

  throw new Error(`Unsupported document mime type: ${mimeType}`);
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
    if (!input.conditional?.etag && !input.conditional?.lastModified) {
      throw new Error('Unsolicited not-modified response');
    }
    return { mimeType: 'text/plain', notModified: true, text: '' };
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch source (${response.status})`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > KNOWLEDGE_SOURCE_MAX_BYTES) {
    throw new Error(
      `Source exceeds the ${KNOWLEDGE_SOURCE_MAX_BYTES} byte ingest limit`,
    );
  }

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
