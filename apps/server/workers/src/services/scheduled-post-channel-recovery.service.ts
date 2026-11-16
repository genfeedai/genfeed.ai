import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import {
  type CredentialDocument,
  SERVER_TOKENS,
  type ServerCredentialStore,
} from '@api/index';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import type { AlertEmailNotificationPayload } from '@api/services/notifications/workflow-notifications/workflow-notification.constants';
import {
  ActivityKey,
  ActivitySource,
  PublishErrorKind,
} from '@genfeedai/contracts';
import {
  PublishError,
  readPublishErrorKind,
} from '@genfeedai/contracts/interfaces';
import { isRecord } from '@genfeedai/utils/data/extract.util';
import { LoggerService } from '@libs/logger/logger.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { Inject, Injectable } from '@nestjs/common';
import { CronCredentialsService } from '@workers/crons/credentials/cron.credentials.service';
import { getPublishErrorMessage } from '@workers/crons/posts/post-publish-error.util';
import { PUBLISH_TOKEN_REFRESHED_CODE } from '@workers/services/scheduled-post.constants';
import { readPostString } from '@workers/services/scheduled-post.utils';
import type { RetryPlan } from '@workers/services/scheduled-post-retry-state.util';

/** What the failure becomes once the channel was looked after. */
export interface ChannelRecovery {
  /** The failure to classify: replaced when a refresh did not save the post. */
  cause: unknown;
  /** Set when the post should run again at once on a fresh token. */
  plan: RetryPlan | null;
}

function wasTokenRefreshed(post: PostEntity): boolean {
  const { targetError } = post as unknown as { targetError?: unknown };
  return (
    isRecord(targetError) && targetError.code === PUBLISH_TOKEN_REFRESHED_CODE
  );
}

/**
 * What the worker does when a provider says the channel's token or grant is
 * the problem. An expired token is refreshed once and the post publishes again
 * without using up an attempt. A revoked grant, or a token the provider still
 * refuses after a refresh, disconnects the channel and tells the owner.
 */
@Injectable()
export class ScheduledPostChannelRecoveryService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly logger: LoggerService,
    @Inject(SERVER_TOKENS.credentials)
    private readonly credentialsService: ServerCredentialStore,
    private readonly credentialRefresher: CronCredentialsService,
    private readonly activityRecorder: ActivityRecorderService,
  ) {}

  /**
   * Never throws: a failure here must not stop the publish failure from being
   * recorded, so it leaves the failure as the provider reported it.
   */
  async recover(post: PostEntity, cause: unknown): Promise<ChannelRecovery> {
    const kind = readPublishErrorKind(cause);
    if (
      kind !== PublishErrorKind.TOKEN_MUST_REFRESH &&
      kind !== PublishErrorKind.CHANNEL_DISCONNECTED
    ) {
      return { cause, plan: null };
    }
    try {
      const credential = await this.loadCredential(post);
      if (
        kind === PublishErrorKind.TOKEN_MUST_REFRESH &&
        credential &&
        !wasTokenRefreshed(post) &&
        (await this.credentialRefresher.refreshCredential(credential, this.url))
          .success
      ) {
        return { cause, plan: { kind: 'refreshed' } };
      }
      return await this.disconnect(post, credential, cause);
    } catch (error: unknown) {
      this.logger.error(`${this.url} channel recovery failed`, {
        error: getErrorMessage(error, {
          fallback: () => undefined,
          messageSource: 'error-instance',
        }),
        postId: post.id.toString(),
      });
      return { cause, plan: null };
    }
  }

  private get url(): string {
    return `${this.constructorName} recover`;
  }

  private async loadCredential(
    post: PostEntity,
  ): Promise<CredentialDocument | null> {
    const credentialId = readPostString(post, ['credentialId']);
    if (!credentialId) return null;
    const organizationId = readPostString(post, ['organizationId']);
    return (await this.credentialsService.findOne({
      id: credentialId,
      isDeleted: false,
      ...(organizationId ? { organizationId } : {}),
    })) as CredentialDocument | null;
  }

  /** Marks the channel disconnected and tells the owner, once per channel. */
  private async disconnect(
    post: PostEntity,
    credential: CredentialDocument | null,
    cause: unknown,
  ): Promise<ChannelRecovery> {
    const reason = getPublishErrorMessage(cause);
    if (credential && credential.isConnected !== false) {
      await this.credentialsService.patch(credential.id, {
        isConnected: false,
      });
      const alert: AlertEmailNotificationPayload = {
        event: 'channel_disconnected',
        kind: 'alert_email',
        label:
          credential.externalHandle ??
          credential.externalName ??
          String(credential.platform ?? 'channel'),
        summary: `The provider refused the connection (${reason}). Posts scheduled on this channel will fail until you reconnect it.`,
        version: 1,
      };
      await this.activityRecorder.record({
        alert: { payload: alert },
        brandId: readPostString(post, ['brandId']) ?? null,
        key: ActivityKey.SOCIAL_INTEGRATION_DISCONNECTED,
        organizationId: credential.organizationId ?? null,
        source: ActivitySource.SOCIAL_INTEGRATION,
        userId: credential.userId ?? null,
        value: `Channel disconnected: ${reason}`,
      });
    }
    return {
      cause: new PublishError(PublishErrorKind.CHANNEL_DISCONNECTED, reason),
      plan: null,
    };
  }
}
