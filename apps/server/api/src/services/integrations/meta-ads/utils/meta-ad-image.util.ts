import { safeFetch } from '@libs/security/destination-guard';

export async function readMetaAdImageBytes(imageUrl: string): Promise<string> {
  const download = await safeFetch(
    imageUrl,
    { signal: AbortSignal.timeout(30_000) },
    { allowedSchemes: ['https:'] },
  );
  if (!download.ok || !download.body) {
    void download.body?.cancel().catch(() => undefined);
    throw new Error('The ad image could not be downloaded.');
  }
  const contentType = download.headers
    .get('content-type')
    ?.split(';')[0]
    .trim()
    .toLowerCase();
  const maxBytes = 30 * 1024 * 1024;
  if (
    !contentType ||
    !['image/jpeg', 'image/png'].includes(contentType) ||
    Number(download.headers.get('content-length')) > maxBytes
  ) {
    void download.body.cancel().catch(() => undefined);
    throw new Error(
      'Meta ad images must be JPEG or PNG and no larger than 30 MB.',
    );
  }
  const reader = download.body.getReader();
  const chunks: Buffer[] = [];
  let byteCount = 0;
  let complete = false;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) {
        complete = true;
        break;
      }
      byteCount += chunk.value.byteLength;
      if (byteCount > maxBytes)
        throw new Error('Meta ad image exceeds the 30 MB limit.');
      chunks.push(Buffer.from(chunk.value));
    }
  } finally {
    try {
      if (!complete) void reader.cancel().catch(() => undefined);
    } finally {
      reader.releaseLock();
    }
  }
  if (byteCount === 0) throw new Error('Meta ad image is empty.');
  return Buffer.concat(chunks).toString('base64');
}
