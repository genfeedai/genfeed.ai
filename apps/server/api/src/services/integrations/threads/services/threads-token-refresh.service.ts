import type { CredentialDocument } from '@api/collections/credentials/credential.types';
import {
  SERVER_TOKENS,
  type ServerCredentialStore,
} from '@api/server.dependencies';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { isThreadsRefreshRejectedError } from '@api/services/integrations/threads/services/threads-refresh-error.util';
import type { AlertEmailNotificationPayload } from '@api/services/notifications/workflow-notifications/workflow-notification.constants';
import {
  ActivityKey,
  ActivitySource,
  CredentialPlatform,
  OAuthGrantType,
} from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { Inject } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

/**
 * Refreshes Threads long-lived tokens (valid 60 days, refreshable once they are
 * a day old) and owns the disconnect lifecycle. Only a rejection of the token
 * itself disconnects the channel; a network error, a 5xx or a rate limit keeps
 * it connected so a later run tries again before the token expires.
 */
@Traced()
export class ThreadsTokenRefreshService {
  constructor(
    private readonly loggerService: LoggerService,
    private readonly activityRecorder: ActivityRecorderService,
    @Inject(SERVER_TOKENS.credentials)
    private readonly credentialsService: ServerCredentialStore,
    private readonly httpService: HttpService,
    private readonly graphUrl: string,
  ) {}

  public async refreshToken(
    organizationId: string,
    brandId: string,
    credentialId?: string,
  ): Promise<unknown> {
    const credential = await this.credentialsService.resolveBrandAccount({
      brandId,
      credentialId,
      // Token repair has to find the row even after a refresh flipped
      // `isConnected` off.
      isDisconnectedIncluded: true,
      organizationId,
      platform: CredentialPlatform.THREADS,
    });

    if (!credential) {
      throw new Error('Threads credential not found');
    }

    if (!credential.accessToken) {
      const error = new Error(
        'Threads access token not found. Please reconnect your account.',
      );
      await this.markRefreshDisconnected(
        credential,
        organizationId,
        brandId,
        error,
      );
      throw error;
    }

    try {
      // Token endpoints are unversioned; resource endpoints use the Threads API version.
      const response = await firstValueFrom(
        this.httpService.get(`${this.graphUrl}/refresh_access_token`, {
          params: {
            access_token: EncryptionUtil.decrypt(credential.accessToken),
            grant_type: OAuthGrantType.TH_REFRESH_TOKEN,
          },
        }),
      );

      const { access_token, expires_in } = response.data || {};

      if (!access_token) {
        throw new Error('Threads refresh response missing access token');
      }

      this.loggerService.log(`${ThreadsTokenRefreshService.name} succeeded`, {
        expiresIn: expires_in,
        hasAccessToken: true,
      });

      return await this.credentialsService.patch(credential.id, {
        accessToken: access_token,
        accessTokenExpiry: expires_in
          ? new Date(Date.now() + expires_in * 1000)
          : undefined,
        isConnected: true,
      });
    } catch (error: unknown) {
      this.loggerService.error(
        `${ThreadsTokenRefreshService.name} failed`,
        error,
      );
      if (isThreadsRefreshRejectedError(error)) {
        await this.markRefreshDisconnected(
          credential,
          organizationId,
          brandId,
          error,
        );
      }
      throw error;
    }
  }

  private async markRefreshDisconnected(
    credential: CredentialDocument,
    organizationId: string,
    brandId: string,
    error: unknown,
  ): Promise<void> {
    // Already disconnected, and its activity already recorded: a later refresh
    // of it would otherwise add another one.
    if (credential.isConnected === false) {
      return;
    }

    await this.credentialsService.patch(credential.id, {
      isConnected: false,
    });

    const reason = (error as Error)?.message ?? 'Token refresh failed';
    const handle =
      credential.externalHandle ?? credential.externalName ?? 'Threads account';
    const alertPayload: AlertEmailNotificationPayload = {
      event: 'channel_disconnected',
      kind: 'alert_email',
      label: handle,
      summary: `Threads refused to renew the connection (${reason}). Posts scheduled on this account will fail until you reconnect it.`,
      version: 1,
    };

    await this.activityRecorder.record({
      alert: { payload: alertPayload },
      brandId,
      key: ActivityKey.SOCIAL_INTEGRATION_DISCONNECTED,
      organizationId,
      source: ActivitySource.SOCIAL_INTEGRATION,
      userId: credential.userId ?? undefined,
      value: `Threads integration disconnected: ${reason}`,
    });
  }
}
