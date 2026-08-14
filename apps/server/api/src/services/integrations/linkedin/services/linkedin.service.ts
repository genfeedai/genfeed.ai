import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import type { TrendSourceClassification } from '@api/collections/trends/interfaces/trend.interfaces';
import { buildPublicPlatformReferenceClassification } from '@api/collections/trends/utils/trend-source-classification.util';
import { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import { getSafeLinkedInOAuthErrorLog } from '@api/services/integrations/linkedin/utils/linkedin-oauth-error.util';
import {
  type ChannelTargetSettings,
  readChannelSettingString,
} from '@api-types/contracts/channel-capabilities.contract';
import { CredentialPlatform } from '@genfeedai/enums';
import {
  buildGrantedScopesCredentialPatch,
  readOAuthTokenScopeField,
} from '@genfeedai/helpers';
import {
  getIntegrationProviderDefinition,
  IntegrationHttpClient,
} from '@genfeedai/integrations';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { AuthClient } from 'linkedin-api-client';
import { firstValueFrom } from 'rxjs';

interface LinkedInTrendTopic {
  growthRate: number;
  mentions: number;
  metadata: {
    sampleContent?: string;
    source: 'public-reference' | 'public-scrape';
    sourceClassification?: TrendSourceClassification;
    thumbnailUrl?: string;
    trendType: 'hashtag' | 'topic';
    urls?: string[];
  };
  topic: string;
}

interface LinkedInCredential {
  id: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  grantedScopes?: string[] | null;
}

export type LinkedInInboxComment = {
  commentId: string;
  threadId: string;
  text: string;
  createdAt: Date;
  authorExternalId?: string;
  authorName?: string;
};

export type LinkedInInboxDmThread = {
  conversationId: string;
  participantExternalId?: string;
  participantName?: string;
  messages: Array<{
    messageId: string;
    text: string;
    createdAt: Date;
    senderExternalId?: string;
    senderName?: string;
  }>;
};

export type LinkedInDirectMessageListing = {
  isPermitted: boolean;
  reason?: string;
  threads: LinkedInInboxDmThread[];
};

const LINKEDIN_MESSAGING_SCOPES = new Set([
  'r_member_mailbox',
  'r_messages',
  'w_member_mailbox',
]);

type LinkedInCommentElement = {
  $URN?: string;
  id?: string;
  actor?: string;
  created?: { time?: number };
  message?: { text?: string };
  parentComment?: string;
};

type LinkedInCommentsResponse = {
  elements?: LinkedInCommentElement[];
};

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
const LINKEDIN_PROVIDER = getIntegrationProviderDefinition('linkedin');
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

/**
 * LinkedIn's member-network visibility for this release.
 *
 * `PUBLIC` stays the fallback because it is what every share used before the
 * setting existed, so an unset value keeps the previous behaviour. The catalog
 * stays platform-neutral, so this is the only place the provider spelling is
 * decided.
 */
export function resolveLinkedInVisibility(
  settings: ChannelTargetSettings,
): string {
  const visibility = readChannelSettingString(settings, 'visibility');
  return visibility === 'CONNECTIONS' ? 'CONNECTIONS' : 'PUBLIC';
}

@Injectable()
export class LinkedInService {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly apiBaseUrl =
    LINKEDIN_PROVIDER?.endpoints.apiBaseUrl ?? 'https://api.linkedin.com/v2';
  private authClient: AuthClient;
  private readonly integrationHttpClient: IntegrationHttpClient;

  constructor(
    private readonly configService: ConfigService,
    private readonly credentialsService: CredentialsService,
    private readonly loggerService: LoggerService,
    private readonly httpService: HttpService,
    private readonly brandScraperService: BrandScraperService,
  ) {
    this.integrationHttpClient = new IntegrationHttpClient({
      fetch: (input, init) => this.fetchViaHttpService(input, init),
      logger: this.loggerService,
    });
    this.authClient = new AuthClient({
      clientId: this.configService.get('LINKEDIN_CLIENT_ID') as string,
      clientSecret: this.configService.get('LINKEDIN_CLIENT_SECRET') as string,
      redirectUrl: this.configService.get('LINKEDIN_REDIRECT_URI') as string,
    });
  }

  private getApiUrl(path: string): string {
    return `${this.apiBaseUrl}/${path}`;
  }

  private toHttpServiceParams(
    searchParams: URLSearchParams,
  ): Record<string, string | number> {
    return Object.fromEntries(
      [...searchParams.entries()].map(([key, value]) => {
        const numericValue = Number(value);
        return [
          key,
          value.trim() !== '' && Number.isFinite(numericValue)
            ? numericValue
            : value,
        ];
      }),
    );
  }

  private async fetchViaHttpService(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const parsedUrl = new URL(String(input));
    const url = `${parsedUrl.origin}${parsedUrl.pathname}`;
    const params = this.toHttpServiceParams(parsedUrl.searchParams);
    const options = {
      headers: init?.headers as Record<string, string> | undefined,
      params,
      ...(init?.signal ? { signal: init.signal } : {}),
      timeout: 30000,
    };
    const method = init?.method ?? 'GET';
    const response = await firstValueFrom(
      method === 'POST'
        ? this.httpService.post(url, init?.body ?? null, options)
        : method === 'PUT'
          ? this.httpService.put(url, init?.body, options)
          : this.httpService.get(url, options),
    );

    return new Response(JSON.stringify(response.data), {
      headers: { 'content-type': 'application/json' },
      status: response.status ?? 200,
    });
  }

  public generateAuthUrl(state: string): string {
    const clientId = this.configService.get('LINKEDIN_CLIENT_ID');
    const redirectUri = this.configService.get('LINKEDIN_REDIRECT_URI');

    if (
      typeof clientId !== 'string' ||
      clientId.trim() === '' ||
      typeof redirectUri !== 'string' ||
      redirectUri.trim() === ''
    ) {
      throw new HttpException(
        {
          detail:
            'The linkedin integration is missing its provider credentials on this server.',
          title: 'Integration not configured',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    return this.authClient.generateMemberAuthorizationUrl(
      ['openid', 'profile', 'email', 'w_member_social'],
      state,
    );
  }

  public async exchangeAuthCodeForAccessToken(code: string): Promise<{
    accessToken: string;
    expiresIn: number;
    scope?: unknown;
  }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const tokenResponse =
        await this.authClient.exchangeAuthCodeForAccessToken(code);

      const scope = readOAuthTokenScopeField(tokenResponse);

      return {
        accessToken: tokenResponse.access_token,
        expiresIn: tokenResponse.expires_in,
        ...(scope === undefined ? {} : { scope }),
      };
    } catch (error: unknown) {
      this.loggerService.error(
        `${url} failed`,
        getSafeLinkedInOAuthErrorLog(error),
      );
      throw error;
    }
  }

  public async refreshToken(
    organizationId: string,
    brandId: string,
  ): Promise<LinkedInCredential> {
    const queryCredentials = {
      brandId,
      isDeleted: false,
      organizationId,
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

        return await this.credentialsService.patch(credentials.id, {
          accessToken: refreshResponse.access_token,
          accessTokenExpiry: refreshResponse.expires_in
            ? new Date(Date.now() + refreshResponse.expires_in * 1000)
            : undefined,
          isConnected: true,
          isDeleted: false,
          refreshToken:
            refreshResponse.refresh_token || credentials.refreshToken,
          ...buildGrantedScopesCredentialPatch(
            readOAuthTokenScopeField(refreshResponse),
          ),
        });
      }

      // If no refresh token, return existing credentials
      return credentials;
    } catch (error: unknown) {
      this.loggerService.error('Refresh token failed', error);
      // Mark credential as disconnected if refresh fails
      await this.credentialsService.patch(credentials.id, {
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
    picture?: string;
  }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const response = await this.integrationHttpClient.request<{
        email: string;
        family_name: string;
        given_name: string;
        picture?: string;
        sub: string;
      }>({
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        provider: LINKEDIN_PROVIDER,
        timeoutMs: 30000,
        url: this.getApiUrl('userinfo'),
      });

      return {
        email: response.email,
        firstName: response.given_name,
        id: response.sub,
        lastName: response.family_name,
        ...(response.picture ? { picture: response.picture } : {}),
      };
    } catch (error: unknown) {
      this.loggerService.error(
        `${url} failed`,
        getSafeLinkedInOAuthErrorLog(error),
      );
      throw error;
    }
  }

  public async uploadImage(
    organizationId: string,
    brandId: string,
    imageUrl: string,
    caption: string,
    settings: ChannelTargetSettings = {},
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
              'com.linkedin.ugc.MemberNetworkVisibility':
                resolveLinkedInVisibility(settings),
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
    settings: ChannelTargetSettings = {},
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

      const shareResponse = await this.integrationHttpClient.request<unknown>({
        body: {
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
            'com.linkedin.ugc.MemberNetworkVisibility':
              resolveLinkedInVisibility(settings),
          },
        },
        headers: {
          Authorization: `Bearer ${decryptedAccessToken}`,
        },
        method: 'POST',
        provider: LINKEDIN_PROVIDER,
        timeoutMs: 30000,
        url: this.getApiUrl('ugcPosts'),
      });

      this.loggerService.log(`${url} success`, shareResponse);
      return shareResponse;
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
    settings: ChannelTargetSettings = {},
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
              'com.linkedin.ugc.MemberNetworkVisibility':
                resolveLinkedInVisibility(settings),
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
   * public pages and fall back to the configured public reference sources when
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
        `${url} - public LinkedIn scrape returned no usable topics, falling back to public reference topics`,
      );
    } catch (error: unknown) {
      this.loggerService.warn(
        `${url} - public LinkedIn scrape failed, falling back to public reference topics`,
        { error: error instanceof Error ? error.message : String(error) },
      );
    }

    return this.getPublicReferenceTopics(sourceUrls);
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
          sourceClassification: this.buildSourceClassification({
            capturedAt: new Date(),
            confidence: 'medium',
            sourceLabel: 'LinkedIn public posts',
            sourceTopic: topic,
          }),
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

  private getPublicReferenceTopics(sourceUrls: string[]): LinkedInTrendTopic[] {
    const capturedAt = new Date();
    const seenTopics = new Set<string>();

    return sourceUrls.flatMap((sourceUrl, index) => {
      const sourceLabel = this.getPublicReferenceLabel(sourceUrl);
      const topic = this.toReferenceTopic(sourceLabel, index);
      if (seenTopics.has(topic)) {
        return [];
      }
      seenTopics.add(topic);

      return [
        {
          growthRate: 20,
          mentions: 1,
          metadata: {
            sampleContent: `Public LinkedIn reference source for ${sourceLabel}.`,
            source: 'public-reference',
            sourceClassification: this.buildSourceClassification({
              capturedAt,
              confidence: 'low',
              sourceLabel,
              sourceTopic: topic,
            }),
            trendType: 'topic',
            urls: [sourceUrl],
          },
          topic,
        },
      ];
    });
  }

  private buildSourceClassification(input: {
    capturedAt: Date;
    confidence: TrendSourceClassification['confidence'];
    sourceLabel: string;
    sourceTopic: string;
  }): TrendSourceClassification {
    return buildPublicPlatformReferenceClassification({
      capturedAt: input.capturedAt,
      confidence: input.confidence,
      platform: 'linkedin',
      sourceLabel: input.sourceLabel,
      sourceTimestamp: input.capturedAt,
      sourceTopic: input.sourceTopic,
    });
  }

  private getPublicReferenceLabel(sourceUrl: string): string {
    try {
      const parsed = new URL(sourceUrl);
      const pathParts = parsed.pathname.split('/').filter(Boolean);
      const slug = pathParts[pathParts.length - 1] || parsed.hostname;
      return slug
        .replace(/[-_]+/g, ' ')
        .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
        .trim();
    } catch {
      return sourceUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    }
  }

  private toReferenceTopic(sourceLabel: string, index: number): string {
    const token = sourceLabel.toLowerCase().replace(/[^a-z0-9]+/g, '');
    return token ? `#${token}` : `#linkedinreference${index + 1}`;
  }

  /**
   * List comments on one published LinkedIn share/UGC post.
   * Replies keep the top-level comment id as their thread id.
   */
  public async listPostComments(
    organizationId: string,
    brandId: string,
    postUrn: string,
    options: { limit?: number; start?: number } = {},
  ): Promise<LinkedInInboxComment[]> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const credential = await this.refreshToken(organizationId, brandId);
      if (!credential?.accessToken) {
        throw new Error('LinkedIn credential not found or invalid');
      }

      const decryptedAccessToken = EncryptionUtil.decrypt(
        credential.accessToken,
      );
      const count = Math.min(Math.max(options.limit ?? 25, 1), 100);
      const start = Math.max(options.start ?? 0, 0);

      const response = await firstValueFrom(
        this.httpService.get<LinkedInCommentsResponse>(
          `https://api.linkedin.com/v2/socialActions/${encodeURIComponent(postUrn)}/comments`,
          {
            headers: {
              Authorization: `Bearer ${decryptedAccessToken}`,
              'X-Restli-Protocol-Version': '2.0.0',
            },
            params: { count, start },
          },
        ),
      );

      const comments = (response.data.elements ?? []).flatMap((element) => {
        const commentId = element.id ?? element.$URN;
        const text = element.message?.text;
        if (!commentId || !text) {
          return [];
        }

        const createdAt =
          typeof element.created?.time === 'number'
            ? new Date(element.created.time)
            : new Date();

        return [
          {
            authorExternalId: element.actor,
            commentId,
            createdAt: Number.isNaN(createdAt.getTime())
              ? new Date()
              : createdAt,
            text,
            threadId: element.parentComment ?? commentId,
          } satisfies LinkedInInboxComment,
        ];
      });

      this.loggerService.log(`${url} succeeded`, {
        count: comments.length,
        postUrn,
        start,
      });

      return comments;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * LinkedIn member messaging is a partner API. The connected-account OAuth
   * path only requests `w_member_social`, so DMs stay closed unless a later
   * grant adds a mailbox scope.
   */
  public async listDirectMessages(
    organizationId: string,
    brandId: string,
  ): Promise<LinkedInDirectMessageListing> {
    const credential = await this.credentialsService.findOne({
      brandId,
      isDeleted: false,
      organizationId,
      platform: CredentialPlatform.LINKEDIN,
    });

    const grantedScopes = credential?.grantedScopes ?? [];
    const isPermitted = grantedScopes.some((scope) =>
      LINKEDIN_MESSAGING_SCOPES.has(scope),
    );

    if (!isPermitted) {
      return {
        isPermitted: false,
        reason: 'LinkedIn messaging is not available on the connected account',
        threads: [],
      };
    }

    return { isPermitted: true, threads: [] };
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
          if (typeof count === 'number') {
            reactions[type] = count;
          }
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
