import { type CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { DevtoService } from '@api/services/integrations/devto/services/devto.service';
import { toArticlePublishError } from '@api/services/integrations/publishers/article-publish-error.util';
import { BasePublisherService } from '@api/services/integrations/publishers/base-publisher.service';
import {
  htmlToDevtoMarkdown,
  readDevtoCanonicalUrl,
  readDevtoTags,
} from '@api/services/integrations/publishers/devto-html-to-markdown.util';
import type {
  PublishContext,
  PublishResult,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { verifyTitlePublish } from '@api/services/integrations/publishers/publisher-title-verification.util';
import { CredentialPlatform, PublishErrorKind } from '@genfeedai/contracts';
import {
  readChannelSettingBoolean,
  readChannelSettingString,
} from '@genfeedai/contracts/api-types/contracts/channel-capabilities.contract';
import {
  DEVTO_CANONICAL_URL_SETTING_KEY,
  DEVTO_SAVE_AS_DRAFT_SETTING_KEY,
  DEVTO_SERIES_SETTING_KEY,
  DEVTO_TAGS_SETTING_KEY,
} from '@genfeedai/contracts/api-types/contracts/devto-publishing.contract';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { Injectable } from '@nestjs/common';

const LEADING_AT_SIGN_PATTERN = /^@/;

@Traced()
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
   * Whether an earlier, unconfirmed publish landed on the account.
   *
   * Dev.to lists an account's articles without their body, so the proof is the
   * exact title among articles created since the attempt began, in the
   * published list (or the drafts list for a scheduler draft). A post without
   * a label is titled `Untitled` and stays unknown: that title proves nothing.
   */
  async verifyPublished(
    context: PublishContext,
    attemptStartedAt: Date,
  ): Promise<PublishResult | null> {
    const { credential, post } = context;
    if (!credential?.accessToken || !post.label?.trim()) {
      throw new Error('Provider verification lacks an exact title to match');
    }
    const apiKey = EncryptionUtil.decrypt(credential.accessToken);
    const isDraft = this.isDraftDelivery(context);
    const found = await verifyTitlePublish(
      attemptStartedAt,
      (cursor) =>
        this.devtoService.listPublishVerificationPage(
          apiKey,
          isDraft,
          attemptStartedAt,
          cursor,
        ),
      post.label,
    );
    if (!found) return null;
    const result = this.createSuccessResult(
      found.id,
      this.platform,
      found.url || this.buildPostUrl(found.id, credential),
    );
    return isDraft ? { ...result, isProviderDraft: true } : result;
  }

  /** A scheduler draft or a target that asks for a private Dev.to draft. */
  private isDraftDelivery(context: PublishContext): boolean {
    return (
      context.isDraft === true ||
      readChannelSettingBoolean(
        context.settings,
        DEVTO_SAVE_AS_DRAFT_SETTING_KEY,
      ) === true
    );
  }

  /**
   * Publish a post to Dev.to. `post.description` is stored HTML and is
   * converted to Markdown for `body_markdown`. `post.label` is the title.
   * A scheduler draft (`context.isDraft`) or a target with the `saveAsDraft`
   * setting is created with `published: false`.
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
          undefined,
          PublishErrorKind.CHANNEL_DISCONNECTED,
        );
      }

      const bodyMarkdown = htmlToDevtoMarkdown(post.description || '');
      if (!bodyMarkdown) {
        return this.createFailedResult(
          this.platform,
          'Article must have content before it can be delivered to Dev.to',
          undefined,
          PublishErrorKind.CONTENT_REJECTED,
        );
      }

      const canonical = readDevtoCanonicalUrl(
        readChannelSettingString(
          context.settings,
          DEVTO_CANONICAL_URL_SETTING_KEY,
        ),
      );
      if ('error' in canonical) {
        return this.createFailedResult(
          this.platform,
          canonical.error,
          undefined,
          PublishErrorKind.CONTENT_REJECTED,
        );
      }

      const published = !this.isDraftDelivery(context);
      const article = await this.devtoService.createArticle(
        EncryptionUtil.decrypt(credential.accessToken),
        {
          bodyMarkdown,
          canonicalUrl: canonical.url,
          published,
          series: readChannelSettingString(
            context.settings,
            DEVTO_SERIES_SETTING_KEY,
          )?.trim(),
          tags: readDevtoTags(
            readChannelSettingString(context.settings, DEVTO_TAGS_SETTING_KEY),
          ),
          title: post.label ?? 'Untitled',
        },
      );

      if (article?.id === undefined || article?.id === null) {
        return this.createFailedResult(
          this.platform,
          'Failed to get external ID from Dev.to',
          undefined,
          PublishErrorKind.OUTCOME_UNKNOWN,
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
      throw toArticlePublishError(error);
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
    const handle = credential.externalHandle
      ?.replace(LEADING_AT_SIGN_PATTERN, '')
      .trim();
    if (handle) {
      return `https://dev.to/${handle}/${externalId}`;
    }
    return `https://dev.to/${externalId}`;
  }
}
