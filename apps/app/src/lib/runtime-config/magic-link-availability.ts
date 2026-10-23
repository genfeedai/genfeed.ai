import { isCloudDeployment } from '@genfeedai/config';

/**
 * Magic links need an email provider. Cloud always has one; a self-hosted
 * install has one only when `RESEND_API_KEY` is set. Without it the link is
 * stored but never delivered, so the auth screens must not offer it.
 */
export function readMagicLinkAvailableFromEnv(): boolean {
  return isCloudDeployment() || Boolean(process.env.RESEND_API_KEY?.trim());
}
