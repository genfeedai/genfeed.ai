import type { CredentialDocument } from '@api/collections/credentials/credential.types';
import type { ITikTokMediaAnalytics } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

type ResolveTikTokCredential = (
  organizationId: string,
  brandId: string,
  credentialId: string,
) => Promise<CredentialDocument>;
type HandleTikTokAuthError = (
  credentialId: string,
  error: unknown,
  context: string,
) => Promise<boolean>;

export class TiktokAnalyticsService {
  constructor(
    private readonly httpService: HttpService,
    private readonly loggerService: LoggerService,
    private readonly endpoint: string,
    private readonly resolveCredential: ResolveTikTokCredential,
    private readonly handleAuthorizationError: HandleTikTokAuthError,
  ) {}

  async getMediaAnalytics(
    organizationId: string,
    brandId: string,
    mediaId: string,
    credentialId: string,
  ): Promise<ITikTokMediaAnalytics> {
    const url = `TiktokService ${CallerUtil.getCallerName()}`;
    let credential: CredentialDocument | null = null;

    try {
      credential = await this.resolveCredential(
        organizationId,
        brandId,
        credentialId,
      );
      if (!credential.accessToken) {
        throw new Error('TikTok credential not found');
      }
      const accessToken = EncryptionUtil.decrypt(credential.accessToken);
      const response = await firstValueFrom(
        this.httpService.get(`${this.endpoint}/video/query/`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: {
            fields:
              'like_count,comment_count,view_count,share_count,download_count,reach_count,impression_count,full_video_watched_rate,average_watch_time,total_time_watched',
            video_ids: mediaId,
          },
        }),
      );
      const item = response.data?.data?.videos?.[0] || {};
      const totalEngagements =
        (item.like_count || 0) +
        (item.comment_count || 0) +
        (item.share_count || 0) +
        (item.download_count || 0);
      const engagementRate =
        item.view_count > 0 ? (totalEngagements / item.view_count) * 100 : 0;

      return {
        averageWatchTime: item.average_watch_time || undefined,
        comments: item.comment_count || 0,
        completionRate: item.full_video_watched_rate
          ? Number((item.full_video_watched_rate * 100).toFixed(2))
          : undefined,
        downloads: item.download_count || undefined,
        engagementRate:
          engagementRate > 0 ? Number(engagementRate.toFixed(2)) : undefined,
        impressions: item.impression_count || undefined,
        likes: item.like_count || 0,
        mediaType: 'video',
        reach: item.reach_count || undefined,
        shares: item.share_count || undefined,
        views: item.view_count || 0,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      if (credential) {
        await this.handleAuthorizationError(credential.id, error, url);
      }
      throw error;
    }
  }
}
