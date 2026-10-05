import { PlatformSettingsService } from '@api/collections/platform-settings/services/platform-settings.service';
import { recordTrendProviderOutcome } from '@api/collections/trends/utils/trend-refresh-evidence.util';
import { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import type {
  ServerLinkedInTrend,
  ServerLinkedInTrendResolver,
} from '@api/services/integrations/linkedin/linkedin-trends.port';
import {
  buildLinkedInLiveTrendTopics,
  type LinkedInTrendTopic,
  resolveLinkedInTrendSourceUrls,
} from '@api/services/integrations/linkedin/utils/linkedin-trend.util';
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
    private readonly platformSettings: PlatformSettingsService,
    private readonly loggerService: LoggerService,
  ) {}

  async resolve(
    organizationId?: string,
    brandId?: string,
  ): Promise<ServerLinkedInTrend[]> {
    const url = `LinkedInService getTrends organizationId: ${organizationId} brandId: ${brandId}`;
    const sourceUrls = resolveLinkedInTrendSourceUrls(
      (await this.platformSettings.getFeatureSettings())
        .linkedinTrendSourceUrls ?? undefined,
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

      const failedSourceCount = scrapedSources.filter(
        (result) => result.status === 'rejected',
      ).length;
      const sourcesWithPosts = scrapedSources.filter(
        (result) =>
          result.status === 'fulfilled' && result.value.recentPosts.length > 0,
      ).length;
      // Pages that load but yield no posts mean the extraction is broken, not
      // that LinkedIn is quiet, so refresh health must not read it as empty.
      if (failedSourceCount > 0 || sourcesWithPosts === 0)
        recordTrendProviderOutcome('native_failed', 'native_failed');
      this.loggerService.warn(
        `${url} - public LinkedIn scrape returned no usable topics, returning no observed trends`,
        {
          failedSourceCount,
          sourceCount: sourceUrls.length,
          sourcesWithPosts,
        },
      );
    } catch (error: unknown) {
      recordTrendProviderOutcome('native_failed', 'native_failed');
      this.loggerService.warn(
        `${url} - public LinkedIn scrape failed, returning no observed trends`,
        { error: error instanceof Error ? error.message : String(error) },
      );
    }

    return [];
  }
}
