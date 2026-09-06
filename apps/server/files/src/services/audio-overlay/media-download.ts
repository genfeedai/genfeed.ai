import type { ConfigService } from '@files/config/config.service';
import { safeFetch } from '@libs/security/destination-guard';

export async function downloadPublicMedia(
  url: string,
  limitBytes: number,
  config?: Pick<ConfigService, 'get'>,
): Promise<Buffer> {
  const cdnUrl = config?.get('GENFEEDAI_CDN_URL');
  const filesUrl = config?.get('GENFEEDAI_MICROSERVICES_FILES_URL');
  const configuredOrigins = [cdnUrl, filesUrl]
    .filter(
      (value): value is string => typeof value === 'string' && value.length > 0,
    )
    .map((value) => new URL(value).origin);
  const resolvedUrl =
    url.startsWith('/local/') && (filesUrl || cdnUrl)
      ? new URL(url, filesUrl || cdnUrl).href
      : url;
  const origin = new URL(resolvedUrl).origin;
  const isConfiguredStorage = configuredOrigins.includes(origin);
  const response = await safeFetch(
    resolvedUrl,
    {
      signal: AbortSignal.timeout(120_000),
    },
    isConfiguredStorage
      ? { allowedOrigins: [origin], allowPrivateNetwork: true }
      : {},
  );
  if (!response.ok || !response.body) throw new Error('Media download failed');
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limitBytes)
        throw new Error('Media download exceeds size limit');
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks);
}
