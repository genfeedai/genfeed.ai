import type { CredentialDocument } from '@api/collections/credentials/credential.types';
import {
  SERVER_TOKENS,
  type ServerCredentialStore,
} from '@api/server.dependencies';
import {
  type ChannelTargetSettings,
  readChannelSettingString,
} from '@api-types/contracts/channel-capabilities.contract';
import { CredentialPlatform, OAuthGrantType } from '@genfeedai/enums';
import { ConfigService } from '@libs/config/config.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { Inject, Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

interface RedditAccessTokenResponse {
  access_token?: string;
  expires_in?: number;
}

interface RedditListingPost {
  author?: string;
  created_utc?: number;
  id?: string;
  num_comments?: number;
  permalink?: string;
  score?: number;
  subreddit?: string;
  title?: string;
  upvote_ratio?: number;
}

interface RedditListingResponse {
  data?: {
    children?: Array<{
      data?: RedditListingPost;
    }>;
  };
}

export interface RedditTrend {
  author?: string;
  commentCount: number;
  createdAt?: string;
  id: string;
  score: number;
  subreddit?: string;
  title: string;
  upvoteRatio: number;
  url?: string;
}

@Injectable()
export class RedditService {
  private readonly oauthUrl = 'https://www.reddit.com/api/v1/authorize';
  private readonly tokenUrl = 'https://www.reddit.com/api/v1/access_token';
  private readonly apiUrl = 'https://oauth.reddit.com';
  private appAccessToken: { expiresAt: number; value: string } | null = null;

  constructor(
    private readonly configService: ConfigService,
    @Inject(SERVER_TOKENS.credentials)
    private readonly credentialsService: ServerCredentialStore,
    private readonly httpService: HttpService,
  ) {}

  private requireAccessToken(credential: CredentialDocument): string {
    if (!credential.accessToken) {
      throw new Error('Reddit credential missing access token');
    }

    return credential.accessToken;
  }

  /**
   * Read public Reddit listings with application-only OAuth. Global discovery
   * uses r/all; a connected brand Reddit account narrows discovery to the
   * credential's configured subreddit and combines its hot and daily top
   * listings.
   */
  public async getTrends(
    organizationId?: string,
    brandId?: string,
    limit = 20,
    settings: ChannelTargetSettings = {},
  ): Promise<RedditTrend[]> {
    const accessToken = await this.getAppAccessToken();
    const subreddit = await this.resolveScopedSubreddit(
      organizationId,
      brandId,
      settings,
    );
    const listingLimit = Math.max(1, Math.min(100, limit));

    const listings = subreddit
      ? await Promise.all([
          this.getListing(accessToken, subreddit, 'hot', listingLimit),
          this.getListing(accessToken, subreddit, 'top', listingLimit, 'day'),
        ])
      : [await this.getListing(accessToken, 'all', 'hot', listingLimit)];

    const trendsById = new Map<string, RedditTrend>();
    for (const trend of listings.flat()) {
      if (!trendsById.has(trend.id)) {
        trendsById.set(trend.id, trend);
      }
    }

    return [...trendsById.values()]
      .sort(
        (first, second) =>
          second.score +
          second.commentCount -
          (first.score + first.commentCount),
      )
      .slice(0, listingLimit);
  }

  private async getAppAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.appAccessToken && this.appAccessToken.expiresAt > now + 60_000) {
      return this.appAccessToken.value;
    }

    const clientId = this.requireConfigValue('REDDIT_CLIENT_ID');
    const clientSecret = this.requireConfigValue('REDDIT_CLIENT_SECRET');
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const params = new URLSearchParams({ grant_type: 'client_credentials' });
    const response = await firstValueFrom(
      this.httpService.post(this.tokenUrl, params.toString(), {
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': this.getUserAgent(),
        },
      }),
    );
    const token = response.data as RedditAccessTokenResponse;

    if (!token.access_token) {
      throw new Error('Reddit app OAuth did not return an access token');
    }

    this.appAccessToken = {
      expiresAt: now + Math.max(0, token.expires_in ?? 0) * 1000,
      value: token.access_token,
    };
    return token.access_token;
  }

  private async resolveScopedSubreddit(
    organizationId?: string,
    brandId?: string,
    settings: ChannelTargetSettings = {},
  ): Promise<string | null> {
    if (!organizationId || !brandId) {
      return null;
    }

    const configuredSubreddit = this.normalizeSubreddit(
      readChannelSettingString(settings, 'subreddit'),
    );
    if (configuredSubreddit) {
      return configuredSubreddit;
    }

    const credential = await this.credentialsService.resolveBrandAccount({
      brandId,
      organizationId,
      platform: CredentialPlatform.REDDIT,
    });

    // OAuth stores the Reddit account id in externalId. Only the historical
    // `r/<name>` shape is safe to interpret as the pre-settings subreddit.
    const legacySubreddit = credential?.externalId?.trim();
    if (!legacySubreddit || !/^r\//i.test(legacySubreddit)) {
      return null;
    }

    return this.normalizeSubreddit(legacySubreddit);
  }

  private normalizeSubreddit(value?: string): string | null {
    const candidate = value?.trim().replace(/^r\//i, '');

    return candidate && /^[a-z0-9_]{2,21}$/i.test(candidate) ? candidate : null;
  }

  private async getListing(
    accessToken: string,
    subreddit: string,
    sort: 'hot' | 'top',
    limit: number,
    timeframe?: 'day',
  ): Promise<RedditTrend[]> {
    const response = await firstValueFrom(
      this.httpService.get(`${this.apiUrl}/r/${subreddit}/${sort}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': this.getUserAgent(),
        },
        params: {
          limit,
          raw_json: 1,
          ...(timeframe ? { t: timeframe } : {}),
        },
      }),
    );
    const listing = response.data as RedditListingResponse;

    return (listing.data?.children ?? []).flatMap(({ data }) => {
      if (!data?.id || !data.title) {
        return [];
      }

      return [
        {
          author: data.author,
          commentCount: data.num_comments ?? 0,
          createdAt: data.created_utc
            ? new Date(data.created_utc * 1000).toISOString()
            : undefined,
          id: data.id,
          score: data.score ?? 0,
          subreddit: data.subreddit,
          title: data.title,
          upvoteRatio: data.upvote_ratio ?? 0,
          url: data.permalink
            ? `https://www.reddit.com${data.permalink}`
            : undefined,
        },
      ];
    });
  }

  private requireConfigValue(key: string): string {
    const value = this.configService.get(key);
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`${key} is not configured`);
    }
    return value.trim();
  }

  private getUserAgent(): string {
    const value = this.configService.get('REDDIT_USER_AGENT');
    return typeof value === 'string' && value.trim() ? value.trim() : 'genfeed';
  }

  public generateAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.configService.get('REDDIT_CLIENT_ID'),
      duration: 'permanent',
      redirect_uri: this.configService.get('REDDIT_REDIRECT_URI'),
      response_type: 'code',
      scope: 'identity submit',
      state,
    } as Record<string, string>);
    return `${this.oauthUrl}?${params.toString()}`;
  }

  /**
   * @param credentialId - which connected Reddit account this runs as. A brand
   *   may hold several; without an id this falls back to its oldest one.
   */
  public async refreshToken(
    organizationId: string,
    brandId: string,
    credentialId?: string,
  ): Promise<CredentialDocument> {
    const credential = await this.credentialsService.resolveBrandAccount({
      brandId,
      credentialId,
      // A failed refresh flips isConnected off; the retry still has to find it.
      isDisconnectedIncluded: true,
      organizationId,
      platform: CredentialPlatform.REDDIT,
    });

    if (!credential?.refreshToken) {
      throw new Error('Reddit credential not found');
    }

    // Decrypt the refresh token before use
    const decryptedRefreshToken = EncryptionUtil.decrypt(
      credential.refreshToken,
    );

    const auth = Buffer.from(
      `${this.configService.get('REDDIT_CLIENT_ID')}:${this.configService.get('REDDIT_CLIENT_SECRET')}`,
    ).toString('base64');

    const params = new URLSearchParams();
    params.append('grant_type', OAuthGrantType.REFRESH_TOKEN);
    params.append('refresh_token', decryptedRefreshToken);

    const response = await firstValueFrom(
      this.httpService.post(this.tokenUrl, params.toString(), {
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent':
            this.configService.get('REDDIT_USER_AGENT') || 'genfeed',
        },
      }),
    );

    const { access_token, refresh_token, expires_in } = response.data;

    return this.credentialsService.patch(credential.id, {
      accessToken: access_token,
      accessTokenExpiry: expires_in
        ? new Date(Date.now() + expires_in * 1000)
        : undefined,
      isConnected: true,
      isDeleted: false,
      refreshToken: refresh_token || credential.refreshToken,
    });
  }

  /**
   * @param credentialId - which connected Reddit account this runs as. A brand
   *   may hold several; without an id this falls back to its oldest one.
   */
  public async getAccountDetails(
    organizationId: string,
    brandId: string,
    credentialId?: string,
  ): Promise<unknown> {
    const credential = await this.refreshToken(
      organizationId,
      brandId,
      credentialId,
    );

    // Decrypt access token before use
    const decryptedAccessToken = EncryptionUtil.decrypt(
      this.requireAccessToken(credential),
    );

    const response = await firstValueFrom(
      this.httpService.get(`${this.apiUrl}/api/v1/me`, {
        headers: {
          Authorization: `Bearer ${decryptedAccessToken}`,
          'User-Agent':
            this.configService.get('REDDIT_USER_AGENT') || 'genfeed',
        },
      }),
    );

    return response.data;
  }

  /**
   * Post a comment on a Reddit submission
   * @param organizationId The organization ID
   * @param brandId The brand ID
   * @param thingId The Reddit thing ID (t3_xxx for posts)
   * @param text The comment text
   * @returns The comment ID
   */
  /**
   * @param credentialId - which connected Reddit account this runs as. A brand
   *   may hold several; without an id this falls back to its oldest one.
   */
  public async postComment(
    organizationId: string,
    brandId: string,
    thingId: string,
    text: string,
    credentialId?: string,
  ): Promise<{ commentId: string }> {
    const credential = await this.refreshToken(
      organizationId,
      brandId,
      credentialId,
    );

    // Decrypt access token before use
    const decryptedAccessToken = EncryptionUtil.decrypt(
      this.requireAccessToken(credential),
    );

    // Reddit expects thing_id in format t3_xxx for posts
    const fullThingId = thingId.startsWith('t3_') ? thingId : `t3_${thingId}`;

    const params = new URLSearchParams();
    params.append('thing_id', fullThingId);
    params.append('text', text);
    params.append('api_type', 'json');

    const response = await firstValueFrom(
      this.httpService.post(`${this.apiUrl}/api/comment`, params.toString(), {
        headers: {
          Authorization: `Bearer ${decryptedAccessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent':
            this.configService.get('REDDIT_USER_AGENT') || 'genfeed',
        },
      }),
    );

    const commentId =
      response.data?.json?.data?.things?.[0]?.data?.id ||
      response.data?.json?.data?.id;

    return { commentId };
  }

  /**
   * @param credentialId - which connected Reddit account this runs as. A brand
   *   may hold several; without an id this falls back to its oldest one.
   */
  public async submitPost(
    organizationId: string,
    brandId: string,
    subreddit: string,
    title: string,
    text?: string,
    url?: string,
    flairId?: string,
    credentialId?: string,
  ): Promise<string> {
    const credential = await this.refreshToken(
      organizationId,
      brandId,
      credentialId,
    );

    // Decrypt access token before use
    const decryptedAccessToken = EncryptionUtil.decrypt(
      this.requireAccessToken(credential),
    );

    const params = new URLSearchParams();
    params.append('sr', subreddit);
    params.append('title', title);
    params.append('kind', text ? 'self' : 'link');
    if (text) {
      params.append('text', text);
    }
    if (url) {
      params.append('url', url);
    }
    if (flairId) {
      params.append('flair_id', flairId);
    }

    const response = await firstValueFrom(
      this.httpService.post(`${this.apiUrl}/api/submit`, params.toString(), {
        headers: {
          Authorization: `Bearer ${decryptedAccessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent':
            this.configService.get('REDDIT_USER_AGENT') || 'genfeed',
        },
      }),
    );

    return response.data?.json?.data?.id;
  }
}
