import { ApifySocialProvider } from '@api/services/source-collector/providers/apify-social.provider';
import {
  TwitterAppBearerProvider,
  TwitterBrandOAuthProvider,
} from '@api/services/source-collector/providers/twitter-official.provider';
import type { SourceTimelineProvider } from '@api/services/source-collector/source-collector.interface';
import type {
  CollectedSourcePost,
  SourceCollectContext,
  SourceCollectResult,
} from '@api/services/source-collector/source-collector.types';
import type { SocialPostUrlReference } from '@genfeedai/contracts';
import { SocialSourcePlatform } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

function hasExternalPostId(
  post: CollectedSourcePost,
): post is CollectedSourcePost & { id: string } {
  return typeof post.id === 'string' && post.id.trim().length > 0;
}

/**
 * SourceCollector — ordered provider chain for Following / social-source sync.
 *
 * X: brand OAuth → app bearer → Apify
 * IG / TikTok: Apify
 *
 * Throws when every provider fails (no silent empty success).
 */
@Injectable()
export class SourceCollectorService {
  private readonly providers: SourceTimelineProvider[];

  constructor(
    private readonly logger: LoggerService,
    private readonly twitterBrandOAuth: TwitterBrandOAuthProvider,
    private readonly twitterAppBearer: TwitterAppBearerProvider,
    private readonly apifySocial: ApifySocialProvider,
  ) {
    // Priority order matters.
    this.providers = [
      this.twitterBrandOAuth,
      this.twitterAppBearer,
      this.apifySocial,
    ];
  }

  async collectTimeline(
    platform: SocialSourcePlatform,
    handle: string,
    context: SourceCollectContext = {},
  ): Promise<SourceCollectResult> {
    const candidates = this.providers.filter((provider) =>
      provider.platforms.includes(platform),
    );

    if (candidates.length === 0) {
      throw new Error(`No source collectors registered for ${platform}`);
    }

    const errors: string[] = [];

    for (const provider of candidates) {
      try {
        const can = await provider.canCollect(platform, context);
        if (!can) {
          continue;
        }
        const result = await provider.collectTimeline(
          platform,
          handle,
          context,
        );
        const validPosts = result.posts.filter(hasExternalPostId);
        const discardedCount = result.posts.length - validPosts.length;
        if (discardedCount > 0) {
          this.logger.warn('SourceCollector discarded posts without ids', {
            discardedCount,
            handle,
            platform,
            provider: result.provider,
          });
        }
        this.logger.log('SourceCollector collected timeline', {
          count: validPosts.length,
          handle,
          platform,
          provider: result.provider,
        });
        return { ...result, posts: validPosts };
      } catch (error: unknown) {
        const message = (error as Error)?.message ?? 'unknown error';
        errors.push(`${provider.name}: ${message}`);
        this.logger.warn('SourceCollector provider failed', {
          error: message,
          handle,
          platform,
          provider: provider.name,
        });
      }
    }

    throw new Error(
      `All source collectors failed for ${platform}/@${handle}: ${errors.join(' | ')}`,
    );
  }

  /**
   * Fetch exactly one post through the same provider chain (single-post import).
   * Throws when every capable provider fails — no silent empty success.
   */
  async collectPost(
    reference: SocialPostUrlReference,
    context: SourceCollectContext = {},
  ): Promise<SourceCollectResult> {
    const candidates = this.providers.filter(
      (
        provider,
      ): provider is SourceTimelineProvider &
        Required<Pick<SourceTimelineProvider, 'collectPost'>> =>
        provider.platforms.includes(reference.platform) &&
        typeof provider.collectPost === 'function',
    );

    if (candidates.length === 0) {
      throw new Error(
        `No single-post collectors registered for ${reference.platform}`,
      );
    }

    const errors: string[] = [];

    for (const provider of candidates) {
      try {
        const can = await provider.canCollect(reference.platform, context);
        if (!can) {
          continue;
        }
        const result = await provider.collectPost(reference, context);
        const validPosts = result.posts.filter(hasExternalPostId);
        if (!validPosts.length) {
          throw new Error('post not found');
        }
        this.logger.log('SourceCollector collected post', {
          platform: reference.platform,
          postId: reference.postId,
          provider: result.provider,
        });
        return { ...result, posts: validPosts };
      } catch (error: unknown) {
        const message = (error as Error)?.message ?? 'unknown error';
        errors.push(`${provider.name}: ${message}`);
        this.logger.warn('SourceCollector post provider failed', {
          error: message,
          platform: reference.platform,
          postId: reference.postId,
          provider: provider.name,
        });
      }
    }

    throw new Error(
      `All single-post collectors failed for ${reference.platform} post ${reference.postId}: ${errors.join(' | ')}`,
    );
  }
}
