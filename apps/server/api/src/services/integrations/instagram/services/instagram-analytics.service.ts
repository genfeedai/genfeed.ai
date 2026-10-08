import { InstagramMediaType } from '@genfeedai/contracts';
import {
  captureLearningMetrics,
  type LearningMetrics,
} from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import type { InstagramCredentialResponse } from '@genfeedai/contracts/interfaces/integrations/instagram.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface InstagramMediaAnalytics {
  learningMetrics?: LearningMetrics;
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
  credentialId: string,
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
    credentialId: string,
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
              'like_count,comments_count,media_type,media_product_type,insights.metric(views,reach,saved,shares,total_interactions)',
          },
        }),
      );
      const data = response.data;
      if (
        !data ||
        typeof data !== 'object' ||
        Array.isArray(data) ||
        typeof data.id !== 'string' ||
        data.id !== mediaId
      )
        throw new Error('malformed_provider_response');
      const insights = data.insights?.data || [];
      const getInsightValue = (metricName: string): number => {
        const insight = (
          insights as Array<{
            name: string;
            values?: Array<{ value: number }>;
            total_value?: { value: number };
          }>
        ).find((item) => item.name === metricName);
        return insight?.values?.[0]?.value ?? insight?.total_value?.value ?? 0;
      };
      const views = getInsightValue('views');
      const reach = getInsightValue('reach');
      const saves = getInsightValue('saved');
      const shares = getInsightValue('shares');
      const totalInteractions = getInsightValue('total_interactions');
      const engagementRate =
        views > 0
          ? ((totalInteractions ||
              data.like_count + data.comments_count + saves) /
              views) *
            100
          : 0;
      let mediaType: InstagramMediaType | undefined;
      if (data.media_product_type === InstagramMediaType.REELS) {
        mediaType = InstagramMediaType.REELS;
      } else if (data.media_type) {
        mediaType = data.media_type as InstagramMediaType;
      }

      const rawInsights = Object.fromEntries(
        (
          insights as Array<{
            name: string;
            values?: Array<{ value: unknown }>;
            total_value?: { value: unknown };
          }>
        ).map((insight) => [
          insight.name,
          insight.values?.[0]?.value ?? insight.total_value?.value,
        ]),
      );
      return {
        learningMetrics: captureLearningMetrics(
          { ...data, ...rawInsights },
          {
            views: 'views',
            reach: 'reach',
            likes: 'like_count',
            comments: 'comments_count',
            shares: 'shares',
            saves: 'saved',
          },
        ),
        comments: data.comments_count || 0,
        engagementRate:
          engagementRate > 0 ? Number(engagementRate.toFixed(2)) : undefined,
        likes: data.like_count || 0,
        mediaType,
        reach: reach || undefined,
        saves: saves || undefined,
        shares: shares || undefined,
        views,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }
}
