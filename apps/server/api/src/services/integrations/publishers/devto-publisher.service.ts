import { type CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { DevtoService } from '@api/services/integrations/devto/services/devto.service';
import { BasePublisherService } from '@api/services/integrations/publishers/base-publisher.service';
import {
  htmlToDevtoMarkdown,
  readDevtoTags,
} from '@api/services/integrations/publishers/devto-html-to-markdown.util';
import type {
  PublishContext,
  PublishResult,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { CredentialPlatform } from '@genfeedai/contracts';
import { readChannelSettingString } from '@genfeedai/contracts/api-types/contracts/channel-capabilities.contract';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { Injectable } from '@nestjs/common';

@Injectable()
export class DevtoPublisherService extends BasePublisherService {
  readonly platform = CredentialPlatform.DEV_TO;
  readonly supportsTextOnly = true;
  // Dev.to articles carry images inline in the Markdown body. The create
  // endpoint has no separate media upload, so attached media is not uploaded.
  readonly supportsImages = false;
  readonly supportsVideos = false;
  readonly supportsCarousel = false;
  readonly supportsThreads = false;

  constructor(
    protected readonly configService: ConfigService,
    protected readonly logger: LoggerService,
    private readonly devtoService: DevtoService,
  ) {
    super(configService, logger);
  }

  /**
   * Publish a post to Dev.to. `post.description` is stored HTML and is
   * converted to Markdown for `body_markdown`. `post.label` is the title.
   * A scheduler draft (`context.isDraft`) is created with `published: false`.
   * The credential on the context is the account the release was scheduled
   * for; it is not re-resolved from the brand.
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
      if (!credential?.accessToken) {
        this.logger.error(`${url} Dev.to credential not found`, {
          postId: context.postId,
        });
        return this.createFailedResult(
          this.platform,
          'Dev.to credential not found',
        );
      }

      const bodyMarkdown = htmlToDevtoMarkdown(post.description || '');
      if (!bodyMarkdown) {
        return this.createFailedResult(
          this.platform,
          'Article must have content before it can be delivered to Dev.to',
        );
      }

      const published = context.isDraft !== true;
      const article = await this.devtoService.createArticle(
        EncryptionUtil.decrypt(credential.accessToken),
        {
          bodyMarkdown,
          published,
          tags: readDevtoTags(
            readChannelSettingString(context.settings, 'tags'),
          ),
          title: post.label ?? 'Untitled',
        },
      );

      if (article?.id === undefined || article?.id === null) {
        return this.createFailedResult(
          this.platform,
          'Failed to get external ID from Dev.to',
        );
      }

      const externalId = String(article.id);
      const result = this.createSuccessResult(
        externalId,
        this.platform,
        article.url || this.buildPostUrl(externalId, credential),
      );
      return published ? result : { ...result, isProviderDraft: true };
    } catch (error: unknown) {
      this.logger.error(`${url} failed to publish`, {
        error: (error as Error)?.message,
        postId: context.postId,
      });
      throw error;
    }
  }

  /**
   * Dev.to returns the article URL on create. This fallback uses the
   * connected username when the API omits one.
   */
  buildPostUrl(
    externalId: string,
    credential: CredentialDocument,
    _externalShortcode?: string,
  ): string {
    const handle = credential.externalHandle?.replace(/^@/, '').trim();
    if (handle) {
      return `https://dev.to/${handle}/${externalId}`;
    }
    return `https://dev.to/${externalId}`;
  }
}
