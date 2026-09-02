import { InstagramMediaType } from '@genfeedai/contracts';
import type { InstagramCredentialResponse } from '@genfeedai/contracts/interfaces/integrations/instagram.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface InstagramMediaAnalytics {
  comments: number;
  engagementRate?: number;
  impressions?: number;
  likes: number;
  mediaType?: InstagramMediaType;
  reach?: number;
  saves?: number;
  shares?: number;
  views: number;
}

type ResolveInstagramCredential = (
  organizationId: string,
  brandId: string,
  credentialId?: string,
) => Promise<InstagramCredentialResponse>;

export class InstagramAnalyticsService {
  constructor(
    private readonly httpService: HttpService,
    private readonly loggerService: LoggerService,
    private readonly graphUrl: string,
    private readonly apiVersion: string,
    private readonly resolveCredential: ResolveInstagramCredential,
  ) {}

  async getMediaAnalytics(
    organizationId: string,
    brandId: string,
    mediaId: string,
    credentialId?: string,
  ): Promise<InstagramMediaAnalytics> {
    const url = `InstagramService ${CallerUtil.getCallerName()}`;

    try {
      const credential = await this.resolveCredential(
        organizationId,
        brandId,
        credentialId,
      );
      const accessToken = EncryptionUtil.decrypt(credential.accessToken);
      const response = await firstValueFrom(
        this.httpService.get(`${this.graphUrl}/${this.apiVersion}/${mediaId}`, {
          params: {
            access_token: accessToken,
            fields:
              'like_count,comments_count,media_type,media_product_type,insights.metric(impressions,reach,saved,shares,total_interactions)',
          },
        }),
      );
      const data = response.data || {};
      const insights = data.insights?.data || [];
      const getInsightValue = (metricName: string): number => {
        const insight = (
          insights as Array<{
            name: string;
            values?: Array<{ value: number }>;
          }>
        ).find((item) => item.name === metricName);
        return insight?.values?.[0]?.value || 0;
      };
      const impressions = getInsightValue('impressions');
      const reach = getInsightValue('reach');
      const saves = getInsightValue('saved');
      const shares = getInsightValue('shares');
      const totalInteractions = getInsightValue('total_interactions');
      const engagementRate =
        impressions > 0
          ? ((totalInteractions ||
              data.like_count + data.comments_count + saves) /
              impressions) *
            100
          : 0;
      let mediaType: InstagramMediaType | undefined;
      if (data.media_product_type === InstagramMediaType.REELS) {
        mediaType = InstagramMediaType.REELS;
      } else if (data.media_type) {
        mediaType = data.media_type as InstagramMediaType;
      }

      return {
        comments: data.comments_count || 0,
        engagementRate:
          engagementRate > 0 ? Number(engagementRate.toFixed(2)) : undefined,
        impressions: impressions || undefined,
        likes: data.like_count || 0,
        mediaType,
        reach: reach || undefined,
        saves: saves || undefined,
        shares: shares || undefined,
        views: impressions || 0,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }
}
