import { type CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { BeehiivService } from '@api/services/integrations/beehiiv/services/beehiiv.service';
import { BasePublisherService } from '@api/services/integrations/publishers/base-publisher.service';
import type {
  PublishContext,
  PublishResult,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { WORKFLOW_APPROVED_SCHEDULE_SETTING } from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { readChannelSettingString } from '@api-types/contracts/channel-capabilities.contract';
import { CredentialPlatform } from '@genfeedai/enums';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

@Injectable()
export class BeehiivPublisherService extends BasePublisherService {
  readonly platform = CredentialPlatform.BEEHIIV;
  readonly supportsTextOnly = true;
  readonly supportsImages = true;
  readonly supportsVideos = false;
  readonly supportsCarousel = false;
  readonly supportsThreads = false;

  constructor(
    protected readonly configService: ConfigService,
    protected readonly logger: LoggerService,
    private readonly beehiivService: BeehiivService,
  ) {
    super(configService, logger);
  }

  async publish(context: PublishContext): Promise<PublishResult> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const { post, organizationId, brandId } = context;
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

    try {
      const { apiKey, publicationId } =
        await this.beehiivService.getDecryptedApiKey(
          organizationId,
          brandId,
          String(context.credential.id),
        );

      // Use post label as title, description as HTML content
      const title = post.label ?? 'Untitled';
      const contentHtml = post.description ?? '';

      const configuredStatus = readChannelSettingString(
        context.settings,
        'providerStatus',
      );
      const status =
        context.isDraft || configuredStatus === 'draft' ? 'draft' : 'confirmed';
      const approvedScheduledAt = readChannelSettingString(
        context.settings,
        WORKFLOW_APPROVED_SCHEDULE_SETTING,
      );

      const result = await this.beehiivService.createPost(
        apiKey,
        publicationId,
        {
          contentHtml,
          ...(status === 'confirmed' && approvedScheduledAt
            ? { scheduledAt: new Date(approvedScheduledAt) }
            : {}),
          status,
          title,
        },
      );

      if (!result.id) {
        return this.createFailedResult(
          this.platform,
          'Failed to get external ID from Beehiiv',
        );
      }

      const postUrl =
        result.web_url ||
        result.preview_url ||
        this.buildPostUrl(result.id, context.credential);
      const publishResult = this.createSuccessResult(
        result.id,
        this.platform,
        postUrl,
      );
      return status === 'draft'
        ? { ...publishResult, isProviderDraft: true }
        : publishResult;
    } catch (error: unknown) {
      this.logger.error(`${url} failed to publish`, {
        error: (error as Error)?.message,
        postId: context.postId,
      });
      throw error;
    }
  }

  buildPostUrl(
    _externalId: string,
    _credential: CredentialDocument,
    _externalShortcode?: string,
  ): string {
    // Beehiiv post URLs are returned from the API in web_url field
    // We cannot construct them without knowing the publication subdomain
    return '';
  }
}
