import type { McpImageContentPart } from '@genfeedai/contracts/interfaces';
import { toMcpMediaToolResult } from '@genfeedai/helpers';

// Bound both the response stream and its base64 expansion (4 MiB).
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const IMAGE_TIMEOUT_MS = 8000;
const COMPLETED_STATUSES = new Set(['GENERATED', 'COMPLETED', 'READY']);

function trustedImageUrl(
  value: string,
  origins: readonly string[],
): URL | undefined {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.protocol !== 'https:')
      return undefined;
    return origins.some((origin) => new URL(origin).origin === url.origin)
      ? url
      : undefined;
  } catch {
    return undefined;
  }
}

function imageMimeType(bytes: Buffer): string | undefined {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  )
    return 'image/jpeg';
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return 'image/png';
  if (['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii')))
    return 'image/gif';
  if (
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  )
    return 'image/webp';
  return undefined;
}

async function fetchImage(url: URL): Promise<McpImageContentPart> {
  const response = await fetch(url.href, {
    credentials: 'omit',
    redirect: 'error',
    signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
  });
  const reader = response.body?.getReader();
  try {
    if (
      !response.ok ||
      !reader ||
      Number(response.headers.get('content-length')) > MAX_IMAGE_BYTES
    )
      throw new Error('Image response unavailable or too large');
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_IMAGE_BYTES) throw new Error('Image response too large');
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks, size);
    const mimeType = imageMimeType(bytes);
    const contentType = response.headers
      .get('content-type')
      ?.split(';')[0]
      .trim()
      .toLowerCase();
    if (!mimeType || contentType !== mimeType)
      throw new Error('Image response has invalid MIME or bytes');
    return { data: bytes.toString('base64'), mimeType, type: 'image' };
  } finally {
    await reader?.cancel().catch(() => undefined);
    reader?.releaseLock();
  }
}

/** Native MCP image content for completed, authenticated API results only. */
export async function toNativeMcpMediaResult(
  payload: Record<string, unknown>,
  origins: readonly string[],
) {
  const fallback = toMcpMediaToolResult(payload);
  const artifact = fallback.structuredContent.artifact;
  if (
    artifact?.kind !== 'image' ||
    !artifact.url ||
    !COMPLETED_STATUSES.has(artifact.status.toUpperCase())
  )
    return fallback;
  const url = trustedImageUrl(artifact.url, origins);
  if (!url) return fallback;
  try {
    const image = await fetchImage(url);
    const result = toMcpMediaToolResult(payload, image);
    if (result.structuredContent.artifact)
      result.structuredContent.artifact.sizeBytes = Buffer.byteLength(
        image.data,
        'base64',
      );
    return result;
  } catch {
    fallback.content.push({
      type: 'text',
      text: 'Native image preview unavailable; open the resource link to view the image.',
    });
    return fallback;
  }
}
