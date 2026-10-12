import { type CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { MediumService } from '@api/services/integrations/medium/services/medium.service';
import { BasePublisherService } from '@api/services/integrations/publishers/base-publisher.service';
import type {
  PublishContext,
  PublishResult,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { CredentialPlatform } from '@genfeedai/contracts';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { Injectable } from '@nestjs/common';

@Injectable()
export class MediumPublisherService extends BasePublisherService {
  readonly platform = CredentialPlatform.MEDIUM;
  readonly supportsTextOnly = true;
  // Medium stories carry images inline in the HTML body; the API has no
  // separate featured-image field, so attached media is not uploaded.
  readonly supportsImages = false;
  readonly supportsVideos = false;
  readonly supportsCarousel = false;
  readonly supportsThreads = false;

  constructor(
    protected readonly configService: ConfigService,
    protected readonly logger: LoggerService,
    private readonly mediumService: MediumService,
  ) {
    super(configService, logger);
  }

  /**
   * Publish a post to Medium as a story.
   * Uses post.description as HTML content and post.label as title.
   */
  async publish(context: PublishContext): Promise<PublishResult> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const { post, credential } = context;
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
      // The account this post was scheduled for, already resolved by the
      // publish pipeline. The Medium user id is the credential's externalId
      // (see MediumController.verify).
      if (!credential?.accessToken || !credential?.externalId) {
        this.logger.error(`${url} Medium credential or user ID not found`, {
          postId: context.postId,
        });
        return this.createFailedResult(
          this.platform,
          'Medium credential or user ID not found',
        );
      }

      const story = await this.mediumService.createPost(
        EncryptionUtil.decrypt(credential.accessToken),
        credential.externalId,
        {
          contentHtml: post.description || '<p></p>',
          publishStatus: context.isDraft ? 'draft' : 'public',
          title: post.label ?? 'Untitled',
        },
      );

      if (!story?.id) {
        return this.createFailedResult(
          this.platform,
          'Failed to get external ID from Medium',
        );
      }

      const result = this.createSuccessResult(
        story.id,
        this.platform,
        story.url || this.buildPostUrl(story.id, credential),
      );
      return context.isDraft === true
        ? { ...result, isProviderDraft: true }
        : result;
    } catch (error: unknown) {
      this.logger.error(`${url} failed to publish`, {
        error: (error as Error)?.message,
        postId: context.postId,
      });
      throw error;
    }
  }

  /**
   * Medium returns the story URL on create; this fallback resolves through
   * Medium's short-link route by story id.
   */
  buildPostUrl(
    externalId: string,
    _credential: CredentialDocument,
    _externalShortcode?: string,
  ): string {
    return `https://medium.com/p/${externalId}`;
  }
}
