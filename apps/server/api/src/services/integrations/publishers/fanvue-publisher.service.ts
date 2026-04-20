import { type CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { ConfigService } from '@api/config/config.service';
import { FanvueService } from '@api/services/integrations/fanvue/services/fanvue.service';
import { BasePublisherService } from '@api/services/integrations/publishers/base-publisher.service';
import type {
  PublishContext,
  PublishResult,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

@Injectable()
export class FanvuePublisherService extends BasePublisherService {
  readonly platform = CredentialPlatform.FANVUE;
  readonly supportsTextOnly = true;
  readonly supportsImages = true;
  readonly supportsVideos = true;
  readonly supportsCarousel = false;
  readonly supportsThreads = false;

  constructor(
    protected readonly configService: ConfigService,
    protected readonly logger: LoggerService,
    private readonly fanvueService: FanvueService,
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
      return this.createFailedResult(this.platform, validation.error);
    }

    try {
      // Refresh token and get a valid access token
      const { accessToken } = await this.fanvueService.refreshToken(
        organizationId,
        brandId,
      );

      // Upload media if present
      const mediaUuids: string[] = [];
      if (mediaInfo.hasIngredients) {
        for (const mediaUrl of mediaInfo.mediaUrls) {
          const mediaType = mediaInfo.isImagePost ? 'image' : 'video';
          const mediaUuid = await this.fanvueService.uploadMedia(
            accessToken,
            mediaUrl,
            mediaType,
          );
          mediaUuids.push(mediaUuid);
        }
      }

      // Sanitize HTML to plain text
      const content = this.sanitizeDescription(post.description);

      // Create the post
      const result = await this.fanvueService.createPost(
        organizationId,
        brandId,
        content,
        mediaUuids.length > 0 ? mediaUuids : undefined,
      );

      if (!result.uuid) {
        return this.createFailedResult(
          this.platform,
          'Failed to get external ID from Fanvue',
        );
      }

      const postUrl = this.buildPostUrl(result.uuid, context.credential);
      return this.createSuccessResult(result.uuid, this.platform, postUrl);
    } catch (error: unknown) {
      this.logger.error(`${url} failed to publish`, {
        error: (error as Error)?.message,
        postId: context.postId,
      });
      throw error;
    }
  }

  buildPostUrl(
    externalId: string,
    _credential: CredentialDocument,
    _externalShortcode?: string,
  ): string {
    return `https://www.fanvue.com/post/${externalId}`;
  }
}
