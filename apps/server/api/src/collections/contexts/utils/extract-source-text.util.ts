import { inflateRawSync, inflateSync } from 'node:zlib';
import { KnowledgeBaseCategory } from '@genfeedai/enums';
import { safeFetch } from '@libs/security/destination-guard';
import * as cheerio from 'cheerio';

export const KNOWLEDGE_SOURCE_MAX_BYTES = 2_000_000;

export const INGESTIBLE_KNOWLEDGE_SOURCE_CATEGORIES = [
  KnowledgeBaseCategory.URL,
  KnowledgeBaseCategory.DOCUMENT,
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
  mimeType: string;
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
  category: KnowledgeBaseCategory;
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
  $('script, style, noscript, iframe, svg').remove();
  const title = $('title').first().text().trim();
  const body = ($('body').text() || $.root().text())
    .replace(/\s+/g, ' ')
    .trim();
  return [title, body].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
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

function extractByMimeType(bytes: Buffer, mimeType: string): string {
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

  const fetchImpl = input.fetchImpl ?? safeFetch;
  const response = await fetchImpl(input.referenceUrl, {
    headers: TEXT_FETCH_HEADERS,
    redirect: 'manual',
  });

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
  const text = extractByMimeType(bytes, mimeType);
  if (!text) {
    throw new Error('Source did not contain extractable text');
  }

  return { mimeType, text };
}
