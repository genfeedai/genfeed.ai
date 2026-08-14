import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { SocialWarmupEnrollmentsService } from '@api/collections/social-warmup-enrollments/services/social-warmup-enrollments.service';
import {
  CACHE_PATTERNS,
  CACHE_TAGS,
  SCOPED_CACHE_TAGS,
} from '@api/common/constants/cache-patterns.constants';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { CacheService } from '@api/services/cache/services/cache.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import {
  getTwitterRetryAfterMs,
  isTwitterAuthorizationError,
  isTwitterRateLimitError,
  isTwitterScopeOrTierError,
} from '@api/services/integrations/twitter/utils/twitter-api-error.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  type TwitterAuthorizedSignalEvidence,
  type TwitterAuthorizedSignalReason,
  type TwitterAuthorizedSignalsSnapshot,
  type TwitterOwnedPostSignal,
  twitterAuthorizedSignalStatusValues,
  twitterAuthorizedSignalsSnapshotSchema,
} from '@api-types/contracts/twitter-authorized-signals.contract';
import {
  CredentialPlatform,
  TargetExecutionState,
  toPrismaCredentialPlatform,
} from '@genfeedai/enums';
import { parseGrantedOAuthScopes } from '@genfeedai/helpers';
import { scopedWhere } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

const TWITTER_AUTHORIZED_SIGNALS_CACHE_TTL_SECONDS = 5 * 60;
const TWITTER_STALE_SIGNALS_CACHE_TTL_SECONDS = 60;
const TWITTER_AUTHORIZED_SIGNALS_STORAGE_KEY = 'twitterAuthorized';
const TWITTER_AUTHORIZATION_STORAGE_KEY = 'twitterAuthorization';
const TWITTER_SIGNAL_MAX_ATTEMPTS = 2;
const TWITTER_SIGNAL_RETRY_FALLBACK_MS = 1_000;
const TWITTER_SIGNAL_RETRY_MAX_MS = 5_000;
const TWITTER_SIGNAL_REQUEST_TIMEOUT_MS = 10_000;
const TWITTER_POST_LIMIT = 20;

type TwitterSignalFieldStatus =
  (typeof twitterAuthorizedSignalStatusValues)[number];

function toFieldAvailability(
  entries: ReadonlyArray<readonly [string, TwitterSignalFieldStatus]>,
): Record<string, TwitterSignalFieldStatus> {
  return Object.fromEntries(entries);
}

const USERS_READ_SCOPE = 'users.read';
const TWEET_READ_SCOPE = 'tweet.read';
const TWEET_WRITE_SCOPE = 'tweet.write';
const MEDIA_WRITE_SCOPE = 'media.write';

const PROFILE_FIELDS = {
  createdAt: USERS_READ_SCOPE,
  description: USERS_READ_SCOPE,
  isProtected: USERS_READ_SCOPE,
  isVerified: USERS_READ_SCOPE,
  location: USERS_READ_SCOPE,
  name: USERS_READ_SCOPE,
  profileImageUrl: USERS_READ_SCOPE,
  url: USERS_READ_SCOPE,
  username: USERS_READ_SCOPE,
  verifiedType: USERS_READ_SCOPE,
} as const;

const STATISTICS_FIELDS = {
  followersCount: USERS_READ_SCOPE,
  followingCount: USERS_READ_SCOPE,
  likeCount: USERS_READ_SCOPE,
  listedCount: USERS_READ_SCOPE,
  tweetCount: USERS_READ_SCOPE,
} as const;

const POST_FIELDS = [
  'conversationId',
  'createdAt',
  'createTime',
  'id',
  'impressionCount',
  'inReplyToUserId',
  'isQuote',
  'isReply',
  'isRetweet',
  'likeCount',
  'quoteCount',
  'replyCount',
  'replySettings',
  'retweetCount',
  'text',
] as const;

const PUBLISHING_FIELDS = [
  'canPublish',
  'canUploadMedia',
  'isProtected',
] as const;

const USER_PROVIDER_FIELDS = [
  'created_at',
  'description',
  'location',
  'name',
  'profile_image_url',
  'protected',
  'public_metrics',
  'url',
  'username',
  'verified',
  'verified_type',
].join(',');

const TWEET_PROVIDER_FIELDS = [
  'conversation_id',
  'created_at',
  'in_reply_to_user_id',
  'public_metrics',
  'referenced_tweets',
  'reply_settings',
  'text',
].join(',');

interface TwitterUserInfoResponse {
  data?: {
    created_at?: unknown;
    description?: unknown;
    id?: unknown;
    location?: unknown;
    name?: unknown;
    profile_image_url?: unknown;
    protected?: unknown;
    public_metrics?: {
      followers_count?: unknown;
      following_count?: unknown;
      like_count?: unknown;
      listed_count?: unknown;
      tweet_count?: unknown;
    };
    url?: unknown;
    username?: unknown;
    verified?: unknown;
    verified_type?: unknown;
  };
}

interface TwitterTweetListResponse {
  data?: Array<{
    conversation_id?: unknown;
    created_at?: unknown;
    id?: unknown;
    in_reply_to_user_id?: unknown;
    public_metrics?: {
      impression_count?: unknown;
      like_count?: unknown;
      quote_count?: unknown;
      reply_count?: unknown;
      retweet_count?: unknown;
    };
    referenced_tweets?: Array<{ type?: unknown }>;
    reply_settings?: unknown;
    text?: unknown;
  }>;
  meta?: {
    next_token?: unknown;
    result_count?: unknown;
  };
}

export interface RefreshTwitterAuthorizedSignalsParams {
  /**
   * Raw (plaintext) OAuth access token from a just-completed token exchange.
   * Used verbatim — never decrypted — so callers must not pass the encrypted
   * persisted credential token here; omit it to use the stored credential.
   */
  accessToken?: string;
  credentialId: string;
  force?: boolean;
  grantedScopes?: readonly string[] | string;
  organizationId: string;
}

type PlatformEvidenceKey = Exclude<
  TwitterAuthorizedSignalEvidence['key'],
  'genfeed-publish-activity'
>;

type GenfeedPublishOutcome =
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'paused'
  | 'cancelled'
  | 'skipped';

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readHttpUrl(value: unknown): string | undefined {
  const candidate = readString(value);
  if (!candidate) {
    return undefined;
  }

  try {
    const url = new URL(candidate);
    return ['http:', 'https:'].includes(url.protocol) ? candidate : undefined;
  } catch {
    return undefined;
  }
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function readNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

function readIsoTimestamp(value: unknown): string | undefined {
  const candidate = readString(value);
  if (!candidate) {
    return undefined;
  }

  const date = new Date(candidate);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function readIsoToUnixSeconds(value: unknown): number | undefined {
  const iso = readIsoTimestamp(value);
  if (!iso) {
    return undefined;
  }

  const seconds = Math.floor(Date.parse(iso) / 1000);
  return seconds > 0 ? seconds : undefined;
}

function mapOutcome(value: unknown): GenfeedPublishOutcome | undefined {
  const outcomes = new Set<string>([
    TargetExecutionState.SCHEDULED,
    TargetExecutionState.PUBLISHING,
    TargetExecutionState.PUBLISHED,
    TargetExecutionState.FAILED,
    TargetExecutionState.PAUSED,
    TargetExecutionState.CANCELLED,
    TargetExecutionState.SKIPPED,
  ]);

  return typeof value === 'string' && outcomes.has(value)
    ? (value as GenfeedPublishOutcome)
    : undefined;
}

@Injectable()
export class TwitterAuthorizedSignalsService {
  private readonly endpoint = 'https://api.twitter.com/2';
  private readonly constructorName = this.constructor.name;

  constructor(
    private readonly cacheService: CacheService,
    private readonly credentialsService: CredentialsService,
    private readonly httpService: HttpService,
    private readonly loggerService: LoggerService,
    private readonly prisma: PrismaService,
    private readonly twitterService: TwitterService,
    private readonly socialWarmupEnrollmentsService: SocialWarmupEnrollmentsService,
  ) {}

  async refresh(
    params: RefreshTwitterAuthorizedSignalsParams,
  ): Promise<TwitterAuthorizedSignalsSnapshot> {
    const platform = toPrismaCredentialPlatform(CredentialPlatform.TWITTER);
    const credential = await this.credentialsService.findOne({
      id: params.credentialId,
      organizationId: params.organizationId,
      platform,
    });

    if (!credential) {
      throw new NotFoundException('X credential');
    }

    const previousSnapshot = this.readStoredSnapshot(credential);
    const cacheKey = CACHE_PATTERNS.TWITTER_AUTHORIZED_SIGNALS_SINGLE(
      credential.id,
    );

    if (!params.force) {
      const cached = await this.cacheService.get<unknown>(cacheKey);
      const cachedSnapshot =
        twitterAuthorizedSignalsSnapshotSchema.safeParse(cached);
      if (cachedSnapshot.success) {
        return cachedSnapshot.data;
      }
    }

    const refreshAttemptedAt = new Date().toISOString();
    let grantedScopes = this.resolveGrantedScopes(
      params.grantedScopes,
      credential,
      previousSnapshot,
    );
    const genfeedEvidence = await this.buildGenfeedEvidence(
      credential,
      params.organizationId,
      refreshAttemptedAt,
    );

    if (!credential.isConnected && !params.accessToken) {
      return await this.persistSnapshot(
        credential,
        params.organizationId,
        cacheKey,
        this.buildRevokedSnapshot(
          credential.id,
          grantedScopes,
          previousSnapshot,
          genfeedEvidence,
          refreshAttemptedAt,
        ),
      );
    }

    let accessToken: string;
    try {
      const shouldDiscoverScopes =
        params.accessToken === undefined &&
        params.grantedScopes === undefined &&
        !this.hasStoredScopeObservation(credential, previousSnapshot) &&
        Boolean(credential.refreshToken);
      const validCredential = params.accessToken
        ? credential
        : shouldDiscoverScopes
          ? await this.twitterService.refreshToken(
              params.organizationId,
              credential.brandId ?? '',
              credential.id,
            )
          : await this.twitterService.getValidCredential(
              params.organizationId,
              credential.brandId ?? '',
              credential.id,
            );
      if (params.grantedScopes === undefined) {
        grantedScopes = this.resolveGrantedScopes(
          undefined,
          validCredential,
          previousSnapshot,
        );
      }
      if (params.accessToken) {
        accessToken = params.accessToken;
      } else {
        if (!validCredential.accessToken) {
          throw new Error('X credential is missing an access token');
        }
        accessToken = EncryptionUtil.decrypt(validCredential.accessToken);
      }
    } catch (error: unknown) {
      if (
        await this.twitterService.handleAuthorizationError(
          credential.id,
          error,
          `${this.constructorName} refresh`,
        )
      ) {
        return await this.persistSnapshot(
          credential,
          params.organizationId,
          cacheKey,
          this.buildRevokedSnapshot(
            credential.id,
            grantedScopes,
            previousSnapshot,
            genfeedEvidence,
            refreshAttemptedAt,
          ),
        );
      }
      throw error;
    }

    const userInfoPromise = grantedScopes.includes(USERS_READ_SCOPE)
      ? this.requestWithRetry(() => this.fetchUserInfo(accessToken))
      : undefined;
    const userInfoResult = await this.settle(userInfoPromise);
    const userId =
      readString(userInfoResult.value?.id) ?? readString(credential.externalId);

    const tweetsPromise =
      grantedScopes.includes(TWEET_READ_SCOPE) && userId
        ? this.requestWithRetry(() => this.fetchOwnedPosts(accessToken, userId))
        : undefined;

    const tweetsResult = await this.settle(tweetsPromise);
    const providerErrors = [userInfoResult.error, tweetsResult.error].filter(
      (error) => error !== undefined,
    );
    const authorizationError = providerErrors.find((error) =>
      this.isAuthorizationFailure(error),
    );

    if (authorizationError) {
      await this.twitterService.handleAuthorizationError(
        credential.id,
        authorizationError,
        `${this.constructorName} refresh`,
      );
      return await this.persistSnapshot(
        credential,
        params.organizationId,
        cacheKey,
        this.buildRevokedSnapshot(
          credential.id,
          grantedScopes,
          previousSnapshot,
          genfeedEvidence,
          refreshAttemptedAt,
        ),
      );
    }

    const profileEvidence = this.buildProfileEvidence(
      grantedScopes,
      userInfoResult,
      previousSnapshot,
      refreshAttemptedAt,
    );
    const statisticsEvidence = this.buildStatisticsEvidence(
      grantedScopes,
      userInfoResult,
      previousSnapshot,
      refreshAttemptedAt,
    );
    const ownedPostsEvidence = this.buildOwnedPostsEvidence(
      grantedScopes,
      tweetsResult,
      previousSnapshot,
      refreshAttemptedAt,
    );
    const publishingEvidence = this.buildPublishingCapabilityEvidence(
      grantedScopes,
      userInfoResult,
      previousSnapshot,
      refreshAttemptedAt,
    );
    const nativeAgeEvidence = this.buildNativeAccountAgeEvidence(
      grantedScopes,
      userInfoResult,
      previousSnapshot,
      refreshAttemptedAt,
    );
    const derivedPostEvidence = this.buildDerivedPostEvidence(
      ownedPostsEvidence,
      refreshAttemptedAt,
    );
    const evidence: TwitterAuthorizedSignalEvidence[] = [
      profileEvidence,
      statisticsEvidence,
      ownedPostsEvidence,
      publishingEvidence,
      ...derivedPostEvidence,
      nativeAgeEvidence,
      genfeedEvidence,
    ];
    const snapshot = twitterAuthorizedSignalsSnapshotSchema.parse({
      credentialId: credential.id,
      evidence,
      grantedScopes,
      platform: CredentialPlatform.TWITTER,
      refreshAttemptedAt,
      state: this.resolveSnapshotState(evidence),
    });

    return await this.persistSnapshot(
      credential,
      params.organizationId,
      cacheKey,
      snapshot,
    );
  }

  private async fetchUserInfo(
    accessToken: string,
  ): Promise<Record<string, unknown>> {
    const response = await firstValueFrom(
      this.httpService.get<TwitterUserInfoResponse>(
        `${this.endpoint}/users/me`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          params: { 'user.fields': USER_PROVIDER_FIELDS },
          timeout: TWITTER_SIGNAL_REQUEST_TIMEOUT_MS,
        },
      ),
    );

    return readRecord(response.data?.data);
  }

  private async fetchOwnedPosts(
    accessToken: string,
    userId: string,
  ): Promise<{
    hasMore: boolean;
    rawPostCount: number;
    posts: TwitterOwnedPostSignal[];
  }> {
    const response = await firstValueFrom(
      this.httpService.get<TwitterTweetListResponse>(
        `${this.endpoint}/users/${userId}/tweets`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          params: {
            max_results: TWITTER_POST_LIMIT,
            'tweet.fields': TWEET_PROVIDER_FIELDS,
          },
          timeout: TWITTER_SIGNAL_REQUEST_TIMEOUT_MS,
        },
      ),
    );
    const rawPosts = Array.isArray(response.data?.data)
      ? response.data.data
      : [];

    return {
      hasMore: typeof response.data?.meta?.next_token === 'string',
      rawPostCount: rawPosts.length,
      posts: rawPosts.flatMap((post) => {
        const id = readString(post.id);
        if (!id) {
          return [];
        }

        const referenced = Array.isArray(post.referenced_tweets)
          ? post.referenced_tweets
          : [];
        const metrics = post.public_metrics ?? {};

        return [
          {
            conversationId: readString(post.conversation_id),
            createdAt: readIsoTimestamp(post.created_at),
            createTime: readIsoToUnixSeconds(post.created_at),
            id,
            impressionCount: readNonNegativeInteger(metrics.impression_count),
            inReplyToUserId: readString(post.in_reply_to_user_id),
            isQuote: referenced.some((item) => item.type === 'quoted'),
            isReply: readString(post.in_reply_to_user_id) !== undefined,
            isRetweet: referenced.some((item) => item.type === 'retweeted'),
            likeCount: readNonNegativeInteger(metrics.like_count),
            quoteCount: readNonNegativeInteger(metrics.quote_count),
            replyCount: readNonNegativeInteger(metrics.reply_count),
            replySettings: readString(post.reply_settings),
            retweetCount: readNonNegativeInteger(metrics.retweet_count),
            text: readString(post.text),
          },
        ];
      }),
    };
  }

  private async requestWithRetry<T>(request: () => Promise<T>): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt < TWITTER_SIGNAL_MAX_ATTEMPTS; attempt += 1) {
      try {
        return await request();
      } catch (error: unknown) {
        lastError = error;
        if (
          !isTwitterRateLimitError(error) ||
          attempt === TWITTER_SIGNAL_MAX_ATTEMPTS - 1
        ) {
          throw error;
        }

        const delayMs = getTwitterRetryAfterMs(
          error,
          TWITTER_SIGNAL_RETRY_FALLBACK_MS * 2 ** attempt,
          TWITTER_SIGNAL_RETRY_MAX_MS,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw lastError;
  }

  private async settle<T>(
    promise: Promise<T> | undefined,
  ): Promise<{ error?: unknown; value?: T }> {
    if (!promise) {
      return {};
    }

    try {
      return { value: await promise };
    } catch (error: unknown) {
      return { error };
    }
  }

  private isAuthorizationFailure(error: unknown): boolean {
    return (
      !isTwitterScopeOrTierError(error) && isTwitterAuthorizationError(error)
    );
  }

  private buildProfileEvidence(
    grantedScopes: string[],
    result: { error?: unknown; value?: Record<string, unknown> },
    previousSnapshot: TwitterAuthorizedSignalsSnapshot | undefined,
    observedAt: string,
  ): TwitterAuthorizedSignalEvidence {
    const requiredScopes = [USERS_READ_SCOPE];
    if (!grantedScopes.includes(USERS_READ_SCOPE) || !result.value) {
      return this.buildUnavailableEvidence(
        'profile-completeness-signal',
        requiredScopes,
        grantedScopes,
        result.error,
        previousSnapshot,
        observedAt,
      );
    }

    const value = {
      createdAt: readIsoTimestamp(result.value.created_at),
      description: readString(result.value.description),
      isProtected: readBoolean(result.value.protected),
      isVerified: readBoolean(result.value.verified),
      location: readString(result.value.location),
      name: readString(result.value.name),
      profileImageUrl: readHttpUrl(result.value.profile_image_url),
      url: readHttpUrl(result.value.url),
      username: readString(result.value.username),
      verifiedType: readString(result.value.verified_type),
    };
    const fieldAvailability = Object.fromEntries(
      Object.entries(PROFILE_FIELDS).map(
        ([field, scope]) =>
          [
            field,
            !grantedScopes.includes(scope)
              ? 'permission_limited'
              : value[field as keyof typeof value] === undefined
                ? 'unavailable'
                : 'available',
          ] as const,
      ),
    );
    const scope = this.buildScope(requiredScopes, grantedScopes);

    return {
      fieldAvailability,
      key: 'profile-completeness-signal',
      observedAt,
      provenance: 'platform_verified',
      scope,
      staleAt: null,
      status:
        scope.missing.length > 0
          ? 'permission_limited'
          : Object.values(value).every((item) => item === undefined)
            ? 'unavailable'
            : 'available',
      value,
    };
  }

  private buildStatisticsEvidence(
    grantedScopes: string[],
    result: { error?: unknown; value?: Record<string, unknown> },
    previousSnapshot: TwitterAuthorizedSignalsSnapshot | undefined,
    observedAt: string,
  ): TwitterAuthorizedSignalEvidence {
    const requiredScopes = [USERS_READ_SCOPE];
    const metrics = readRecord(result.value?.public_metrics);
    if (!grantedScopes.includes(USERS_READ_SCOPE) || !result.value) {
      return this.buildUnavailableEvidence(
        'profile-statistics-snapshot',
        requiredScopes,
        grantedScopes,
        result.error,
        previousSnapshot,
        observedAt,
      );
    }

    const value = {
      followersCount: readNonNegativeInteger(metrics.followers_count),
      followingCount: readNonNegativeInteger(metrics.following_count),
      likeCount: readNonNegativeInteger(metrics.like_count),
      listedCount: readNonNegativeInteger(metrics.listed_count),
      tweetCount: readNonNegativeInteger(metrics.tweet_count),
    };
    const fieldAvailability = Object.fromEntries(
      Object.entries(STATISTICS_FIELDS).map(
        ([field, scope]) =>
          [
            field,
            !grantedScopes.includes(scope)
              ? 'permission_limited'
              : value[field as keyof typeof value] === undefined
                ? 'unavailable'
                : 'available',
          ] as const,
      ),
    );
    const scope = this.buildScope(requiredScopes, grantedScopes);

    return {
      fieldAvailability,
      key: 'profile-statistics-snapshot',
      observedAt,
      provenance: 'platform_verified',
      scope,
      staleAt: null,
      status:
        scope.missing.length > 0
          ? 'permission_limited'
          : Object.values(value).every((item) => item === undefined)
            ? 'unavailable'
            : 'available',
      value,
    };
  }

  private buildOwnedPostsEvidence(
    grantedScopes: string[],
    result: {
      error?: unknown;
      value?: {
        hasMore: boolean;
        rawPostCount: number;
        posts: TwitterOwnedPostSignal[];
      };
    },
    previousSnapshot: TwitterAuthorizedSignalsSnapshot | undefined,
    observedAt: string,
  ): TwitterAuthorizedSignalEvidence {
    const requiredScopes = [TWEET_READ_SCOPE];
    if (!result.value) {
      return this.buildUnavailableEvidence(
        'owned-posts-snapshot',
        requiredScopes,
        grantedScopes,
        result.error,
        previousSnapshot,
        observedAt,
      );
    }

    const scope = this.buildScope(requiredScopes, grantedScopes);
    const fieldAvailability = Object.fromEntries(
      POST_FIELDS.map(
        (field) =>
          [
            field,
            result.value?.posts.length === 0 ||
            result.value?.posts.every((post) => post[field] !== undefined)
              ? 'available'
              : 'unavailable',
          ] as const,
      ),
    );
    const malformedResponse =
      result.value.rawPostCount > 0 && result.value.posts.length === 0;

    return {
      fieldAvailability,
      key: 'owned-posts-snapshot',
      observedAt,
      provenance: 'platform_verified',
      ...(malformedResponse ? { reason: 'empty_response' as const } : {}),
      scope,
      staleAt: null,
      status: malformedResponse
        ? 'unavailable'
        : result.value.posts.length === 0
          ? 'empty'
          : 'available',
      value: {
        hasMore: result.value.hasMore,
        posts: result.value.posts,
      },
    };
  }

  private buildPublishingCapabilityEvidence(
    grantedScopes: string[],
    result: { error?: unknown; value?: Record<string, unknown> },
    previousSnapshot: TwitterAuthorizedSignalsSnapshot | undefined,
    observedAt: string,
  ): TwitterAuthorizedSignalEvidence {
    const requiredScopes = [TWEET_WRITE_SCOPE];
    if (!grantedScopes.includes(TWEET_WRITE_SCOPE)) {
      return this.buildUnavailableEvidence(
        'publishing-capability-snapshot',
        requiredScopes,
        grantedScopes,
        result.error,
        previousSnapshot,
        observedAt,
      );
    }

    const value = {
      canPublish: true,
      canUploadMedia: grantedScopes.includes(MEDIA_WRITE_SCOPE),
      isProtected: result.value
        ? readBoolean(result.value.protected)
        : undefined,
    };
    const fieldAvailability = toFieldAvailability(
      PUBLISHING_FIELDS.map((field) => [
        field,
        field === 'isProtected' && value.isProtected === undefined
          ? grantedScopes.includes(USERS_READ_SCOPE)
            ? 'unavailable'
            : 'permission_limited'
          : 'available',
      ]),
    );

    return {
      fieldAvailability,
      key: 'publishing-capability-snapshot',
      observedAt,
      provenance: 'platform_verified',
      scope: {
        ...this.buildScope(requiredScopes, grantedScopes),
        granted: grantedScopes.filter((scope) =>
          [TWEET_WRITE_SCOPE, MEDIA_WRITE_SCOPE].includes(scope),
        ),
      },
      staleAt: null,
      status: 'available',
      value,
    };
  }

  private buildNativeAccountAgeEvidence(
    grantedScopes: string[],
    result: { error?: unknown; value?: Record<string, unknown> },
    previousSnapshot: TwitterAuthorizedSignalsSnapshot | undefined,
    observedAt: string,
  ): TwitterAuthorizedSignalEvidence {
    const requiredScopes = [USERS_READ_SCOPE];
    const createdAt = result.value
      ? readIsoTimestamp(result.value.created_at)
      : undefined;
    const createTime = result.value
      ? readIsoToUnixSeconds(result.value.created_at)
      : undefined;
    if (!grantedScopes.includes(USERS_READ_SCOPE) || !result.value) {
      return this.buildUnavailableEvidence(
        'native-account-age',
        requiredScopes,
        grantedScopes,
        result.error,
        previousSnapshot,
        observedAt,
      );
    }

    return {
      fieldAvailability: {
        createdAt: createdAt ? 'available' : 'unavailable',
        createTime: createTime === undefined ? 'unavailable' : 'available',
      },
      key: 'native-account-age',
      observedAt,
      provenance: 'platform_verified',
      scope: this.buildScope(requiredScopes, grantedScopes),
      staleAt: null,
      status: createdAt ? 'available' : 'unavailable',
      value: createdAt ? { createdAt, createTime } : {},
    };
  }

  private buildDerivedPostEvidence(
    ownedPosts: TwitterAuthorizedSignalEvidence,
    observedAt: string,
  ): TwitterAuthorizedSignalEvidence[] {
    if (ownedPosts.key !== 'owned-posts-snapshot') {
      throw new Error('X owned-post evidence is missing');
    }

    const posts = ownedPosts.value?.posts ?? [];
    const firstOriginal =
      posts.find((post) => !post.isReply && !post.isRetweet) ?? posts[0];
    const common = {
      fieldAvailability: ownedPosts.fieldAvailability,
      observedAt: ownedPosts.observedAt ?? observedAt,
      provenance: 'platform_verified' as const,
      ...(ownedPosts.reason ? { reason: ownedPosts.reason } : {}),
      scope: ownedPosts.scope,
      staleAt: ownedPosts.staleAt,
      status: ownedPosts.status,
    };

    return [
      {
        ...common,
        key: 'first-upload-platform-signal',
        value: firstOriginal
          ? {
              createdAt: firstOriginal.createdAt,
              createTime: firstOriginal.createTime,
              post: firstOriginal,
            }
          : {},
      },
      {
        ...common,
        key: 'owned-post-metrics-snapshot',
        value: { posts },
      },
    ];
  }

  private buildUnavailableEvidence(
    key: PlatformEvidenceKey,
    requiredScopes: string[],
    grantedScopes: string[],
    error: unknown,
    previousSnapshot: TwitterAuthorizedSignalsSnapshot | undefined,
    observedAt: string,
  ): TwitterAuthorizedSignalEvidence {
    const scope = this.buildScope(requiredScopes, grantedScopes);
    const reason: TwitterAuthorizedSignalReason =
      scope.missing.length > 0 || isTwitterScopeOrTierError(error)
        ? 'missing_scope'
        : isTwitterRateLimitError(error)
          ? 'rate_limited'
          : 'provider_error';
    const previous = previousSnapshot?.evidence.find(
      (evidence) => evidence.key === key,
    );
    const reportedScope =
      key === 'publishing-capability-snapshot'
        ? {
            ...scope,
            granted: grantedScopes.filter((grantedScope) =>
              [TWEET_WRITE_SCOPE, MEDIA_WRITE_SCOPE].includes(grantedScope),
            ),
          }
        : scope;

    if (previous && reason !== 'missing_scope') {
      return {
        ...previous,
        reason,
        scope: reportedScope,
        staleAt: observedAt,
        status: 'stale',
      };
    }

    const fieldNames = this.fieldNamesForKey(key);
    const effectiveScope =
      isTwitterScopeOrTierError(error) && scope.missing.length === 0
        ? { granted: [], missing: requiredScopes, required: requiredScopes }
        : reportedScope;

    return {
      fieldAvailability: Object.fromEntries(
        fieldNames.map((field) => [
          field,
          reason === 'missing_scope' ? 'permission_limited' : 'unavailable',
        ]),
      ),
      key,
      observedAt,
      provenance: 'platform_verified',
      reason,
      scope: effectiveScope,
      staleAt: null,
      status: reason === 'missing_scope' ? 'permission_limited' : 'unavailable',
    } as TwitterAuthorizedSignalEvidence;
  }

  private fieldNamesForKey(key: PlatformEvidenceKey): readonly string[] {
    if (key === 'profile-completeness-signal') {
      return Object.keys(PROFILE_FIELDS);
    }
    if (key === 'profile-statistics-snapshot') {
      return Object.keys(STATISTICS_FIELDS);
    }
    if (key === 'publishing-capability-snapshot') {
      return PUBLISHING_FIELDS;
    }
    if (key === 'native-account-age') {
      return ['createdAt', 'createTime'];
    }
    return POST_FIELDS;
  }

  private buildScope(required: string[], grantedScopes: string[]) {
    return {
      granted: grantedScopes.filter((scope) => required.includes(scope)),
      missing: required.filter((scope) => !grantedScopes.includes(scope)),
      required,
    };
  }

  private async buildGenfeedEvidence(
    credential: CredentialDocument,
    organizationId: string,
    observedAt: string,
  ): Promise<TwitterAuthorizedSignalEvidence> {
    const rows = await this.prisma.post.findMany({
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        lastAttemptAt: true,
        publicationDate: true,
        publishedAt: true,
        targetExecutionState: true,
        updatedAt: true,
      },
      take: TWITTER_POST_LIMIT,
      where: scopedWhere(organizationId, {
        credentialId: credential.id,
        targetExecutionState: {
          in: [
            TargetExecutionState.SCHEDULED,
            TargetExecutionState.PUBLISHING,
            TargetExecutionState.PUBLISHED,
            TargetExecutionState.FAILED,
            TargetExecutionState.PAUSED,
            TargetExecutionState.CANCELLED,
            TargetExecutionState.SKIPPED,
          ],
        },
      }),
    });
    const attempts = rows.flatMap((row) => {
      const outcome = mapOutcome(row.targetExecutionState);
      if (!outcome) {
        return [];
      }
      const attemptedAt =
        row.lastAttemptAt ??
        row.publishedAt ??
        row.publicationDate ??
        row.updatedAt;

      return [
        { attemptedAt: attemptedAt.toISOString(), outcome, postId: row.id },
      ];
    });

    return {
      fieldAvailability: {
        attemptedAt: 'available',
        outcome: 'available',
        postId: 'available',
      },
      key: 'genfeed-publish-activity',
      observedAt,
      provenance: 'genfeed_observed',
      scope: { granted: [], missing: [], required: [] },
      staleAt: null,
      status: attempts.length > 0 ? 'available' : 'empty',
      value: { attempts },
    };
  }

  private buildRevokedSnapshot(
    credentialId: string,
    grantedScopes: string[],
    previousSnapshot: TwitterAuthorizedSignalsSnapshot | undefined,
    genfeedEvidence: TwitterAuthorizedSignalEvidence,
    refreshAttemptedAt: string,
  ): TwitterAuthorizedSignalsSnapshot {
    const keys: PlatformEvidenceKey[] = [
      'profile-completeness-signal',
      'profile-statistics-snapshot',
      'owned-posts-snapshot',
      'publishing-capability-snapshot',
      'first-upload-platform-signal',
      'owned-post-metrics-snapshot',
      'native-account-age',
    ];
    const evidence = keys.map((key) => {
      const previous = previousSnapshot?.evidence.find(
        (item) => item.key === key,
      );
      if (previous) {
        const requiredScopes = this.requiredScopesForKey(key);
        const scope = this.buildScope(requiredScopes, grantedScopes);
        return {
          ...previous,
          reason: 'authorization_revoked' as const,
          scope:
            key === 'publishing-capability-snapshot'
              ? {
                  ...scope,
                  granted: grantedScopes.filter((grantedScope) =>
                    [TWEET_WRITE_SCOPE, MEDIA_WRITE_SCOPE].includes(
                      grantedScope,
                    ),
                  ),
                }
              : scope,
          staleAt: refreshAttemptedAt,
          status: 'revoked' as const,
        };
      }

      return {
        ...this.buildUnavailableEvidence(
          key,
          this.requiredScopesForKey(key),
          grantedScopes,
          undefined,
          undefined,
          refreshAttemptedAt,
        ),
        reason: 'authorization_revoked' as const,
        staleAt: refreshAttemptedAt,
        status: 'revoked' as const,
      };
    });

    return twitterAuthorizedSignalsSnapshotSchema.parse({
      credentialId,
      evidence: [...evidence, genfeedEvidence],
      grantedScopes,
      platform: CredentialPlatform.TWITTER,
      refreshAttemptedAt,
      state: 'revoked',
    });
  }

  private requiredScopesForKey(key: PlatformEvidenceKey): string[] {
    if (
      key === 'profile-completeness-signal' ||
      key === 'profile-statistics-snapshot' ||
      key === 'native-account-age'
    ) {
      return [USERS_READ_SCOPE];
    }
    if (key === 'publishing-capability-snapshot') {
      return [TWEET_WRITE_SCOPE];
    }
    return [TWEET_READ_SCOPE];
  }

  private resolveSnapshotState(
    evidence: TwitterAuthorizedSignalEvidence[],
  ): TwitterAuthorizedSignalsSnapshot['state'] {
    const platformEvidence = evidence.filter(
      (item) => item.provenance === 'platform_verified',
    );

    if (platformEvidence.every((item) => item.status === 'stale')) {
      return 'stale';
    }

    const ownedPosts = platformEvidence.find(
      (item) => item.key === 'owned-posts-snapshot',
    );
    if (
      ownedPosts?.status === 'empty' &&
      platformEvidence.every((item) =>
        ['available', 'empty'].includes(item.status),
      )
    ) {
      return 'empty';
    }

    return platformEvidence.every((item) =>
      ['available', 'empty'].includes(item.status),
    )
      ? 'full'
      : 'partial';
  }

  private resolveGrantedScopes(
    explicitScopes: readonly string[] | string | undefined,
    credential: Pick<CredentialDocument, 'grantedScopes' | 'warmupSignals'>,
    previousSnapshot: TwitterAuthorizedSignalsSnapshot | undefined,
  ): string[] {
    const stored = readRecord(credential.warmupSignals);
    const authorization = readRecord(stored[TWITTER_AUTHORIZATION_STORAGE_KEY]);
    const persistedScopes = Array.isArray(credential.grantedScopes)
      ? credential.grantedScopes.filter((scope) => typeof scope === 'string')
      : [];

    return parseGrantedOAuthScopes(
      explicitScopes ??
        (persistedScopes.length > 0 ? persistedScopes : undefined) ??
        authorization.grantedScopes ??
        previousSnapshot?.grantedScopes,
    );
  }

  private hasStoredScopeObservation(
    credential: CredentialDocument,
    previousSnapshot: TwitterAuthorizedSignalsSnapshot | undefined,
  ): boolean {
    const stored = readRecord(credential.warmupSignals);
    const authorization = readRecord(stored[TWITTER_AUTHORIZATION_STORAGE_KEY]);
    const persistedScopes = Array.isArray(credential.grantedScopes)
      ? credential.grantedScopes
      : [];

    return (
      persistedScopes.length > 0 ||
      Array.isArray(authorization.grantedScopes) ||
      previousSnapshot !== undefined
    );
  }

  private readStoredSnapshot(
    credential: CredentialDocument,
  ): TwitterAuthorizedSignalsSnapshot | undefined {
    const stored = readRecord(credential.warmupSignals);
    const parsed = twitterAuthorizedSignalsSnapshotSchema.safeParse(
      stored[TWITTER_AUTHORIZED_SIGNALS_STORAGE_KEY],
    );

    return parsed.success ? parsed.data : undefined;
  }

  private async persistSnapshot(
    credential: CredentialDocument,
    organizationId: string,
    cacheKey: string,
    snapshot: TwitterAuthorizedSignalsSnapshot,
  ): Promise<TwitterAuthorizedSignalsSnapshot> {
    await this.credentialsService.mergeWarmupSignals(
      credential.id,
      organizationId,
      {
        [TWITTER_AUTHORIZATION_STORAGE_KEY]: {
          grantedScopes: snapshot.grantedScopes,
          observedAt: snapshot.refreshAttemptedAt,
        },
        [TWITTER_AUTHORIZED_SIGNALS_STORAGE_KEY]: snapshot,
      },
    );
    if (credential.brandId) {
      await this.socialWarmupEnrollmentsService.syncTwitterAuthorizedSnapshot({
        brandId: credential.brandId,
        credentialId: credential.id,
        organizationId,
        snapshot,
      });
    }
    await this.cacheService.set(cacheKey, snapshot, {
      tags: [
        CACHE_TAGS.TWITTER_AUTHORIZED_SIGNALS,
        SCOPED_CACHE_TAGS.TWITTER_AUTHORIZED_SIGNALS(organizationId),
        credential.id,
      ],
      ttl:
        snapshot.state === 'stale' || snapshot.state === 'revoked'
          ? TWITTER_STALE_SIGNALS_CACHE_TTL_SECONDS
          : TWITTER_AUTHORIZED_SIGNALS_CACHE_TTL_SECONDS,
    });

    this.loggerService.log(`${this.constructorName} refresh completed`, {
      credentialId: credential.id,
      state: snapshot.state,
    });
    return snapshot;
  }
}
