import type { ConfigService } from '@files/config/config.service';
import { isSelfHostedDeployment } from '@genfeedai/config';
import { safeFetch } from '@libs/security/destination-guard';

export async function downloadPublicMedia(
  url: string,
  limitBytes: number,
  config?: Pick<ConfigService, 'get'>,
): Promise<Buffer> {
  const cdnUrl = config?.get('GENFEEDAI_CDN_URL');
  const filesUrl = config?.get('GENFEEDAI_MICROSERVICES_FILES_URL');
  const configuredOrigins = [
    cdnUrl,
    isSelfHostedDeployment() ? filesUrl : undefined,
  ]
    .filter(
      (value): value is string => typeof value === 'string' && value.length > 0,
    )
    .map((value) => new URL(value).origin);
  const resolvedUrl =
    url.startsWith('/local/') && (filesUrl || cdnUrl)
      ? new URL(url, filesUrl || cdnUrl).href
      : url;
  const origin = new URL(resolvedUrl).origin;
  if (
    !isSelfHostedDeployment() &&
    filesUrl &&
    origin === new URL(filesUrl).origin
  )
    throw new Error(
      'Cloud media cannot download from the files service origin',
    );
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
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error('Media download failed');
  }
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  let complete = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        complete = true;
        break;
      }
      size += value.byteLength;
      if (size > limitBytes)
        throw new Error('Media download exceeds size limit');
      chunks.push(Buffer.from(value));
    }
  } finally {
    try {
      if (!complete) await reader.cancel().catch(() => undefined);
    } finally {
      reader.releaseLock();
    }
  }
  return Buffer.concat(chunks);
}
