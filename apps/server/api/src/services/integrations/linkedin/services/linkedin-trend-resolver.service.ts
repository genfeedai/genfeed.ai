import { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import type {
  ServerLinkedInTrend,
  ServerLinkedInTrendResolver,
} from '@api/services/integrations/linkedin/linkedin-trends.port';
import {
  buildLinkedInLiveTrendTopics,
  buildLinkedInPublicReferenceTopics,
  type LinkedInTrendTopic,
  resolveLinkedInTrendSourceUrls,
} from '@api/services/integrations/linkedin/utils/linkedin-trend.util';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

function toServerTrends(
  topics: readonly LinkedInTrendTopic[],
): ServerLinkedInTrend[] {
  return topics.map((topic) => ({
    ...topic,
    metadata: { ...topic.metadata },
  }));
}

@Injectable()
export class LinkedInTrendResolverService
  implements ServerLinkedInTrendResolver
{
  constructor(
    private readonly brandScraperService: BrandScraperService,
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
  ) {}

  async resolve(
    organizationId?: string,
    brandId?: string,
  ): Promise<ServerLinkedInTrend[]> {
    const url = `LinkedInService getTrends organizationId: ${organizationId} brandId: ${brandId}`;
    const sourceUrls = resolveLinkedInTrendSourceUrls(
      this.configService.get('LINKEDIN_TREND_SOURCE_URLS'),
    );

    try {
      const scrapedSources = await Promise.allSettled(
        sourceUrls.map(async (sourceUrl) => {
          const result =
            await this.brandScraperService.scrapeLinkedIn(sourceUrl);

          return {
            logoUrl: result.logoUrl || result.coverImageUrl,
            recentPosts: result.recentPosts,
            sourceUrl: result.sourceUrl,
          };
        }),
      );

      const liveTopics = buildLinkedInLiveTrendTopics(scrapedSources);
      if (liveTopics.length > 0) {
        this.loggerService.log(
          `${url} - returning public LinkedIn trend signals`,
          {
            sourceCount: sourceUrls.length,
            topicCount: liveTopics.length,
          },
        );

        return toServerTrends(liveTopics);
      }

      this.loggerService.warn(
        `${url} - public LinkedIn scrape returned no usable topics, falling back to public reference topics`,
      );
    } catch (error: unknown) {
      this.loggerService.warn(
        `${url} - public LinkedIn scrape failed, falling back to public reference topics`,
        { error: error instanceof Error ? error.message : String(error) },
      );
    }

    return toServerTrends(buildLinkedInPublicReferenceTopics(sourceUrls));
  }
}
