import type { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { isTikTokAdsAuthorizationError } from '@api/services/integrations/tiktok-ads/utils/tiktok-ads-authorization.error';
import { traced } from '@libs/tracing/traced';

/**
 * TikTok rejected or revoked this account's token. Disconnecting the
 * credential is the established reconnect lifecycle: the brand shows the
 * account as needing a new authorization and discovery stops asking with a
 * token the provider already refused. Best effort, so a failed write never
 * blanks the research feed; the next sweep meets the same rejection and
 * retries.
 */
export const reconnectOnAuthorizationFailure = traced(
  'reconnectOnAuthorizationFailure',
  async (
    credentialsService: Pick<CredentialsService, 'patch'>,
    credentialId: string,
    error: unknown,
  ): Promise<void> => {
    if (!isTikTokAdsAuthorizationError(error)) {
      return;
    }
    try {
      await credentialsService.patch(credentialId, { isConnected: false });
    } catch {
      // See above: retried by the next discovery sweep.
    }
  },
);
