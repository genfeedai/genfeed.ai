import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

interface LinkedInReactionCounts {
  celebrate?: number;
  curious?: number;
  funny?: number;
  insightful?: number;
  like?: number;
  love?: number;
  support?: number;
}

export interface LinkedInMediaAnalytics {
  clicks?: number;
  comments: number;
  engagementRate?: number;
  impressions?: number;
  likes: number;
  mediaType?: 'text' | 'image' | 'video' | 'article' | 'document' | 'mixed';
  reach?: number;
  reactions?: LinkedInReactionCounts;
  shares?: number;
  views: number;
}

type ResolveLinkedInCredential = (
  organizationId: string,
  brandId: string,
  credentialId?: string,
) => Promise<{ accessToken?: string | null }>;

export class LinkedInAnalyticsService {
  constructor(
    private readonly httpService: HttpService,
    private readonly loggerService: LoggerService,
    private readonly resolveCredential: ResolveLinkedInCredential,
  ) {}

  async getMediaAnalytics(
    organizationId: string,
    brandId: string,
    shareId: string,
    credentialId?: string,
  ): Promise<LinkedInMediaAnalytics> {
    const url = `LinkedInService ${CallerUtil.getCallerName()}`;

    try {
      const credential = await this.resolveCredential(
        organizationId,
        brandId,
        credentialId,
      );
      if (!credential.accessToken) {
        throw new Error('LinkedIn credential not found or invalid');
      }
      const accessToken = EncryptionUtil.decrypt(credential.accessToken);
      const [socialActionsResponse, shareStatsResponse] = await Promise.all([
        firstValueFrom(
          this.httpService.get(
            `https://api.linkedin.com/v2/socialActions/${shareId}`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'X-Restli-Protocol-Version': '2.0.0',
              },
            },
          ),
        ).catch(() => null),
        firstValueFrom(
          this.httpService.get(
            `https://api.linkedin.com/v2/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${shareId}`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'X-Restli-Protocol-Version': '2.0.0',
              },
            },
          ),
        ).catch(() => null),
      ]);
      const socialActions = socialActionsResponse?.data || {};
      const shareStats = shareStatsResponse?.data?.elements?.[0] || {};
      const reactionsSummary = socialActions.reactionsSummary || {};
      const reactions: Record<string, number> = {};

      if (reactionsSummary.aggregatedTotalReactions) {
        for (const [reactionType, count] of Object.entries(
          reactionsSummary.aggregatedTotalReactions,
        )) {
          const type = reactionType.toLowerCase().replace('reaction_type_', '');
          if (typeof count === 'number') {
            reactions[type] = count;
          }
        }
      }

      const totalEngagements =
        (socialActions.likeCount || 0) +
        (socialActions.commentCount || 0) +
        (shareStats.shareCount || 0) +
        (shareStats.clickCount || 0);
      const impressions =
        shareStats.impressionCount || socialActions.viewCount || 0;
      const engagementRate =
        impressions > 0 ? (totalEngagements / impressions) * 100 : 0;

      return {
        clicks: shareStats.clickCount || undefined,
        comments: socialActions.commentCount || shareStats.commentCount || 0,
        engagementRate:
          engagementRate > 0 ? Number(engagementRate.toFixed(2)) : undefined,
        impressions: impressions || undefined,
        likes: socialActions.likeCount || shareStats.likeCount || 0,
        mediaType: undefined,
        reach: shareStats.uniqueImpressionsCount || undefined,
        reactions:
          Object.keys(reactions).length > 0
            ? (reactions as LinkedInReactionCounts)
            : undefined,
        shares: shareStats.shareCount || undefined,
        views: socialActions.viewCount || shareStats.impressionCount || 0,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }
}
