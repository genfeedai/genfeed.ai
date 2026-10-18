import { CredentialPlatform } from '@genfeedai/contracts';
import { getPlatformMediaSpec } from '@genfeedai/contracts/constants';
import {
  downloadBounded,
  publisherMediaDestination,
} from '@libs/security/bounded-download';

/** Internal publisher provenance; never derive it from workflow or DTO fields. */
export type TwitterMediaSource = 'external' | 'publisher';

export async function downloadTwitterMedia(
  url: string,
  mediaType: 'image/jpeg' | 'video/mp4',
  configuredMediaUrl?: string,
  source: TwitterMediaSource = 'external',
): Promise<Buffer> {
  const maxBytes = getPlatformMediaSpec(
    CredentialPlatform.TWITTER,
    mediaType === 'image/jpeg' ? 'image' : 'video',
  )?.maxFileSizeBytes;
  if (!maxBytes) throw new Error('Twitter media size limit is unavailable');

  const { data } = await downloadBounded(url, {
    createError: (reason) =>
      new Error(
        reason === 'failed'
          ? 'Twitter media download failed'
          : 'Twitter media exceeds its size limit',
      ),
    deadlineMs: 120_000,
    destination: publisherMediaDestination(
      url,
      configuredMediaUrl,
      source === 'publisher',
    ),
    maxBytes,
    timeoutError: new Error('Twitter media download timed out'),
  });
  return data;
}
