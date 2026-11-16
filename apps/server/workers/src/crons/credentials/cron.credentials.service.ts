import {
  type CredentialDocument,
  SERVER_TOKENS,
  type ServerCredentialStore,
} from '@api/index';
import { FacebookService } from '@api/services/integrations/facebook/services/facebook.service';
import { GoogleAdsService } from '@api/services/integrations/google-ads/services/google-ads.service';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { LinkedInService } from '@api/services/integrations/linkedin/services/linkedin.service';
import { PinterestService } from '@api/services/integrations/pinterest/services/pinterest.service';
import { RedditService } from '@api/services/integrations/reddit/services/reddit.service';
import { ThreadsService } from '@api/services/integrations/threads/services/threads.service';
import { TiktokService } from '@api/services/integrations/tiktok/services/tiktok.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import {
  CredentialPlatform,
  fromPrismaCredentialPlatform,
} from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Inject, Injectable } from '@nestjs/common';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** A token expiring within this window is refreshed. */
const DEFAULT_REFRESH_LEAD_MS = HOUR_MS;

/**
 * Tokens that live for weeks get a window of days, so the hourly run has many
 * attempts before the token expires and a transient failure still leaves time
 * to retry. Threads tokens last 60 days and cannot be refreshed once expired.
 */
const LONG_LIVED_REFRESH_LEAD_MS: Partial<Record<CredentialPlatform, number>> =
  { [CredentialPlatform.THREADS]: 7 * DAY_MS };

/** How many refreshes run at once. */
const REFRESH_BATCH_SIZE = 50;

interface TokenRefreshService {
  refreshToken(
    orgId: string,
    brandId: string,
    credentialId?: string,
  ): Promise<unknown>;
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
    @Inject(SERVER_TOKENS.credentials)
    private readonly credentialsService: ServerCredentialStore,
    private readonly facebookService: FacebookService,
    private readonly googleAdsService: GoogleAdsService,
    private readonly instagramService: InstagramService,
    private readonly linkedInService: LinkedInService,
    private readonly pinterestService: PinterestService,
    private readonly redditService: RedditService,
    private readonly threadsService: ThreadsService,
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
      [CredentialPlatform.THREADS, this.threadsService],
      [CredentialPlatform.TIKTOK, this.tiktokService],
      [CredentialPlatform.TWITTER, this.twitterService],
      [CredentialPlatform.YOUTUBE, this.youtubeService],
    ]);
  }

  /**
   * Run every hour to refresh tokens that will expire soon.
   * Most tokens are refreshed within the hour before they expire; long-lived
   * ones (Threads) get a window of days.
   */
  async refreshExpiringTokens(): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${url} started`);

    try {
      const expiringCredentials = await this.findExpiringCredentials();

      if (expiringCredentials.length === 0) {
        this.logger.log(`${url} no credentials expiring soon`);
        return;
      }

      this.logger.log(
        `${url} found ${expiringCredentials.length} credentials expiring soon`,
      );

      const results: PromiseSettledResult<RefreshResult>[] = [];
      for (
        let offset = 0;
        offset < expiringCredentials.length;
        offset += REFRESH_BATCH_SIZE
      ) {
        results.push(
          ...(await Promise.allSettled(
            expiringCredentials
              .slice(offset, offset + REFRESH_BATCH_SIZE)
              .map((credential) => this.refreshCredential(credential, url)),
          )),
        );
      }

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

  /**
   * Every connected credential inside its platform's refresh window, the
   * soonest to expire first. The read is not capped: a cap left the credentials
   * past it unrefreshed, and ones that kept failing held their place.
   */
  private async findExpiringCredentials(): Promise<CredentialDocument[]> {
    const now = Date.now();
    const base = { isConnected: true, isDeleted: false } as const;
    const queries = [
      {
        ...base,
        accessTokenExpiry: {
          lt: new Date(now + DEFAULT_REFRESH_LEAD_MS),
          not: null,
        },
      },
      ...Object.entries(LONG_LIVED_REFRESH_LEAD_MS).map(
        ([platform, leadMs]) => ({
          ...base,
          accessTokenExpiry: { lt: new Date(now + leadMs), not: null },
          platform: platform as CredentialPlatform,
        }),
      ),
    ];

    const found = new Map<string, CredentialDocument>();
    for (const where of queries) {
      const result = await this.credentialsService.findAll(
        { where },
        { pagination: false, sort: { accessTokenExpiry: 1 } },
      );
      for (const credential of result.docs as CredentialDocument[]) {
        found.set(credential.id, credential);
      }
    }

    return [...found.values()].sort(
      (a, b) =>
        (a.accessTokenExpiry?.getTime() ?? 0) -
        (b.accessTokenExpiry?.getTime() ?? 0),
    );
  }

  private async refreshCredential(
    credential: CredentialDocument,
    url: string,
  ): Promise<RefreshResult> {
    // Scalar FKs: the legacy `organization`/`brand` aliases are undefined
    // unless the query populated the relations, so this guard rejected
    // every credential and no token was ever refreshed.
    const orgId = credential.organizationId;
    const brandId = credential.brandId;

    if (!orgId || !brandId) {
      this.logger.warn(`${url} credential missing workspace scope`, {
        credentialId: credential.id,
      });
      return { credentialId: credential.id, success: false };
    }

    try {
      const platform = fromPrismaCredentialPlatform(
        String(credential.platform ?? ''),
      );
      const refresher = platform
        ? this.platformRefreshers.get(platform)
        : undefined;

      if (!refresher) {
        this.logger.warn(`${url} unknown platform for refresh`, {
          credentialId: credential.id,
          platform: credential.platform,
        });
        return { credentialId: credential.id, success: false };
      }

      // Refresh the exact credential: a brand can hold several accounts
      // on one platform, and the brand-wide lookup rejects that case.
      await refresher.refreshToken(orgId, brandId, credential.id);

      this.logger.log(`${url} refreshed token for ${credential.platform}`, {
        credentialId: credential.id,
      });

      return { credentialId: credential.id, success: true };
    } catch (error: unknown) {
      this.logger.error(`${url} failed to refresh token`, {
        credentialId: credential.id,
        error,
        platform: credential.platform,
      });

      return { credentialId: credential.id, error, success: false };
    }
  }
}
