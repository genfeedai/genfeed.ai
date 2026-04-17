import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { AuthClient } from 'linkedin-api-client';
import { firstValueFrom } from 'rxjs';

interface LinkedInTrendTopic {
  growthRate: number;
  mentions: number;
  metadata: {
    sampleContent?: string;
    source: 'curated' | 'public-scrape';
    thumbnailUrl?: string;
    trendType: 'hashtag' | 'topic';
    urls?: string[];
  };
  topic: string;
}

interface LinkedInCredential {
  _id: string | Types.ObjectId;
  accessToken?: string;
  refreshToken?: string;
}

type LinkedInReactionCounts = {
  like?: number;
  celebrate?: number;
  support?: number;
  funny?: number;
  love?: number;
  insightful?: number;
  curious?: number;
};

interface LinkedInTrendCandidate {
  sampleContent?: string;
  sourceUrls: Set<string>;
  thumbnailUrl?: string;
  totalSignal: number;
  uniqueSources: Set<string>;
}

const DEFAULT_LINKEDIN_TREND_SOURCE_URLS = [
  'https://www.linkedin.com/company/openai/',
  'https://www.linkedin.com/company/anthropic-ai/',
  'https://www.linkedin.com/company/hubspot/',
  'https://www.linkedin.com/company/canva/',
  'https://www.linkedin.com/company/notionhq/',
  'https://www.linkedin.com/company/figma/',
  'https://www.linkedin.com/company/linearapp/',
  'https://www.linkedin.com/company/stripe/',
] as const;

const LINKEDIN_TREND_MAX_TOPICS = 20;
const LINKEDIN_TREND_STOP_WORDS = new Set([
  'about',
  'after',
  'again',
  'also',
  'been',
  'between',
  'build',
  'built',
  'could',
  'first',
  'from',
  'have',
  'into',
  'just',
  'more',
  'most',
  'next',
  'only',
  'over',
  'same',
  'than',
  'that',
  'their',
  'there',
  'these',
  'they',
  'this',
  'today',
  'using',
  'what',
  'when',
  'which',
  'with',
  'your',
]);

@Injectable()
export class LinkedInService {
  private readonly constructorName: string = String(this.constructor.name);
  private authClient: AuthClient;

  constructor(
    private readonly configService: ConfigService,
    private readonly credentialsService: CredentialsService,
    private readonly loggerService: LoggerService,
    private readonly httpService: HttpService,
    private readonly brandScraperService: BrandScraperService,
  ) {
    this.authClient = new AuthClient({
      clientId: this.configService.get('LINKEDIN_CLIENT_ID') as string,
      clientSecret: this.configService.get('LINKEDIN_CLIENT_SECRET') as string,
      redirectUrl: this.configService.get('LINKEDIN_REDIRECT_URI') as string,
    });
  }

  public generateAuthUrl(state: string): string {
    return this.authClient.generateMemberAuthorizationUrl(
      ['openid', 'profile', 'email', 'w_member_social'],
      state,
    );
  }

  public async exchangeAuthCodeForAccessToken(code: string): Promise<{
    accessToken: string;
    expiresIn: number;
  }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const tokenResponse =
        await this.authClient.exchangeAuthCodeForAccessToken(code);

      return {
        accessToken: tokenResponse.access_token,
        expiresIn: tokenResponse.expires_in,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async refreshToken(
    organizationId: string,
    brandId: string,
  ): Promise<LinkedInCredential> {
    const queryCredentials = {
      brand: new Types.ObjectId(brandId),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
      platform: CredentialPlatform.LINKEDIN,
    };

    const credentials = (await this.credentialsService.findOne(
      queryCredentials,
    )) as LinkedInCredential | null;

    if (!credentials) {
      throw new Error('LinkedIn credential not found');
    }

    try {
      // LinkedIn OAuth 2.0 uses refresh tokens
      if (credentials.refreshToken) {
        // Decrypt the refresh token before use
        const decryptedRefreshToken = EncryptionUtil.decrypt(
          credentials.refreshToken,
        );

        const refreshResponse =
          await this.authClient.exchangeRefreshTokenForAccessToken(
            decryptedRefreshToken,
          );

        return await this.credentialsService.patch(credentials._id, {
          accessToken: refreshResponse.access_token,
          accessTokenExpiry: refreshResponse.expires_in
            ? new Date(Date.now() + refreshResponse.expires_in * 1000)
            : undefined,
          isConnected: true,
          isDeleted: false,
          refreshToken:
            refreshResponse.refresh_token || credentials.refreshToken,
        });
      }

      // If no refresh token, return existing credentials
      return credentials;
    } catch (error: unknown) {
      this.loggerService.error('Refresh token failed', error);
      // Mark credential as disconnected if refresh fails
      await this.credentialsService.patch(credentials._id, {
        isConnected: false,
      });
      throw error;
    }
  }

  public async getUserProfile(accessToken: string): Promise<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const response = await firstValueFrom(
        this.httpService.get('https://api.linkedin.com/v2/userinfo', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }),
      );

      return {
        email: response.data.email,
        firstName: response.data.given_name,
        id: response.data.sub,
        lastName: response.data.family_name,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async uploadImage(
    organizationId: string,
    brandId: string,
    imageUrl: string,
    caption: string,
  ): Promise<unknown> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const credential = await this.refreshToken(organizationId, brandId);

      if (!credential?.accessToken) {
        throw new Error('LinkedIn credential not found or invalid');
      }

      // Decrypt access token before use
      const decryptedAccessToken = EncryptionUtil.decrypt(
        credential.accessToken,
      );

      const userInfo = await this.getUserProfile(decryptedAccessToken);
      const personURN = `urn:li:person:${userInfo.id}`;

      // Step 1: Register image upload
      const registerResponse = await firstValueFrom(
        this.httpService.post(
          'https://api.linkedin.com/v2/assets?action=registerUpload',
          {
            registerUploadRequest: {
              owner: personURN,
              recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
              serviceRelationships: [
                {
                  identifier: 'urn:li:userGeneratedContent',
                  relationshipType: 'OWNER',
                },
              ],
            },
          },
          {
            headers: {
              Authorization: `Bearer ${decryptedAccessToken}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      const assetId = registerResponse.data.value.asset;
      const uploadUrl =
        registerResponse.data.value.uploadMechanism[
          'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'
        ].uploadUrl;

      // Step 2: Upload image
      const imageRes = await firstValueFrom(
        this.httpService.get(imageUrl, {
          responseType: 'arraybuffer',
        }),
      );

      await firstValueFrom(
        this.httpService.put(uploadUrl, imageRes.data, {
          headers: {
            Authorization: `Bearer ${decryptedAccessToken}`,
            'Content-Type': 'application/octet-stream',
          },
        }),
      );

      // Step 3: Create share with image
      const shareResponse = await firstValueFrom(
        this.httpService.post(
          'https://api.linkedin.com/v2/ugcPosts',
          {
            author: personURN,
            lifecycleState: 'PUBLISHED',
            specificContent: {
              'com.linkedin.ugc.ShareContent': {
                media: [
                  {
                    description: {
                      text: caption,
                    },
                    media: assetId,
                    status: 'READY',
                  },
                ],
                shareCommentary: {
                  text: caption,
                },
                shareMediaCategory: 'IMAGE',
              },
            },
            visibility: {
              'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
            },
          },
          {
            headers: {
              Authorization: `Bearer ${decryptedAccessToken}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      this.loggerService.log(`${url} success`, shareResponse.data);
      return shareResponse.data;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async createTextPost(
    organizationId: string,
    brandId: string,
    text: string,
  ): Promise<unknown> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const credential = await this.refreshToken(organizationId, brandId);

      if (!credential?.accessToken) {
        throw new Error('LinkedIn credential not found or invalid');
      }

      // Decrypt access token before use
      const decryptedAccessToken = EncryptionUtil.decrypt(
        credential.accessToken,
      );

      const userInfo = await this.getUserProfile(decryptedAccessToken);
      const personURN = `urn:li:person:${userInfo.id}`;

      const shareResponse = await firstValueFrom(
        this.httpService.post(
          'https://api.linkedin.com/v2/ugcPosts',
          {
            author: personURN,
            lifecycleState: 'PUBLISHED',
            specificContent: {
              'com.linkedin.ugc.ShareContent': {
                shareCommentary: {
                  text,
                },
                shareMediaCategory: 'NONE',
              },
            },
            visibility: {
              'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
            },
          },
          {
            headers: {
              Authorization: `Bearer ${decryptedAccessToken}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      this.loggerService.log(`${url} success`, shareResponse.data);
      return shareResponse.data;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async uploadVideo(
    organizationId: string,
    brandId: string,
    videoUrl: string,
    caption: string,
  ): Promise<unknown> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const credential = await this.refreshToken(organizationId, brandId);

      if (!credential?.accessToken) {
        throw new Error('LinkedIn credential not found or invalid');
      }

      // Decrypt access token before use
      const decryptedAccessToken = EncryptionUtil.decrypt(
        credential.accessToken,
      );

      const userInfo = await this.getUserProfile(decryptedAccessToken);
      const personURN = `urn:li:person:${userInfo.id}`;

      // Step 1: Register video upload
      const registerResponse = await firstValueFrom(
        this.httpService.post(
          'https://api.linkedin.com/v2/assets?action=registerUpload',
          {
            registerUploadRequest: {
              owner: personURN,
              recipes: ['urn:li:digitalmediaRecipe:feedshare-video'],
              serviceRelationships: [
                {
                  identifier: 'urn:li:userGeneratedContent',
                  relationshipType: 'OWNER',
                },
              ],
            },
          },
          {
            headers: {
              Authorization: `Bearer ${decryptedAccessToken}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      const assetId = registerResponse.data.value.asset;
      const uploadUrl =
        registerResponse.data.value.uploadMechanism[
          'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'
        ].uploadUrl;

      // Step 2: Upload video
      const videoRes = await firstValueFrom(
        this.httpService.get(videoUrl, {
          responseType: 'arraybuffer',
        }),
      );

      await firstValueFrom(
        this.httpService.put(uploadUrl, videoRes.data, {
          headers: {
            Authorization: `Bearer ${decryptedAccessToken}`,
            'Content-Type': 'application/octet-stream',
          },
        }),
      );

      // Step 3: Create share with video
      const shareResponse = await firstValueFrom(
        this.httpService.post(
          'https://api.linkedin.com/v2/ugcPosts',
          {
            author: personURN,
            lifecycleState: 'PUBLISHED',
            specificContent: {
              'com.linkedin.ugc.ShareContent': {
                media: [
                  {
                    description: {
                      text: caption,
                    },
                    media: assetId,
                    status: 'READY',
                  },
                ],
                shareCommentary: {
                  text: caption,
                },
                shareMediaCategory: 'VIDEO',
              },
            },
            visibility: {
              'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
            },
          },
          {
            headers: {
              Authorization: `Bearer ${decryptedAccessToken}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      this.loggerService.log(`${url} success`, shareResponse.data);
      return shareResponse.data;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Derive LinkedIn trend signals from public company pages.
   *
   * The official LinkedIn integration does not expose a public trending-topics
   * endpoint, so we derive live-ish signals from recent public posts on known
   * public pages and fall back to curated evergreen topics only when public
   * scraping does not yield enough signal.
   */
  public async getTrends(
    organizationId?: string,
    brandId?: string,
  ): Promise<LinkedInTrendTopic[]> {
    const url = `${this.constructorName} getTrends organizationId: ${organizationId} brandId: ${brandId}`;

    const sourceUrls = this.getTrendSourceUrls();

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

      const liveTopics = this.buildLiveTrendTopics(scrapedSources);
      if (liveTopics.length > 0) {
        this.loggerService.log(
          `${url} - returning public LinkedIn trend signals`,
          {
            sourceCount: sourceUrls.length,
            topicCount: liveTopics.length,
          },
        );

        return liveTopics;
      }

      this.loggerService.warn(
        `${url} - public LinkedIn scrape returned no usable topics, falling back to curated topics`,
      );
    } catch (error: unknown) {
      this.loggerService.warn(
        `${url} - public LinkedIn scrape failed, falling back to curated topics`,
        { error: error instanceof Error ? error.message : String(error) },
      );
    }

    return this.getCuratedTopics();
  }

  private getTrendSourceUrls(): string[] {
    const configured = this.configService.get('LINKEDIN_TREND_SOURCE_URLS');
    if (typeof configured === 'string' && configured.trim().length > 0) {
      const parsed = configured
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

      if (parsed.length > 0) {
        return parsed;
      }
    }

    return [...DEFAULT_LINKEDIN_TREND_SOURCE_URLS];
  }

  private buildLiveTrendTopics(
    scrapedSources: PromiseSettledResult<{
      logoUrl?: string;
      recentPosts: string[];
      sourceUrl: string;
    }>[],
  ): LinkedInTrendTopic[] {
    const candidates = new Map<string, LinkedInTrendCandidate>();
    const fulfilledSources = scrapedSources
      .filter(
        (
          result,
        ): result is PromiseFulfilledResult<{
          logoUrl?: string;
          recentPosts: string[];
          sourceUrl: string;
        }> => result.status === 'fulfilled',
      )
      .map((result) => result.value)
      .filter((result) => result.recentPosts.length > 0);

    if (fulfilledSources.length === 0) {
      return [];
    }

    for (const source of fulfilledSources) {
      source.recentPosts.forEach((post, index) => {
        const signalWeight = Math.max(1, source.recentPosts.length - index);
        const terms = this.extractTrendTerms(post);

        for (const term of terms) {
          const existing = candidates.get(term) ?? {
            sampleContent: post,
            sourceUrls: new Set<string>(),
            thumbnailUrl: source.logoUrl,
            totalSignal: 0,
            uniqueSources: new Set<string>(),
          };

          existing.sampleContent ||= post;
          existing.thumbnailUrl ||= source.logoUrl;
          existing.sourceUrls.add(source.sourceUrl);
          existing.totalSignal += signalWeight;
          existing.uniqueSources.add(source.sourceUrl);
          candidates.set(term, existing);
        }
      });
    }

    return Array.from(candidates.entries())
      .filter(([, candidate]) => candidate.totalSignal >= 2)
      .sort((left, right) => {
        const sourceCoverageDelta =
          right[1].uniqueSources.size - left[1].uniqueSources.size;
        if (sourceCoverageDelta !== 0) {
          return sourceCoverageDelta;
        }

        return right[1].totalSignal - left[1].totalSignal;
      })
      .slice(0, LINKEDIN_TREND_MAX_TOPICS)
      .map(([topic, candidate]) => ({
        growthRate: this.calculateGrowthRate(
          candidate,
          fulfilledSources.length,
        ),
        mentions: candidate.totalSignal,
        metadata: {
          sampleContent: candidate.sampleContent,
          source: 'public-scrape',
          thumbnailUrl: candidate.thumbnailUrl,
          trendType: topic.startsWith('#') ? 'hashtag' : 'topic',
          urls: Array.from(candidate.sourceUrls),
        },
        topic,
      }));
  }

  private extractTrendTerms(post: string): string[] {
    const hashtags = Array.from(
      new Set(
        (post.match(/#[a-zA-Z0-9_]+/g) || []).map((value) =>
          value.trim().toLowerCase(),
        ),
      ),
    );

    if (hashtags.length > 0) {
      return hashtags.slice(0, 3);
    }

    const tokens = post
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(
        (token) => token.length >= 4 && !LINKEDIN_TREND_STOP_WORDS.has(token),
      );

    return Array.from(new Set(tokens)).slice(0, 3);
  }

  private calculateGrowthRate(
    candidate: LinkedInTrendCandidate,
    totalSources: number,
  ): number {
    const sourceCoverage =
      totalSources > 0 ? candidate.uniqueSources.size / totalSources : 0;
    const signalStrength = Math.min(candidate.totalSignal / 10, 1);

    return Math.round(sourceCoverage * 60 + signalStrength * 40);
  }

  private getCuratedTopics(): LinkedInTrendTopic[] {
    return [
      '#ai',
      '#leadership',
      '#innovation',
      '#technology',
      '#digitaltransformation',
      '#marketing',
      '#sustainability',
      '#entrepreneurship',
      '#careerdevelopment',
      '#remotework',
    ].map((topic) => ({
      growthRate: 35,
      mentions: 1,
      metadata: {
        source: 'curated',
        trendType: 'hashtag',
      },
      topic,
    }));
  }

  /**
   * Post a comment on a LinkedIn post
   * @param organizationId The organization ID
   * @param brandId The brand ID
   * @param postUrn The LinkedIn post URN (e.g., urn:li:share:123456789)
   * @param text The comment text
   * @returns The comment URN
   */
  public async postComment(
    organizationId: string,
    brandId: string,
    postUrn: string,
    text: string,
  ): Promise<{ commentId: string }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const credential = await this.refreshToken(organizationId, brandId);

      if (!credential?.accessToken) {
        throw new Error('LinkedIn credential not found or invalid');
      }

      // Decrypt access token before use
      const decryptedAccessToken = EncryptionUtil.decrypt(
        credential.accessToken,
      );

      const userInfo = await this.getUserProfile(decryptedAccessToken);
      const personURN = `urn:li:person:${userInfo.id}`;

      // LinkedIn Comments API
      const response = await firstValueFrom(
        this.httpService.post(
          `https://api.linkedin.com/v2/socialActions/${encodeURIComponent(postUrn)}/comments`,
          {
            actor: personURN,
            message: {
              text,
            },
          },
          {
            headers: {
              Authorization: `Bearer ${decryptedAccessToken}`,
              'Content-Type': 'application/json',
              'X-Restli-Protocol-Version': '2.0.0',
            },
          },
        ),
      );

      this.loggerService.log(`${url} succeeded`, response.data);

      // Extract comment ID from response
      const commentId = response.data?.id || response.data?.$URN;

      return { commentId };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Get analytics for LinkedIn media (posts, images, videos, articles)
   * @param organizationId The organization ID
   * @param brandId The brand ID
   * @param shareId The LinkedIn share/post ID (URN format)
   * @returns Analytics data including views, likes, comments, shares, impressions
   */
  public async getMediaAnalytics(
    organizationId: string,
    brandId: string,
    shareId: string,
  ): Promise<{
    views: number;
    likes: number;
    comments: number;
    shares?: number;
    impressions?: number;
    clicks?: number;
    engagementRate?: number;
    reach?: number;
    reactions?: {
      like?: number;
      celebrate?: number;
      support?: number;
      funny?: number;
      love?: number;
      insightful?: number;
      curious?: number;
    };
    mediaType?: 'text' | 'image' | 'video' | 'article' | 'document' | 'mixed';
  }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const credential = await this.refreshToken(organizationId, brandId);

      if (!credential?.accessToken) {
        throw new Error('LinkedIn credential not found or invalid');
      }

      // Decrypt access token before use
      const decryptedAccessToken = EncryptionUtil.decrypt(
        credential.accessToken,
      );

      // Fetch both social actions and share statistics
      const [socialActionsResponse, shareStatsResponse] = await Promise.all([
        firstValueFrom(
          this.httpService.get(
            `https://api.linkedin.com/v2/socialActions/${shareId}`,
            {
              headers: {
                Authorization: `Bearer ${decryptedAccessToken}`,
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
                Authorization: `Bearer ${decryptedAccessToken}`,
                'X-Restli-Protocol-Version': '2.0.0',
              },
            },
          ),
        ).catch(() => null),
      ]);

      const socialActions = socialActionsResponse?.data || {};
      const shareStats = shareStatsResponse?.data?.elements?.[0] || {};

      // Extract reaction breakdown if available
      const reactionsSummary = socialActions.reactionsSummary || {};
      const reactions: Record<string, number> = {};

      if (reactionsSummary.aggregatedTotalReactions) {
        for (const [reactionType, count] of Object.entries(
          reactionsSummary.aggregatedTotalReactions,
        )) {
          const type = reactionType.toLowerCase().replace('reaction_type_', '');
          reactions[type] = count;
        }
      }

      // Calculate engagement metrics
      const totalEngagements =
        (socialActions.likeCount || 0) +
        (socialActions.commentCount || 0) +
        (shareStats.shareCount || 0) +
        (shareStats.clickCount || 0);

      const impressions =
        shareStats.impressionCount || socialActions.viewCount || 0;
      const engagementRate =
        impressions > 0 ? (totalEngagements / impressions) * 100 : 0;

      // Try to determine media type from share content
      // This would require fetching the actual share content
      let mediaType:
        | 'text'
        | 'image'
        | 'video'
        | 'article'
        | 'document'
        | 'mixed'
        | undefined;

      return {
        clicks: shareStats.clickCount || undefined,
        comments: socialActions.commentCount || shareStats.commentCount || 0,
        engagementRate:
          engagementRate > 0 ? Number(engagementRate.toFixed(2)) : undefined,
        impressions: impressions || undefined,
        likes: socialActions.likeCount || shareStats.likeCount || 0,
        mediaType,
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
