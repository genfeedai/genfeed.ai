import type { CredentialDocument } from '@api/collections/credentials/credential.types';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { BasePublisherService } from '@api/services/integrations/publishers/base-publisher.service';
import type {
  PublishContext,
  PublishResult,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { verifyProviderPublish } from '@api/services/integrations/publishers/publisher-verification.util';
import {
  SlackApiError,
  SlackService,
} from '@api/services/integrations/slack/services/slack.service';
import { CredentialPlatform } from '@genfeedai/contracts';
import { readChannelSettingString } from '@genfeedai/contracts/api-types/contracts/channel-capabilities.contract';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { Injectable } from '@nestjs/common';

/** Slack mrkdwn only needs these three characters written as entities. */
function escapeSlackText(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

@Traced()
@Injectable()
export class SlackPublisherService extends BasePublisherService {
  readonly platform = CredentialPlatform.SLACK;
  readonly supportsTextOnly = true;
  readonly supportsImages = true;
  // Video files need Slack's three-step upload, which does not give back a
  // message to link; the catalog and this flag keep video posts out.
  readonly supportsVideos = false;
  readonly supportsCarousel = true;
  readonly supportsThreads = false;

  constructor(
    protected readonly configService: ConfigService,
    protected readonly logger: LoggerService,
    private readonly slackService: SlackService,
    private readonly credentialsService: CredentialsService,
  ) {
    super(configService, logger);
  }

  /**
   * Whether an earlier attempt that never got an answer posted its message:
   * look the channel's history up since the attempt began. Only a text post
   * is provable this way; the shared check refuses anything else.
   */
  async verifyPublished(
    context: PublishContext,
    attemptStartedAt: Date,
  ): Promise<PublishResult | null> {
    const channelId = readChannelSettingString(context.settings, 'channelId');
    if (!channelId || !context.credential.accessToken) {
      throw new Error('Slack verification channel or token unavailable');
    }
    const botToken = EncryptionUtil.decrypt(context.credential.accessToken);
    const text = escapeSlackText(
      this.sanitizeDescription(context.post.description),
    );
    const found = await verifyProviderPublish(
      context,
      attemptStartedAt,
      (cursor) =>
        this.slackService.listPublishVerificationPage(
          botToken,
          channelId,
          attemptStartedAt,
          cursor,
        ),
      { text },
    );
    if (!found) {
      return null;
    }
    const permalink = await this.slackService.getPermalink(
      botToken,
      channelId,
      found.id,
    );
    return this.createSuccessResult(found.id, this.platform, permalink ?? '');
  }

  async publish(context: PublishContext): Promise<PublishResult> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const { credential, post } = context;
    const mediaInfo = this.extractMediaInfo(post);

    this.logPublishAttempt(context, mediaInfo);

    const validation = this.validatePost(context, mediaInfo);
    if (!validation.valid) {
      return this.createFailedResult(
        this.platform,
        validation.error,
        validation.errorCode,
      );
    }

    const channelId = readChannelSettingString(context.settings, 'channelId');
    if (!channelId) {
      return this.createFailedResult(
        this.platform,
        'Slack requires the channel to post to',
        'channel_required',
      );
    }

    if (!credential?.accessToken) {
      return this.createFailedResult(
        this.platform,
        'Slack workspace token not found',
        'credential_missing',
      );
    }

    const botToken = EncryptionUtil.decrypt(credential.accessToken);
    try {
      const message = await this.slackService.postMessage(botToken, {
        channelId,
        imageUrls: mediaInfo.mediaUrls,
        text: escapeSlackText(this.sanitizeDescription(post.description)),
      });
      const permalink = await this.slackService.getPermalink(
        botToken,
        message.channelId,
        message.ts,
      );
      return this.createSuccessResult(
        message.ts,
        this.platform,
        permalink ?? '',
      );
    } catch (error: unknown) {
      this.logger.error(`${url} failed to publish`, {
        error: (error as Error)?.message,
        postId: context.postId,
      });
      // A revoked token disconnects the workspace. A channel the app cannot
      // post to fails this post only; other channels still work.
      if (error instanceof SlackApiError && error.kind === 'token_revoked') {
        await this.credentialsService.patch(credential.id, {
          isConnected: false,
        });
      }
      throw error;
    }
  }

  /** The permalink comes from Slack at publish time; a ts alone is not one. */
  buildPostUrl(
    _externalId: string,
    _credential: CredentialDocument,
    _externalShortcode?: string,
  ): string {
    return '';
  }
}
