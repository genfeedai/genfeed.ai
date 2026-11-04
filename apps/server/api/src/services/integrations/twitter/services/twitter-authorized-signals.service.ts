import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { SocialWarmupEnrollmentsService } from '@api/collections/social-warmup-enrollments/services/social-warmup-enrollments.service';
import {
  CACHE_PATTERNS,
  CACHE_TAGS,
  SCOPED_CACHE_TAGS,
} from '@api/common/constants/cache-patterns.constants';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { CacheService } from '@api/services/cache/cache.service';
import { buildGenfeedPublishEvidence } from '@api/services/integrations/_shared/authorized-signals-genfeed-evidence.util';
import {
  retryProviderRequest,
  settleProviderRequest,
} from '@api/services/integrations/_shared/authorized-signals-request.util';
import {
  persistAuthorizedSnapshot,
  readStoredAuthorizedSnapshot,
} from '@api/services/integrations/_shared/authorized-signals-storage.util';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import {
  getTwitterRetryAfterMs,
  isTwitterAuthorizationError,
  isTwitterRateLimitError,
  isTwitterScopeOrTierError,
} from '@api/services/integrations/twitter/utils/twitter-api-error.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  CredentialPlatform,
  toPrismaCredentialPlatform,
} from '@genfeedai/contracts';
import {
  type TwitterAuthorizedSignalEvidence,
  type TwitterAuthorizedSignalsSnapshot,
  type TwitterOwnedPostSignal,
  twitterAuthorizedSignalsSnapshotSchema,
} from '@genfeedai/contracts/api-types/contracts/twitter-authorized-signals.contract';
import { parseGrantedOAuthScopes } from '@genfeedai/helpers';
import { readRawString, readRecord } from '@genfeedai/utils/data/extract.util';
import { LoggerService } from '@libs/logger/logger.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import {
  assembleTwitterAuthorizedSnapshot,
  buildTwitterRevokedSnapshot,
  readIsoTimestamp,
  readIsoToUnixSeconds,
  readNonNegativeInteger,
  TWEET_READ_SCOPE,
  type TwitterOwnedPostsFetch,
  type TwitterSettledResult,
  USERS_READ_SCOPE,
} from './twitter-authorized-signals-evidence.mapper';

const TWITTER_AUTHORIZED_SIGNALS_CACHE_TTL_SECONDS = 5 * 60;
const TWITTER_STALE_SIGNALS_CACHE_TTL_SECONDS = 60;
const TWITTER_AUTHORIZED_SIGNALS_STORAGE_KEY = 'twitterAuthorized';
const TWITTER_AUTHORIZATION_STORAGE_KEY = 'twitterAuthorization';
const TWITTER_SIGNAL_MAX_ATTEMPTS = 2;
const TWITTER_SIGNAL_RETRY_FALLBACK_MS = 1_000;
const TWITTER_SIGNAL_RETRY_MAX_MS = 5_000;
const TWITTER_SIGNAL_REQUEST_TIMEOUT_MS = 10_000;
const TWITTER_POST_LIMIT = 20;

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

type TwitterUserInfoResponse = {
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
};

type TwitterTweetListResponse = {
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
};

export type RefreshTwitterAuthorizedSignalsParams = {
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
};

type TwitterSignalsRefreshContext = {
  cacheKey: string;
  credential: CredentialDocument;
  genfeedEvidence: TwitterAuthorizedSignalEvidence;
  grantedScopes: string[];
  organizationId: string;
  previousSnapshot: TwitterAuthorizedSignalsSnapshot | undefined;
  refreshAttemptedAt: string;
};

type TwitterSignalsCredentialResolution =
  | { kind: 'cached'; snapshot: TwitterAuthorizedSignalsSnapshot }
  | { context: TwitterSignalsRefreshContext; kind: 'revoked' }
  | {
      accessToken: string;
      context: TwitterSignalsRefreshContext;
      kind: 'authorized';
    };

type TwitterSignalsProviderFetch =
  | { kind: 'revoked'; snapshot: TwitterAuthorizedSignalsSnapshot }
  | {
      kind: 'fetched';
      tweetsResult: TwitterSettledResult<TwitterOwnedPostsFetch>;
      userInfoResult: TwitterSettledResult<Record<string, unknown>>;
    };

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
    const resolved = await this.resolveRefreshCredential(params);
    if (resolved.kind === 'cached') {
      return resolved.snapshot;
    }

    const { context } = resolved;
    if (resolved.kind === 'revoked') {
      return await this.persistSnapshot(
        context.credential,
        context.organizationId,
        context.cacheKey,
        buildTwitterRevokedSnapshot(
          context.credential.id,
          context.grantedScopes,
          context.previousSnapshot,
          context.genfeedEvidence,
          context.refreshAttemptedAt,
        ),
      );
    }

    const fetched = await this.fetchProviderSignals(
      resolved.accessToken,
      context,
    );
    const snapshot =
      fetched.kind === 'revoked'
        ? fetched.snapshot
        : this.assembleAuthorizedSnapshot(
            context,
            fetched.userInfoResult,
            fetched.tweetsResult,
          );

    return await this.persistSnapshot(
      context.credential,
      context.organizationId,
      context.cacheKey,
      snapshot,
    );
  }

  private async resolveRefreshCredential(
    params: RefreshTwitterAuthorizedSignalsParams,
  ): Promise<TwitterSignalsCredentialResolution> {
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
        return { kind: 'cached', snapshot: cachedSnapshot.data };
      }
    }

    const refreshAttemptedAt = new Date().toISOString();
    const grantedScopes = this.resolveGrantedScopes(
      params.grantedScopes,
      credential,
      previousSnapshot,
    );
    const context: TwitterSignalsRefreshContext = {
      cacheKey,
      credential,
      genfeedEvidence: await buildGenfeedPublishEvidence({
        credentialId: credential.id,
        key: 'genfeed-publish-activity',
        limit: TWITTER_POST_LIMIT,
        observedAt: refreshAttemptedAt,
        organizationId: params.organizationId,
        prisma: this.prisma,
      }),
      grantedScopes,
      organizationId: params.organizationId,
      previousSnapshot,
      refreshAttemptedAt,
    };

    if (!credential.isConnected && !params.accessToken) {
      return { context, kind: 'revoked' };
    }

    try {
      return {
        accessToken: await this.resolveAccessToken(params, context),
        context,
        kind: 'authorized',
      };
    } catch (error: unknown) {
      if (
        await this.twitterService.handleAuthorizationError(
          credential.id,
          error,
          `${this.constructorName} refresh`,
        )
      ) {
        return { context, kind: 'revoked' };
      }
      throw error;
    }
  }

  private async resolveAccessToken(
    params: RefreshTwitterAuthorizedSignalsParams,
    context: TwitterSignalsRefreshContext,
  ): Promise<string> {
    const { credential } = context;
    const shouldDiscoverScopes =
      params.accessToken === undefined &&
      params.grantedScopes === undefined &&
      !this.hasStoredScopeObservation(credential, context.previousSnapshot) &&
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
    // Persist discovered scopes before decrypt so a later token failure still
    // records the observation from the refreshed credential.
    if (params.grantedScopes === undefined) {
      context.grantedScopes = this.resolveGrantedScopes(
        undefined,
        validCredential,
        context.previousSnapshot,
      );
    }
    if (params.accessToken) {
      return params.accessToken;
    }
    if (!validCredential.accessToken) {
      throw new Error('X credential is missing an access token');
    }
    return EncryptionUtil.decrypt(validCredential.accessToken);
  }

  private async fetchProviderSignals(
    accessToken: string,
    context: TwitterSignalsRefreshContext,
  ): Promise<TwitterSignalsProviderFetch> {
    const { credential, grantedScopes } = context;
    const userInfoPromise = grantedScopes.includes(USERS_READ_SCOPE)
      ? this.requestWithRetry(() => this.fetchUserInfo(accessToken))
      : undefined;
    const userInfoResult = await this.settle(userInfoPromise);
    const userId =
      readRawString(userInfoResult.value?.id) ??
      readRawString(credential.externalId);
    const tweetsPromise =
      grantedScopes.includes(TWEET_READ_SCOPE) && userId
        ? this.requestWithRetry(() => this.fetchOwnedPosts(accessToken, userId))
        : undefined;
    const tweetsResult = await this.settle(tweetsPromise);
    const authorizationError = [userInfoResult.error, tweetsResult.error]
      .filter((error) => error !== undefined)
      .find((error) => this.isAuthorizationFailure(error));

    if (authorizationError) {
      await this.twitterService.handleAuthorizationError(
        credential.id,
        authorizationError,
        `${this.constructorName} refresh`,
      );
      return {
        kind: 'revoked',
        snapshot: buildTwitterRevokedSnapshot(
          credential.id,
          grantedScopes,
          context.previousSnapshot,
          context.genfeedEvidence,
          context.refreshAttemptedAt,
        ),
      };
    }

    return { kind: 'fetched', tweetsResult, userInfoResult };
  }

  private assembleAuthorizedSnapshot(
    context: TwitterSignalsRefreshContext,
    userInfoResult: TwitterSettledResult<Record<string, unknown>>,
    tweetsResult: TwitterSettledResult<TwitterOwnedPostsFetch>,
  ): TwitterAuthorizedSignalsSnapshot {
    return assembleTwitterAuthorizedSnapshot({
      credentialId: context.credential.id,
      genfeedEvidence: context.genfeedEvidence,
      grantedScopes: context.grantedScopes,
      observedAt: context.refreshAttemptedAt,
      previousSnapshot: context.previousSnapshot,
      tweetsResult,
      userInfoResult,
    });
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
  ): Promise<TwitterOwnedPostsFetch> {
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
      posts: rawPosts.flatMap((post) => this.mapOwnedPost(post)),
      rawPostCount: rawPosts.length,
    };
  }

  private mapOwnedPost(
    post: NonNullable<TwitterTweetListResponse['data']>[number],
  ): TwitterOwnedPostSignal[] {
    const id = readRawString(post.id);
    if (!id) {
      return [];
    }

    const referenced = Array.isArray(post.referenced_tweets)
      ? post.referenced_tweets
      : [];
    const metrics = post.public_metrics ?? {};

    return [
      {
        conversationId: readRawString(post.conversation_id),
        createdAt: readIsoTimestamp(post.created_at),
        createTime: readIsoToUnixSeconds(post.created_at),
        id,
        impressionCount: readNonNegativeInteger(metrics.impression_count),
        inReplyToUserId: readRawString(post.in_reply_to_user_id),
        isQuote: referenced.some((item) => item.type === 'quoted'),
        isReply: readRawString(post.in_reply_to_user_id) !== undefined,
        isRetweet: referenced.some((item) => item.type === 'retweeted'),
        likeCount: readNonNegativeInteger(metrics.like_count),
        quoteCount: readNonNegativeInteger(metrics.quote_count),
        replyCount: readNonNegativeInteger(metrics.reply_count),
        replySettings: readRawString(post.reply_settings),
        retweetCount: readNonNegativeInteger(metrics.retweet_count),
        text: readRawString(post.text),
      },
    ];
  }

  private async requestWithRetry<T>(request: () => Promise<T>): Promise<T> {
    return retryProviderRequest(request, {
      getDelayMs: (error, attempt) =>
        getTwitterRetryAfterMs(
          error,
          TWITTER_SIGNAL_RETRY_FALLBACK_MS * 2 ** attempt,
          TWITTER_SIGNAL_RETRY_MAX_MS,
        ),
      isRetryable: isTwitterRateLimitError,
      maxAttempts: TWITTER_SIGNAL_MAX_ATTEMPTS,
    });
  }

  private async settle<T>(
    promise: Promise<T> | undefined,
  ): Promise<TwitterSettledResult<T>> {
    return settleProviderRequest(promise);
  }

  private isAuthorizationFailure(error: unknown): boolean {
    return (
      !isTwitterScopeOrTierError(error) && isTwitterAuthorizationError(error)
    );
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
    return readStoredAuthorizedSnapshot(
      credential,
      TWITTER_AUTHORIZED_SIGNALS_STORAGE_KEY,
      twitterAuthorizedSignalsSnapshotSchema,
    );
  }

  private async persistSnapshot(
    credential: CredentialDocument,
    organizationId: string,
    cacheKey: string,
    snapshot: TwitterAuthorizedSignalsSnapshot,
  ): Promise<TwitterAuthorizedSignalsSnapshot> {
    return await persistAuthorizedSnapshot({
      authorizationStorageKey: TWITTER_AUTHORIZATION_STORAGE_KEY,
      cacheKey,
      cacheService: this.cacheService,
      cacheTags: [
        CACHE_TAGS.TWITTER_AUTHORIZED_SIGNALS,
        SCOPED_CACHE_TAGS.TWITTER_AUTHORIZED_SIGNALS(organizationId),
      ],
      credential,
      credentialsService: this.credentialsService,
      freshTtlSeconds: TWITTER_AUTHORIZED_SIGNALS_CACHE_TTL_SECONDS,
      loggerName: this.constructorName,
      loggerService: this.loggerService,
      organizationId,
      signalsStorageKey: TWITTER_AUTHORIZED_SIGNALS_STORAGE_KEY,
      snapshot,
      staleTtlSeconds: TWITTER_STALE_SIGNALS_CACHE_TTL_SECONDS,
      syncEnrollment: (params) =>
        this.socialWarmupEnrollmentsService.syncTwitterAuthorizedSnapshot(
          params,
        ),
    });
  }
}
