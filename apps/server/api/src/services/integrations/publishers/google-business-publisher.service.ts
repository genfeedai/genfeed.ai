import type { CredentialDocument } from '@api/collections/credentials/credential.types';
import { GOOGLE_BUSINESS_LOCATION_NAME_PATTERN } from '@api/services/integrations/google-business/google-business.constants';
import {
  GoogleBusinessApiError,
  isGoogleBusinessGrantRevokedError,
} from '@api/services/integrations/google-business/google-business-error.util';
import type {
  GoogleBusinessCallToActionType,
  GoogleBusinessLocalPostInput,
} from '@api/services/integrations/google-business/interfaces/google-business.interface';
import { GoogleBusinessService } from '@api/services/integrations/google-business/services/google-business.service';
import { BasePublisherService } from '@api/services/integrations/publishers/base-publisher.service';
import type {
  MediaInfo,
  PostValidationResult,
  PublishContext,
  PublishResult,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { CredentialPlatform, PostCategory } from '@genfeedai/contracts';
import { readChannelSettingString } from '@genfeedai/contracts/api-types/contracts/channel-capabilities.contract';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

/** Where a local post has no public page of its own yet. */
const GOOGLE_BUSINESS_MANAGER_URL = 'https://business.google.com/';
/** How many listing pages verification reads before it gives up. */
const MAX_VERIFICATION_PAGES = 5;

const CALL_TO_ACTION_TYPES: ReadonlySet<string> =
  new Set<GoogleBusinessCallToActionType>([
    'BOOK',
    'ORDER',
    'SHOP',
    'LEARN_MORE',
    'SIGN_UP',
    'CALL',
  ]);

/**
 * Standard updates on a Google Business Profile location: text, at most one
 * photo, and an optional call-to-action button. Event and offer posts are not
 * covered.
 */
@Traced()
@Injectable()
export class GoogleBusinessPublisherService extends BasePublisherService {
  readonly platform = CredentialPlatform.GOOGLE_BUSINESS;
  readonly supportsTextOnly = true;
  readonly supportsImages = true;
  readonly supportsVideos = false;
  readonly supportsCarousel = false;
  readonly supportsThreads = false;

  constructor(
    protected readonly configService: ConfigService,
    protected readonly logger: LoggerService,
    private readonly googleBusinessService: GoogleBusinessService,
  ) {
    super(configService, logger);
  }

  override validatePost(
    context: PublishContext,
    mediaInfo: MediaInfo,
  ): PostValidationResult {
    // A video fails here with its own message, not the generic one.
    if (
      mediaInfo.hasIngredients &&
      (!mediaInfo.isImagePost ||
        context.post.category === PostCategory.VIDEO ||
        context.post.category === PostCategory.REEL)
    ) {
      return {
        error:
          'Google Business Profile updates take a photo; video is not supported.',
        errorCode: 'google_business_media_unsupported',
        valid: false,
      };
    }
    if (mediaInfo.ingredientIds.length > 1) {
      return {
        error: 'Google Business Profile updates take one photo.',
        errorCode: 'google_business_media_unsupported',
        valid: false,
      };
    }

    const base = super.validatePost(context, mediaInfo);
    if (!base.valid) {
      return base;
    }

    if (!this.sanitizeDescription(context.post.description).trim()) {
      return {
        error: 'Google Business Profile updates need text.',
        errorCode: 'google_business_text_required',
        valid: false,
      };
    }

    return this.validateCallToAction(context);
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

    const locationName = this.readLocationName(credential);
    if (!locationName) {
      return this.createFailedResult(
        this.platform,
        'Google Business location not found. Reconnect the location.',
        'google_business_location_missing',
      );
    }

    const input = this.buildLocalPost(context, mediaInfo);

    try {
      const created = await this.googleBusinessService.createLocalPost(
        credential,
        locationName,
        input,
      );

      if (created.state === 'REJECTED') {
        return this.createFailedResult(
          this.platform,
          'Google rejected this update for breaking its content policy.',
          'google_business_post_rejected',
        );
      }

      return this.createSuccessResult(
        created.name,
        this.platform,
        created.searchUrl ?? GOOGLE_BUSINESS_MANAGER_URL,
        created.searchUrl,
      );
    } catch (error: unknown) {
      this.logger.error(`${url} failed to publish`, {
        error: (error as Error)?.message,
        postId: context.postId,
      });

      if (isGoogleBusinessGrantRevokedError(error)) {
        return this.createFailedResult(
          this.platform,
          'Google no longer allows Genfeed to post to this location. Reconnect it.',
          'google_business_disconnected',
        );
      }
      if (error instanceof GoogleBusinessApiError) {
        if (error.isTokenRejected) {
          // Refused again right after a refresh: the grant is gone.
          await this.googleBusinessService.markDisconnected(credential, error);
          return this.createFailedResult(
            this.platform,
            'Google no longer allows Genfeed to post to this location. Reconnect it.',
            'google_business_disconnected',
          );
        }
        if (error.isRequestRejected) {
          return this.createFailedResult(
            this.platform,
            error.message,
            'google_business_content_rejected',
          );
        }
        if (error.status === 403) {
          return this.createFailedResult(
            this.platform,
            error.message,
            'google_business_permission_denied',
          );
        }
      }
      // Rate limits, 5xx and network errors: the pipeline decides on a retry.
      throw error;
    }
  }

  /**
   * Whether an earlier, unconfirmed attempt landed. Answers `null` only when no
   * post at all appeared on the location since the attempt began, so a post
   * whose text Google changed is never mistaken for an absent one.
   */
  async verifyPublished(
    context: PublishContext,
    attemptStartedAt: Date,
  ): Promise<PublishResult | null> {
    if (
      context.post.ingredients.length > 0 ||
      context.hasThreadChildren !== false
    ) {
      throw new Error(
        'Google Business verification lacks exact text/media proof',
      );
    }
    const locationName = this.readLocationName(context.credential);
    if (!locationName) {
      throw new Error('Google Business verification location unavailable');
    }

    const text = this.sanitizeDescription(context.post.description).trim();
    // Provider timestamps can be second-precise; stay on the safe side.
    const lowerBound = Math.floor(attemptStartedAt.getTime() / 1000) * 1000;
    let pageToken: string | undefined;

    for (let page = 0; page < MAX_VERIFICATION_PAGES; page++) {
      const result = await this.googleBusinessService.listLocalPosts(
        context.credential,
        locationName,
        pageToken,
      );
      for (const candidate of result.posts) {
        const createdAt = candidate.createTime
          ? new Date(candidate.createTime).getTime()
          : Number.NaN;
        if (!Number.isFinite(createdAt)) {
          throw new Error('Google Business verification has no post time');
        }
        if (createdAt < lowerBound) {
          continue;
        }
        if ((candidate.summary ?? '').trim() === text) {
          return this.createSuccessResult(
            candidate.name,
            this.platform,
            candidate.searchUrl ?? GOOGLE_BUSINESS_MANAGER_URL,
            candidate.searchUrl,
          );
        }
        throw new Error(
          'Google Business verification found a different post since the attempt',
        );
      }
      if (!result.nextPageToken) {
        return null;
      }
      pageToken = result.nextPageToken;
    }

    throw new Error('Google Business verification listing was not exhausted');
  }

  buildPostUrl(
    _externalId: string,
    _credential: CredentialDocument,
    externalShortcode?: string,
  ): string {
    // A local post has no URL derivable from its name; Google returns its
    // search URL when the post is created.
    return externalShortcode ?? GOOGLE_BUSINESS_MANAGER_URL;
  }

  private readLocationName(credential: CredentialDocument): string | null {
    const name = credential.externalId;
    return name && GOOGLE_BUSINESS_LOCATION_NAME_PATTERN.test(name)
      ? name
      : null;
  }

  private buildLocalPost(
    context: PublishContext,
    mediaInfo: MediaInfo,
  ): GoogleBusinessLocalPostInput {
    const input: GoogleBusinessLocalPostInput = {
      summary: this.sanitizeDescription(context.post.description).trim(),
      topicType: 'STANDARD',
    };

    const [photoUrl] = mediaInfo.mediaUrls;
    if (photoUrl) {
      input.media = [{ mediaFormat: 'PHOTO', sourceUrl: photoUrl }];
    }

    const actionType = readChannelSettingString(
      context.settings,
      'callToActionType',
    );
    if (actionType && CALL_TO_ACTION_TYPES.has(actionType)) {
      const ctaUrl = readChannelSettingString(
        context.settings,
        'callToActionUrl',
      );
      input.callToAction = {
        actionType: actionType as GoogleBusinessCallToActionType,
        // A Call button dials the location's own number and takes no URL.
        ...(actionType !== 'CALL' && ctaUrl ? { url: ctaUrl } : {}),
      };
    }

    return input;
  }

  private validateCallToAction(context: PublishContext): PostValidationResult {
    const actionType = readChannelSettingString(
      context.settings,
      'callToActionType',
    );
    const ctaUrl = readChannelSettingString(
      context.settings,
      'callToActionUrl',
    );

    if (!actionType) {
      return ctaUrl
        ? {
            error: 'Choose a button type for the call-to-action link.',
            errorCode: 'google_business_cta_invalid',
            valid: false,
          }
        : { valid: true };
    }
    if (!CALL_TO_ACTION_TYPES.has(actionType)) {
      return {
        error: `Google Business Profile does not offer a "${actionType}" button.`,
        errorCode: 'google_business_cta_invalid',
        valid: false,
      };
    }
    if (actionType !== 'CALL' && !ctaUrl) {
      return {
        error: 'The call-to-action button needs a link.',
        errorCode: 'google_business_cta_invalid',
        valid: false,
      };
    }
    return { valid: true };
  }
}
