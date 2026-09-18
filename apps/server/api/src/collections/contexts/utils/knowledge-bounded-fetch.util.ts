import { KNOWLEDGE_SOURCE_MAX_BYTES } from '@api/collections/contexts/utils/extract-source-text.util';
import {
  KNOWLEDGE_MEDIA_MAX_BYTES,
  KNOWLEDGE_TRANSCRIPT_TIMEOUT_MS,
} from '@genfeedai/contracts';
import { safeFetch } from '@libs/security/destination-guard';

export interface BoundedFetchResult {
  bytes: Buffer;
  finalUrl: string;
  mimeType: string;
  status: number;
}

export class KnowledgeFetchProhibitedError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(
      status === 451
        ? 'The source prohibits automated access'
        : 'Access to the source was denied',
    );
    this.name = 'KnowledgeFetchProhibitedError';
    this.status = status;
  }
}

function headerMime(headers: Headers): string {
  return headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
}

export async function fetchKnowledgeBytes(input: {
  maxBytes?: number;
  referenceUrl: string;
  timeoutMs?: number;
}): Promise<BoundedFetchResult> {
  const maxBytes = input.maxBytes ?? KNOWLEDGE_SOURCE_MAX_BYTES;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    input.timeoutMs ?? KNOWLEDGE_TRANSCRIPT_TIMEOUT_MS,
  );
  try {
    const response = await safeFetch(input.referenceUrl, {
      redirect: 'follow',
      signal: controller.signal,
    });
    if (
      response.status === 401 ||
      response.status === 403 ||
      response.status === 451
    ) {
      throw new KnowledgeFetchProhibitedError(response.status);
    }
    if (!response.ok) {
      throw new Error(`Failed to fetch source (${response.status})`);
    }
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw new Error('The source exceeds the ingest size limit');
    }
    const reader = response.body?.getReader();
    if (!reader) {
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.byteLength > maxBytes) {
        throw new Error('The source exceeds the ingest size limit');
      }
      return {
        bytes,
        finalUrl: response.url || input.referenceUrl,
        mimeType: headerMime(response.headers),
        status: response.status,
      };
    }
    const chunks: Buffer[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value) {
        continue;
      }
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error('The source exceeds the ingest size limit');
      }
      chunks.push(Buffer.from(value));
    }
    return {
      bytes: Buffer.concat(chunks),
      finalUrl: response.url || input.referenceUrl,
      mimeType: headerMime(response.headers),
      status: response.status,
    };
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('The source timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function knowledgeMediaByteLimit(): number {
  return KNOWLEDGE_MEDIA_MAX_BYTES;
}
