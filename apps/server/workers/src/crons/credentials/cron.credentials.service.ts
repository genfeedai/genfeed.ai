import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { FacebookService } from '@api/services/integrations/facebook/services/facebook.service';
import { GoogleAdsService } from '@api/services/integrations/google-ads/services/google-ads.service';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { LinkedInService } from '@api/services/integrations/linkedin/services/linkedin.service';
import { PinterestService } from '@api/services/integrations/pinterest/services/pinterest.service';
import { RedditService } from '@api/services/integrations/reddit/services/reddit.service';
import { TiktokService } from '@api/services/integrations/tiktok/services/tiktok.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

interface TokenRefreshService {
  refreshToken(orgId: string, brandId: string): Promise<void>;
}

interface RefreshResult {
  credentialId: unknown;
  success: boolean;
  error?: unknown;
}

@Injectable()
export class CronCredentialsService {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly platformRefreshers: Map<
    CredentialPlatform,
    TokenRefreshService
  >;

  constructor(
    private readonly logger: LoggerService,
    private readonly credentialsService: CredentialsService,
    private readonly facebookService: FacebookService,
    private readonly googleAdsService: GoogleAdsService,
    private readonly instagramService: InstagramService,
    private readonly linkedInService: LinkedInService,
    private readonly pinterestService: PinterestService,
    private readonly redditService: RedditService,
    private readonly tiktokService: TiktokService,
    private readonly twitterService: TwitterService,
    private readonly youtubeService: YoutubeService,
  ) {
    this.platformRefreshers = new Map<CredentialPlatform, TokenRefreshService>([
      [CredentialPlatform.FACEBOOK, this.facebookService],
      [CredentialPlatform.GOOGLE_ADS, this.googleAdsService],
      [CredentialPlatform.INSTAGRAM, this.instagramService],
      [CredentialPlatform.LINKEDIN, this.linkedInService],
      [CredentialPlatform.PINTEREST, this.pinterestService],
      [CredentialPlatform.REDDIT, this.redditService],
      [CredentialPlatform.TIKTOK, this.tiktokService],
      [CredentialPlatform.TWITTER, this.twitterService],
      [CredentialPlatform.YOUTUBE, this.youtubeService],
    ]);
  }

  /**
   * Run every hour to refresh tokens that will expire soon
   * Tokens are refreshed if they expire within the next hour
   */
  @Cron(CronExpression.EVERY_HOUR)
  async refreshExpiringTokens(): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${url} started`);

    try {
      // Find credentials expiring in the next hour
      const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);

      const result = await this.credentialsService.findAll(
        {
          where: {
            accessTokenExpiry: {
              lt: oneHourFromNow,
              not: null,
            },
            isConnected: true,
            isDeleted: false,
          },
        },
        { limit: 100, pagination: false },
      );

      const expiringCredentials = result.docs;

      if (!expiringCredentials || expiringCredentials.length === 0) {
        this.logger.log(`${url} no credentials expiring soon`);
        return;
      }

      this.logger.log(
        `${url} found ${expiringCredentials.length} credentials expiring soon`,
      );

      // Refresh each credential
      const results = await Promise.allSettled(
        expiringCredentials.map(async (credential: CredentialDocument) => {
          const orgId = credential.organization.toString();
          const brandId = credential.brand.toString();

          try {
            const refresher = this.platformRefreshers.get(credential.platform);

            if (!refresher) {
              this.logger.warn(`${url} unknown platform for refresh`, {
                credentialId: credential._id,
                platform: credential.platform,
              });
              return { credentialId: credential._id, success: false };
            }

            await refresher.refreshToken(orgId, brandId);

            this.logger.log(
              `${url} refreshed token for ${credential.platform}`,
              {
                credentialId: credential._id,
              },
            );

            return { credentialId: credential._id, success: true };
          } catch (error: unknown) {
            this.logger.error(`${url} failed to refresh token`, {
              credentialId: credential._id,
              error,
              platform: credential.platform,
            });

            return { credentialId: credential._id, error, success: false };
          }
        }),
      );

      // Count successes and failures
      const successes = results.filter(
        (r: PromiseSettledResult<RefreshResult>) =>
          r.status === 'fulfilled' && r.value.success,
      ).length;
      const failures = results.filter(
        (r: PromiseSettledResult<RefreshResult>) =>
          r.status === 'rejected' ||
          (r.status === 'fulfilled' && !r.value.success),
      ).length;

      this.logger.log(`${url} completed`, {
        failures,
        successes,
        total: expiringCredentials.length,
      });
    } catch (error: unknown) {
      this.logger.error(`${url} failed`, error);
    }
  }
}
