import { CredentialPlatform } from '@genfeedai/contracts';
import { getPlatformMediaSpec } from '@genfeedai/contracts/constants';
import {
  downloadBounded,
  publisherMediaDestination,
} from '@libs/security/bounded-download';

/** Internal publisher provenance; never derive it from workflow or DTO fields. */
export type LinkedInMediaSource = 'external' | 'publisher';

export async function downloadLinkedInMedia(
  url: string,
  kind: 'image' | 'video',
  configuredMediaUrl?: string,
  source: LinkedInMediaSource = 'external',
): Promise<Buffer> {
  const maxBytes = getPlatformMediaSpec(
    CredentialPlatform.LINKEDIN,
    kind,
  )?.maxFileSizeBytes;
  if (!maxBytes) throw new Error('LinkedIn media size limit is unavailable');

  const { data } = await downloadBounded(url, {
    createError: (reason) =>
      new Error(
        reason === 'failed'
          ? 'LinkedIn media download failed'
          : 'LinkedIn media exceeds its size limit',
      ),
    deadlineMs: 120_000,
    destination: publisherMediaDestination(
      url,
      configuredMediaUrl,
      source === 'publisher',
    ),
    maxBytes,
    timeoutError: new Error('LinkedIn media download timed out'),
  });
  return data;
}
