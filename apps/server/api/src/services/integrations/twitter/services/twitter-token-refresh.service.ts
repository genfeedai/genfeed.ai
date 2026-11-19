import type { CredentialDocument } from '@api/collections/credentials/credential.types';
import { CredentialRefreshRejectedException } from '@api/collections/credentials/credential-refresh-rejected.exception';
import {
  SERVER_TOKENS,
  type ServerCredentialStore,
} from '@api/server.dependencies';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import {
  isTwitterRefreshTokenRejectedError,
  readTwitterHttpStatus,
} from '@api/services/integrations/twitter/utils/twitter-api-error.util';
import type { AlertEmailNotificationPayload } from '@api/services/notifications/workflow-notifications/workflow-notification.constants';
import { ActivityKey, ActivitySource } from '@genfeedai/contracts';
import { buildGrantedScopesCredentialPatch } from '@genfeedai/helpers';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { BadGatewayException, Inject } from '@nestjs/common';
import { TwitterApi } from 'twitter-api-v2';

const TWITTER_TOKEN_REFRESH_BUFFER_MS = 15 * 60 * 1000;

/**
 * How long a refresh the provider rejected waits before it re-reads the stored
 * credential. A refresh that lost a race is rejected after the winner already
 * consumed the refresh token, but the winner's database write can still be in
 * flight.
 */
const TWITTER_REFRESH_RACE_GRACE_MS = 750;

export function shouldRefreshTwitterAccessToken(
  expiresAt?: Date | string | null,
): boolean {
  if (!expiresAt) {
    return true;
  }

  const expiresAtMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs)) {
    return true;
  }

  return expiresAtMs <= Date.now() + TWITTER_TOKEN_REFRESH_BUFFER_MS;
}

type FindTwitterCredential = (
  organizationId: string,
  brandId: string,
  credentialId?: string,
) => Promise<CredentialDocument | null>;

/** Refreshes X OAuth 2.0 access tokens and owns the disconnect lifecycle. */
@Traced()
export class TwitterTokenRefreshService {
  private readonly refreshesInFlight = new Map<
    string,
    Promise<CredentialDocument>
  >();

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly activityRecorder: ActivityRecorderService,
    @Inject(SERVER_TOKENS.credentials)
    private readonly credentialsService: ServerCredentialStore,
    private readonly findCredential: FindTwitterCredential,
  ) {}

  public async refreshToken(
    organizationId: string,
    brandId: string,
    credentialId?: string,
  ): Promise<CredentialDocument> {
    const credentials = await this.findCredential(
      organizationId,
      brandId,
      credentialId,
    );

    if (!credentials) {
      throw new Error('Twitter credential not found');
    }

    // Refreshes of one credential in this process share a single provider call:
    // X rotates the refresh token, so a second concurrent call is refused.
    const inFlight = this.refreshesInFlight.get(credentials.id);
    if (inFlight) {
      return inFlight;
    }

    const refresh = this.refreshLoadedCredential(
      credentials,
      organizationId,
      brandId,
    ).finally(() => {
      this.refreshesInFlight.delete(credentials.id);
    });
    this.refreshesInFlight.set(credentials.id, refresh);
    return refresh;
  }

  private async refreshLoadedCredential(
    credentials: CredentialDocument,
    organizationId: string,
    brandId: string,
  ): Promise<CredentialDocument> {
    if (!credentials.refreshToken) {
      // OAuth 1.0a credential — requires reconnection via OAuth 2.0
      const error = new CredentialRefreshRejectedException(
        'Twitter credential requires reconnection. Please reconnect your X account.',
      );
      await this.markRefreshDisconnected(
        credentials,
        organizationId,
        brandId,
        error.message,
      );
      throw error;
    }

    try {
      // OAuth 2.0 refresh flow via SDK
      const decryptedRefreshToken = EncryptionUtil.decrypt(
        credentials.refreshToken,
      );

      const client = new TwitterApi({
        clientId: this.configService.get('TWITTER_CLIENT_ID'),
        clientSecret: this.configService.get('TWITTER_CLIENT_SECRET'),
      } as unknown as ConstructorParameters<typeof TwitterApi>[0]);

      const {
        accessToken,
        refreshToken: newRefreshToken,
        expiresIn,
        scope,
      } = await client.refreshOAuth2Token(decryptedRefreshToken);

      return await this.credentialsService.patch(credentials.id, {
        accessToken,
        accessTokenExpiry: expiresIn
          ? new Date(Date.now() + expiresIn * 1000)
          : undefined,
        isConnected: true,
        isDeleted: false,
        refreshToken: newRefreshToken,
        ...buildGrantedScopesCredentialPatch(scope),
      });
    } catch (error: unknown) {
      // Only a definitive rejection of the grant disconnects the credential.
      // Network errors and 5xx keep it connected so the next run can retry.
      if (isTwitterRefreshTokenRejectedError(error)) {
        // A concurrent refresh may have consumed the refresh token first and
        // stored a fresh one. That credential is healthy, so return it.
        const { refreshed: refreshedByPeer, stored } =
          await this.findCredentialRefreshedByPeer(
            credentials,
            organizationId,
            brandId,
          );
        if (refreshedByPeer) {
          this.loggerService.warn(
            `${TwitterTokenRefreshService.name} refresh rejected after a concurrent refresh stored a new token; reusing it`,
            { credentialId: credentials.id },
          );
          return refreshedByPeer;
        }

        // A refresh in another process may already have disconnected it.
        const rejection = new CredentialRefreshRejectedException(
          'X refused the refresh token. Please reconnect your X account.',
        );
        if (stored?.isConnected !== false) {
          await this.markRefreshDisconnected(
            credentials,
            organizationId,
            brandId,
            'The OAuth refresh token is no longer valid',
          );
        }
        throw rejection;
      }

      if (readTwitterHttpStatus(error) === 400) {
        throw new BadGatewayException(
          'X rejected the token refresh request (HTTP 400)',
        );
      }

      throw error;
    }
  }

  /**
   * The credential another refresh stored while this one was in flight, or null
   * when the stored credential is unchanged and the grant really was rejected.
   * "Refreshed" means the stored refresh token differs from the one this call
   * loaded and the stored access token is still usable.
   */
  private async findCredentialRefreshedByPeer(
    loaded: CredentialDocument,
    organizationId: string,
    brandId: string,
  ): Promise<{
    refreshed: CredentialDocument | null;
    stored: CredentialDocument | null;
  }> {
    let stored: CredentialDocument | null = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (attempt > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, TWITTER_REFRESH_RACE_GRACE_MS),
        );
      }

      stored = await this.findCredential(organizationId, brandId, loaded.id);

      if (
        stored?.accessToken &&
        stored.isConnected !== false &&
        stored.refreshToken &&
        stored.refreshToken !== loaded.refreshToken &&
        !shouldRefreshTwitterAccessToken(stored.accessTokenExpiry)
      ) {
        return { refreshed: stored, stored };
      }
    }

    return { refreshed: null, stored };
  }

  private async markRefreshDisconnected(
    credentials: CredentialDocument,
    organizationId: string,
    brandId: string,
    reason: string,
  ): Promise<void> {
    // The channel is already disconnected and its activity already recorded:
    // every later refresh of it would otherwise add another one.
    if (credentials.isConnected === false) {
      return;
    }

    await this.credentialsService.patch(credentials.id, {
      isConnected: false,
    });

    const handle =
      credentials.externalHandle ?? credentials.externalName ?? 'X account';
    const alertPayload: AlertEmailNotificationPayload = {
      event: 'channel_disconnected',
      kind: 'alert_email',
      label: handle,
      summary: `X refused to renew the connection (${reason}). Posts scheduled on this account will fail until you reconnect it.`,
      version: 1,
    };

    // Create activity for social integration disconnection
    await this.activityRecorder.record({
      alert: { payload: alertPayload },
      brandId: brandId,
      key: ActivityKey.SOCIAL_INTEGRATION_DISCONNECTED,
      organizationId: organizationId,
      source: ActivitySource.SOCIAL_INTEGRATION,
      userId: credentials.userId ?? undefined,
      value: `Twitter integration disconnected: ${reason}`,
    });
  }
}
