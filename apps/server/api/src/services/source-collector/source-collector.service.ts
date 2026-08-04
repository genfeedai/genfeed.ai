import { ApifySocialProvider } from '@api/services/source-collector/providers/apify-social.provider';
import {
  TwitterAppBearerProvider,
  TwitterBrandOAuthProvider,
} from '@api/services/source-collector/providers/twitter-official.provider';
import type { SourceTimelineProvider } from '@api/services/source-collector/source-collector.interface';
import type {
  SourceCollectContext,
  SourceCollectResult,
} from '@api/services/source-collector/source-collector.types';
import { SocialSourcePlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

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
        this.logger.log('SourceCollector collected timeline', {
          count: result.posts.length,
          handle,
          platform,
          provider: result.provider,
        });
        return result;
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
}
