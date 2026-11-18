import { Platform } from '@genfeedai/contracts';

/** How a new post leaves the modal; the lifecycle follows from it, never from a field. */
export type PostSubmitIntent = 'draft' | 'publish' | 'schedule';

/** X accepts up to 280 characters per post; longer text publishes as long-form. */
export const X_STANDARD_POST_LIMIT = 280;

export function isXPlatform(platform: string | undefined | null): boolean {
  return platform === Platform.TWITTER;
}
