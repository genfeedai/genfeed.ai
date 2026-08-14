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
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import {
  getInstagramRetryAfterMs,
  isInstagramAuthorizationError,
  isInstagramProfessionalAccountError,
  isInstagramRateLimitError,
  isInstagramScopeError,
  parseInstagramGrantedScopes,
} from '@api/services/integrations/instagram/utils/instagram-error.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  type InstagramAuthorizedSignalEvidence,
  type InstagramAuthorizedSignalReason,
  type InstagramAuthorizedSignalsSnapshot,
  type InstagramMediaPerformanceSignal,
  type InstagramOwnedMediaSignal,
  instagramAuthorizedSignalStatusValues,
  instagramAuthorizedSignalsSnapshotSchema,
} from '@api-types/contracts/instagram-authorized-signals.contract';
import { CredentialPlatform, TargetExecutionState } from '@genfeedai/enums';
import { scopedWhere } from '@genfeedai/server';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

const INSTAGRAM_AUTHORIZED_SIGNALS_CACHE_TTL_SECONDS = 5 * 60;
const INSTAGRAM_STALE_SIGNALS_CACHE_TTL_SECONDS = 60;
const INSTAGRAM_AUTHORIZED_SIGNALS_STORAGE_KEY = 'instagramAuthorized';
const INSTAGRAM_AUTHORIZATION_STORAGE_KEY = 'instagramAuthorization';
const INSTAGRAM_SIGNAL_MAX_ATTEMPTS = 2;
const INSTAGRAM_SIGNAL_RETRY_FALLBACK_MS = 1_000;
const INSTAGRAM_SIGNAL_RETRY_MAX_MS = 5_000;
const INSTAGRAM_SIGNAL_REQUEST_TIMEOUT_MS = 10_000;
const INSTAGRAM_MEDIA_LIMIT = 20;

const BASIC_SCOPE = 'instagram_basic';
const PUBLISH_SCOPE = 'instagram_content_publish';
const INSIGHTS_SCOPE = 'instagram_manage_insights';
const PAGES_SCOPE = 'pages_show_list';

const PROFILE_FIELDS = [
  'accountType',
  'biography',
  'followersCount',
  'followsCount',
  'mediaCount',
  'name',
  'profilePictureUrl',
  'username',
  'website',
] as const;

const MEDIA_FIELDS = [
  'caption',
  'commentCount',
  'createTime',
  'id',
  'likeCount',
  'mediaProductType',
  'mediaType',
  'permalink',
  'shortcode',
] as const;

const PUBLISHING_FIELDS = [
  'accountType',
  'canPublish',
  'isProfessionalAccount',
] as const;

const PERFORMANCE_FIELDS = [
  'commentCount',
  'id',
  'impressions',
  'likeCount',
  'reach',
  'saved',
  'shares',
  'totalInteractions',
] as const;

type InstagramSignalFieldStatus =
  (typeof instagramAuthorizedSignalStatusValues)[number];

function toFieldAvailability(
  entries: ReadonlyArray<readonly [string, InstagramSignalFieldStatus]>,
): Record<string, InstagramSignalFieldStatus> {
  return Object.fromEntries(entries);
}

const PROFILE_PROVIDER_FIELDS =
  'id,username,name,biography,website,profile_picture_url,followers_count,follows_count,media_count,account_type';
const MEDIA_PROVIDER_FIELDS =
  'id,caption,media_type,media_product_type,timestamp,permalink,like_count,comments_count,shortcode';
const MEDIA_INSIGHTS_FIELDS = `${MEDIA_PROVIDER_FIELDS},insights.metric(impressions,reach,saved,shares,total_interactions)`;

interface InstagramUserResponse {
  account_type?: unknown;
  biography?: unknown;
  followers_count?: unknown;
  follows_count?: unknown;
  id?: unknown;
  media_count?: unknown;
  name?: unknown;
  profile_picture_url?: unknown;
  username?: unknown;
  website?: unknown;
}

interface InstagramMediaNode {
  caption?: unknown;
  comments_count?: unknown;
  id?: unknown;
  insights?: {
    data?: Array<{ name?: unknown; values?: Array<{ value?: unknown }> }>;
  };
  like_count?: unknown;
  media_product_type?: unknown;
  media_type?: unknown;
  permalink?: unknown;
  shortcode?: unknown;
  timestamp?: unknown;
}

interface InstagramMediaListResponse {
  data?: InstagramMediaNode[];
  paging?: { next?: unknown };
}

interface InstagramPagesResponse {
  data?: Array<{
    instagram_business_account?: InstagramUserResponse;
  }>;
}

export interface RefreshInstagramAuthorizedSignalsParams {
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
  InstagramAuthorizedSignalEvidence['key'],
  'genfeed-publish-outcomes-observed'
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

function readNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

function readIsoToUnixSeconds(value: unknown): number | undefined {
  const candidate = readString(value);
  if (!candidate) {
    return undefined;
  }

  const parsed = Date.parse(candidate);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return Math.max(0, Math.floor(parsed / 1000));
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

function insightValue(
  node: InstagramMediaNode,
  metric: string,
): number | undefined {
  const insights = Array.isArray(node.insights?.data) ? node.insights.data : [];
  const match = insights.find((item) => item.name === metric);
  return readNonNegativeInteger(match?.values?.[0]?.value);
}

function isProfessionalAccountType(accountType: string | undefined): boolean {
  return accountType === 'BUSINESS' || accountType === 'MEDIA_CREATOR';
}

@Injectable()
export class InstagramAuthorizedSignalsService {
  private readonly graphUrl = 'https://graph.facebook.com';
  private readonly apiVersion: string;
  private readonly constructorName = this.constructor.name;

  constructor(
    private readonly cacheService: CacheService,
    private readonly configService: ConfigService,
    private readonly credentialsService: CredentialsService,
    private readonly httpService: HttpService,
    private readonly instagramService: InstagramService,
    private readonly loggerService: LoggerService,
    private readonly prisma: PrismaService,
    private readonly socialWarmupEnrollmentsService: SocialWarmupEnrollmentsService,
  ) {
    this.apiVersion =
      this.configService.get('INSTAGRAM_API_VERSION') || 'v24.0';
  }

  async refresh(
    params: RefreshInstagramAuthorizedSignalsParams,
  ): Promise<InstagramAuthorizedSignalsSnapshot> {
    const credential = await this.credentialsService.findOne({
      id: params.credentialId,
      organizationId: params.organizationId,
      platform: CredentialPlatform.INSTAGRAM,
    });

    if (!credential) {
      throw new NotFoundException('Instagram credential');
    }

    const previousSnapshot = this.readStoredSnapshot(credential);
    const cacheKey = CACHE_PATTERNS.INSTAGRAM_AUTHORIZED_SIGNALS_SINGLE(
      credential.id,
    );

    if (!params.force) {
      const cached = await this.cacheService.get<unknown>(cacheKey);
      const cachedSnapshot =
        instagramAuthorizedSignalsSnapshotSchema.safeParse(cached);
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
        !this.hasStoredScopeObservation(credential, previousSnapshot);
      const validCredential = params.accessToken
        ? credential
        : shouldDiscoverScopes && credential.brandId
          ? await this.instagramService.refreshToken(
              params.organizationId,
              credential.brandId,
              credential.id,
            )
          : await this.instagramService.getValidCredential(
              params.organizationId,
              credential.brandId ?? '',
              credential.id,
            );
      if (params.grantedScopes === undefined) {
        const refreshed = shouldDiscoverScopes
          ? await this.credentialsService.findOne({
              id: credential.id,
              organizationId: params.organizationId,
              platform: CredentialPlatform.INSTAGRAM,
            })
          : credential;
        grantedScopes = this.resolveGrantedScopes(
          undefined,
          refreshed ?? credential,
          previousSnapshot,
        );
      }
      if (params.accessToken) {
        accessToken = params.accessToken;
      } else {
        const storedToken =
          validCredential.accessToken ?? credential.accessToken;
        if (!storedToken) {
          throw new Error('Instagram credential is missing an access token');
        }
        accessToken = EncryptionUtil.decrypt(storedToken);
      }
    } catch (error: unknown) {
      if (
        await this.instagramService.handleAuthorizationError(
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

    const igUserId = readString(credential.externalId);
    const profilePromise = grantedScopes.includes(BASIC_SCOPE)
      ? this.requestWithRetry(() =>
          this.fetchProfile(accessToken, igUserId, grantedScopes),
        )
      : undefined;
    const mediaPromise = grantedScopes.includes(BASIC_SCOPE)
      ? this.requestWithRetry(() =>
          this.fetchMedia(
            accessToken,
            igUserId,
            grantedScopes.includes(INSIGHTS_SCOPE),
          ),
        )
      : undefined;

    const [profileResult, mediaResult] = await Promise.all([
      this.settle(profilePromise),
      this.settle(
        mediaResultOrRetry(mediaPromise, () =>
          this.requestWithRetry(() =>
            this.fetchMedia(accessToken, igUserId, false),
          ),
        ),
      ),
    ]);
    const providerErrors = [profileResult.error, mediaResult.error].filter(
      (error) => error !== undefined,
    );
    const authorizationError = providerErrors.find((error) =>
      this.isAuthorizationFailure(error),
    );

    if (authorizationError) {
      await this.instagramService.handleAuthorizationError(
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
      profileResult,
      previousSnapshot,
      refreshAttemptedAt,
    );
    const ownedMediaEvidence = this.buildOwnedMediaEvidence(
      grantedScopes,
      mediaResult,
      previousSnapshot,
      refreshAttemptedAt,
    );
    const publishingEvidence = this.buildPublishingCapabilityEvidence(
      grantedScopes,
      profileResult,
      previousSnapshot,
      refreshAttemptedAt,
    );
    const derived = this.buildDerivedMediaEvidence(
      ownedMediaEvidence,
      mediaResult,
      grantedScopes,
      previousSnapshot,
      refreshAttemptedAt,
    );
    const evidence: InstagramAuthorizedSignalEvidence[] = [
      profileEvidence,
      ownedMediaEvidence,
      publishingEvidence,
      ...derived,
      genfeedEvidence,
    ];
    const snapshot = instagramAuthorizedSignalsSnapshotSchema.parse({
      credentialId: credential.id,
      evidence,
      grantedScopes,
      platform: CredentialPlatform.INSTAGRAM,
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

  private async fetchProfile(
    accessToken: string,
    igUserId: string | undefined,
    grantedScopes: string[],
  ): Promise<InstagramUserResponse> {
    const resolvedId = igUserId
      ? igUserId
      : await this.resolveIgUserId(accessToken, grantedScopes);

    const response = await firstValueFrom(
      this.httpService.get<InstagramUserResponse>(
        `${this.graphUrl}/${this.apiVersion}/${resolvedId}`,
        {
          params: {
            access_token: accessToken,
            fields: PROFILE_PROVIDER_FIELDS,
          },
          timeout: INSTAGRAM_SIGNAL_REQUEST_TIMEOUT_MS,
        },
      ),
    );

    return response.data ?? {};
  }

  private async resolveIgUserId(
    accessToken: string,
    grantedScopes: string[],
  ): Promise<string> {
    if (!grantedScopes.includes(PAGES_SCOPE)) {
      const error = {
        response: {
          data: {
            error: {
              code: 10,
              message: 'Missing pages_show_list permission',
            },
          },
          status: 403,
        },
      };
      throw error;
    }

    const response = await firstValueFrom(
      this.httpService.get<InstagramPagesResponse>(
        `${this.graphUrl}/${this.apiVersion}/me/accounts`,
        {
          params: {
            access_token: accessToken,
            fields:
              'id,instagram_business_account{id,username,name,account_type}',
          },
          timeout: INSTAGRAM_SIGNAL_REQUEST_TIMEOUT_MS,
        },
      ),
    );
    const pages = Array.isArray(response.data?.data) ? response.data.data : [];
    const igUserId = pages
      .map((page) => readString(page.instagram_business_account?.id))
      .find((id): id is string => Boolean(id));

    if (!igUserId) {
      throw {
        response: {
          data: {
            error: {
              code: 10,
              message:
                'The Instagram account must be a professional account linked to a Facebook Page',
            },
          },
          status: 400,
        },
      };
    }

    return igUserId;
  }

  private async fetchMedia(
    accessToken: string,
    igUserId: string | undefined,
    includeInsights: boolean,
  ): Promise<{
    hasMore: boolean;
    rawMediaCount: number;
    media: InstagramOwnedMediaSignal[];
    performance: InstagramMediaPerformanceSignal[];
  }> {
    if (!igUserId) {
      throw {
        response: {
          data: {
            error: {
              code: 10,
              message: 'Missing Instagram professional account id',
            },
          },
          status: 400,
        },
      };
    }

    const response = await firstValueFrom(
      this.httpService.get<InstagramMediaListResponse>(
        `${this.graphUrl}/${this.apiVersion}/${igUserId}/media`,
        {
          params: {
            access_token: accessToken,
            fields: includeInsights
              ? MEDIA_INSIGHTS_FIELDS
              : MEDIA_PROVIDER_FIELDS,
            limit: INSTAGRAM_MEDIA_LIMIT,
          },
          timeout: INSTAGRAM_SIGNAL_REQUEST_TIMEOUT_MS,
        },
      ),
    );
    const rawMedia = Array.isArray(response.data?.data)
      ? response.data.data
      : [];

    return {
      hasMore: typeof response.data?.paging?.next === 'string',
      rawMediaCount: rawMedia.length,
      media: rawMedia.flatMap((node) => {
        const mapped = this.mapOwnedMedia(node);
        return mapped ? [mapped] : [];
      }),
      performance: rawMedia.flatMap((node) => {
        const mapped = this.mapMediaPerformance(node);
        return mapped ? [mapped] : [];
      }),
    };
  }

  private mapOwnedMedia(
    node: InstagramMediaNode,
  ): InstagramOwnedMediaSignal | undefined {
    const id = readString(node.id);
    if (!id) {
      return undefined;
    }

    return {
      caption: readString(node.caption),
      commentCount: readNonNegativeInteger(node.comments_count),
      createTime: readIsoToUnixSeconds(node.timestamp),
      id,
      likeCount: readNonNegativeInteger(node.like_count),
      mediaProductType: readString(node.media_product_type),
      mediaType: readString(node.media_type),
      permalink: readHttpUrl(node.permalink),
      shortcode: readString(node.shortcode),
    };
  }

  private mapMediaPerformance(
    node: InstagramMediaNode,
  ): InstagramMediaPerformanceSignal | undefined {
    const id = readString(node.id);
    if (!id) {
      return undefined;
    }

    return {
      commentCount: readNonNegativeInteger(node.comments_count),
      id,
      impressions: insightValue(node, 'impressions'),
      likeCount: readNonNegativeInteger(node.like_count),
      reach: insightValue(node, 'reach'),
      saved: insightValue(node, 'saved'),
      shares: insightValue(node, 'shares'),
      totalInteractions: insightValue(node, 'total_interactions'),
    };
  }

  private async requestWithRetry<T>(request: () => Promise<T>): Promise<T> {
    let lastError: unknown;

    for (
      let attempt = 0;
      attempt < INSTAGRAM_SIGNAL_MAX_ATTEMPTS;
      attempt += 1
    ) {
      try {
        return await request();
      } catch (error: unknown) {
        lastError = error;
        if (
          !isInstagramRateLimitError(error) ||
          attempt === INSTAGRAM_SIGNAL_MAX_ATTEMPTS - 1
        ) {
          throw error;
        }

        const delayMs = getInstagramRetryAfterMs(
          error,
          INSTAGRAM_SIGNAL_RETRY_FALLBACK_MS * 2 ** attempt,
          INSTAGRAM_SIGNAL_RETRY_MAX_MS,
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
      !isInstagramScopeError(error) &&
      !isInstagramProfessionalAccountError(error) &&
      isInstagramAuthorizationError(error)
    );
  }

  private buildProfileEvidence(
    grantedScopes: string[],
    result: { error?: unknown; value?: InstagramUserResponse },
    previousSnapshot: InstagramAuthorizedSignalsSnapshot | undefined,
    observedAt: string,
  ): InstagramAuthorizedSignalEvidence {
    const requiredScopes = [BASIC_SCOPE];
    if (!grantedScopes.includes(BASIC_SCOPE) || !result.value) {
      return this.buildUnavailableEvidence(
        'profile-fields-platform-signal',
        requiredScopes,
        grantedScopes,
        result.error,
        previousSnapshot,
        observedAt,
      );
    }

    const value = {
      accountType: readString(result.value.account_type),
      biography: readString(result.value.biography),
      followersCount: readNonNegativeInteger(result.value.followers_count),
      followsCount: readNonNegativeInteger(result.value.follows_count),
      mediaCount: readNonNegativeInteger(result.value.media_count),
      name: readString(result.value.name),
      profilePictureUrl: readHttpUrl(result.value.profile_picture_url),
      username: readString(result.value.username),
      website: readString(result.value.website),
    };
    const fieldAvailability = toFieldAvailability(
      PROFILE_FIELDS.map((field) => [
        field,
        value[field] === undefined ? 'unavailable' : 'available',
      ]),
    );
    const scope = this.buildScope(requiredScopes, grantedScopes);

    return {
      fieldAvailability,
      key: 'profile-fields-platform-signal',
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

  private buildOwnedMediaEvidence(
    grantedScopes: string[],
    result: {
      error?: unknown;
      value?: {
        hasMore: boolean;
        rawMediaCount: number;
        media: InstagramOwnedMediaSignal[];
      };
    },
    previousSnapshot: InstagramAuthorizedSignalsSnapshot | undefined,
    observedAt: string,
  ): InstagramAuthorizedSignalEvidence {
    const requiredScopes = [BASIC_SCOPE];
    if (!result.value) {
      return this.buildUnavailableEvidence(
        'owned-media-snapshot',
        requiredScopes,
        grantedScopes,
        result.error,
        previousSnapshot,
        observedAt,
      );
    }

    const scope = this.buildScope(requiredScopes, grantedScopes);
    const fieldAvailability = toFieldAvailability(
      MEDIA_FIELDS.map((field) => [
        field,
        result.value?.media.length === 0 ||
        result.value?.media.every((item) => item[field] !== undefined)
          ? 'available'
          : 'unavailable',
      ]),
    );
    const malformedResponse =
      result.value.rawMediaCount > 0 && result.value.media.length === 0;

    return {
      fieldAvailability,
      key: 'owned-media-snapshot',
      observedAt,
      provenance: 'platform_verified',
      ...(malformedResponse ? { reason: 'empty_response' as const } : {}),
      scope,
      staleAt: null,
      status: malformedResponse
        ? 'unavailable'
        : result.value.media.length === 0
          ? 'empty'
          : 'available',
      value: {
        hasMore: result.value.hasMore,
        media: result.value.media,
      },
    };
  }

  private buildPublishingCapabilityEvidence(
    grantedScopes: string[],
    result: { error?: unknown; value?: InstagramUserResponse },
    previousSnapshot: InstagramAuthorizedSignalsSnapshot | undefined,
    observedAt: string,
  ): InstagramAuthorizedSignalEvidence {
    const requiredScopes = [PUBLISH_SCOPE];
    if (!grantedScopes.includes(PUBLISH_SCOPE)) {
      return this.buildUnavailableEvidence(
        'publishing-capability-snapshot',
        requiredScopes,
        grantedScopes,
        result.error,
        previousSnapshot,
        observedAt,
      );
    }

    if (!result.value) {
      return this.buildUnavailableEvidence(
        'publishing-capability-snapshot',
        requiredScopes,
        grantedScopes,
        result.error,
        previousSnapshot,
        observedAt,
      );
    }

    const accountType = readString(result.value.account_type);
    const isProfessional = isProfessionalAccountType(accountType);
    const canPublish = accountType === 'BUSINESS';
    const value = {
      accountType,
      canPublish,
      isProfessionalAccount: isProfessional,
    };
    const professionalLimited = accountType !== undefined && !canPublish;
    const fieldAvailability = toFieldAvailability(
      PUBLISHING_FIELDS.map((field) => [
        field,
        value[field] === undefined ? 'unavailable' : 'available',
      ]),
    );

    return {
      fieldAvailability,
      key: 'publishing-capability-snapshot',
      observedAt,
      provenance: 'platform_verified',
      ...(professionalLimited
        ? { reason: 'professional_account_limited' as const }
        : {}),
      scope: this.buildScope(requiredScopes, grantedScopes),
      staleAt: null,
      status: professionalLimited
        ? 'permission_limited'
        : Object.values(value).every((item) => item === undefined)
          ? 'unavailable'
          : 'available',
      value,
    };
  }

  private buildDerivedMediaEvidence(
    ownedMedia: InstagramAuthorizedSignalEvidence,
    mediaResult: {
      error?: unknown;
      value?: {
        media: InstagramOwnedMediaSignal[];
        performance: InstagramMediaPerformanceSignal[];
      };
    },
    grantedScopes: string[],
    previousSnapshot: InstagramAuthorizedSignalsSnapshot | undefined,
    observedAt: string,
  ): InstagramAuthorizedSignalEvidence[] {
    if (ownedMedia.key !== 'owned-media-snapshot') {
      throw new Error('Instagram owned-media evidence is missing');
    }

    const media = ownedMedia.value?.media ?? [];
    const common = {
      fieldAvailability: ownedMedia.fieldAvailability,
      observedAt: ownedMedia.observedAt ?? observedAt,
      provenance: 'platform_verified' as const,
      ...(ownedMedia.reason ? { reason: ownedMedia.reason } : {}),
      scope: ownedMedia.scope,
      staleAt: ownedMedia.staleAt,
      status: ownedMedia.status,
    };
    const performance = this.buildMediaPerformanceEvidence(
      grantedScopes,
      mediaResult,
      ownedMedia,
      previousSnapshot,
      observedAt,
    );

    return [
      performance,
      {
        ...common,
        key: 'first-publish-platform-signal',
        value: media.length > 0 ? { media: media[0] } : {},
      },
    ];
  }

  private buildMediaPerformanceEvidence(
    grantedScopes: string[],
    result: {
      error?: unknown;
      value?: {
        media: InstagramOwnedMediaSignal[];
        performance: InstagramMediaPerformanceSignal[];
      };
    },
    ownedMedia: InstagramAuthorizedSignalEvidence,
    previousSnapshot: InstagramAuthorizedSignalsSnapshot | undefined,
    observedAt: string,
  ): InstagramAuthorizedSignalEvidence {
    const requiredScopes = [INSIGHTS_SCOPE];
    if (!grantedScopes.includes(INSIGHTS_SCOPE) || !result.value) {
      return this.buildUnavailableEvidence(
        'media-performance-snapshot',
        requiredScopes,
        grantedScopes,
        result.error ??
          (ownedMedia.key === 'owned-media-snapshot' ? undefined : undefined),
        previousSnapshot,
        observedAt,
      );
    }

    const performance = result.value.performance;
    const fieldAvailability = toFieldAvailability(
      PERFORMANCE_FIELDS.map((field) => [
        field,
        performance.length === 0 ||
        performance.every((item) => item[field] !== undefined)
          ? 'available'
          : 'unavailable',
      ]),
    );

    return {
      fieldAvailability,
      key: 'media-performance-snapshot',
      observedAt: ownedMedia.observedAt ?? observedAt,
      provenance: 'platform_verified',
      scope: this.buildScope(requiredScopes, grantedScopes),
      staleAt: ownedMedia.staleAt,
      status:
        ownedMedia.status === 'empty'
          ? 'empty'
          : performance.length === 0
            ? 'empty'
            : 'available',
      value: { media: performance },
    };
  }

  private buildUnavailableEvidence(
    key: PlatformEvidenceKey,
    requiredScopes: string[],
    grantedScopes: string[],
    error: unknown,
    previousSnapshot: InstagramAuthorizedSignalsSnapshot | undefined,
    observedAt: string,
  ): InstagramAuthorizedSignalEvidence {
    const scope = this.buildScope(requiredScopes, grantedScopes);
    const reason: InstagramAuthorizedSignalReason =
      isInstagramProfessionalAccountError(error)
        ? 'professional_account_limited'
        : scope.missing.length > 0 || isInstagramScopeError(error)
          ? 'missing_scope'
          : isInstagramRateLimitError(error)
            ? 'rate_limited'
            : 'provider_error';
    const previous = previousSnapshot?.evidence.find(
      (evidence) => evidence.key === key,
    );

    if (previous && reason !== 'missing_scope') {
      return {
        ...previous,
        reason,
        scope,
        staleAt: observedAt,
        status: 'stale',
      };
    }

    const fieldNames = this.fieldNamesForKey(key);
    const effectiveScope =
      isInstagramScopeError(error) && scope.missing.length === 0
        ? { granted: [], missing: requiredScopes, required: requiredScopes }
        : scope;

    return {
      fieldAvailability: toFieldAvailability(
        fieldNames.map((field) => [
          field,
          reason === 'missing_scope' ||
          reason === 'professional_account_limited'
            ? 'permission_limited'
            : 'unavailable',
        ]),
      ),
      key,
      observedAt,
      provenance: 'platform_verified',
      reason,
      scope: effectiveScope,
      staleAt: null,
      status:
        reason === 'missing_scope' || reason === 'professional_account_limited'
          ? 'permission_limited'
          : 'unavailable',
    } as InstagramAuthorizedSignalEvidence;
  }

  private fieldNamesForKey(key: PlatformEvidenceKey): readonly string[] {
    if (key === 'profile-fields-platform-signal') {
      return PROFILE_FIELDS;
    }
    if (key === 'publishing-capability-snapshot') {
      return PUBLISHING_FIELDS;
    }
    if (key === 'media-performance-snapshot') {
      return PERFORMANCE_FIELDS;
    }
    return MEDIA_FIELDS;
  }

  private buildScope(required: string[], grantedScopes: string[]) {
    return {
      granted: grantedScopes.filter((scope) => required.includes(scope)),
      missing: required.filter((scope) => !grantedScopes.includes(scope)),
      required,
    };
  }

  // Schedules / publishes / failures come from Genfeed posts. Draft-only
  // activity (`genfeed-draft-activity-observed`) and first-reel-or-carousel
  // stay enrollment attestations until a dedicated post-type projection exists.
  private async buildGenfeedEvidence(
    credential: CredentialDocument,
    organizationId: string,
    observedAt: string,
  ): Promise<InstagramAuthorizedSignalEvidence> {
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
      take: INSTAGRAM_MEDIA_LIMIT,
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
      key: 'genfeed-publish-outcomes-observed',
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
    previousSnapshot: InstagramAuthorizedSignalsSnapshot | undefined,
    genfeedEvidence: InstagramAuthorizedSignalEvidence,
    refreshAttemptedAt: string,
  ): InstagramAuthorizedSignalsSnapshot {
    const keys: PlatformEvidenceKey[] = [
      'profile-fields-platform-signal',
      'owned-media-snapshot',
      'publishing-capability-snapshot',
      'media-performance-snapshot',
      'first-publish-platform-signal',
    ];
    const evidence = keys.map((key) => {
      const previous = previousSnapshot?.evidence.find(
        (item) => item.key === key,
      );
      if (previous) {
        return {
          ...previous,
          reason: 'authorization_revoked' as const,
          scope: this.buildScope(this.requiredScopesForKey(key), grantedScopes),
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

    return instagramAuthorizedSignalsSnapshotSchema.parse({
      credentialId,
      evidence: [...evidence, genfeedEvidence],
      grantedScopes,
      platform: CredentialPlatform.INSTAGRAM,
      refreshAttemptedAt,
      state: 'revoked',
    });
  }

  private requiredScopesForKey(key: PlatformEvidenceKey): string[] {
    if (key === 'publishing-capability-snapshot') {
      return [PUBLISH_SCOPE];
    }
    if (key === 'media-performance-snapshot') {
      return [INSIGHTS_SCOPE];
    }
    return [BASIC_SCOPE];
  }

  private resolveSnapshotState(
    evidence: InstagramAuthorizedSignalEvidence[],
  ): InstagramAuthorizedSignalsSnapshot['state'] {
    const platformEvidence = evidence.filter(
      (item) => item.provenance === 'platform_verified',
    );

    if (platformEvidence.every((item) => item.status === 'stale')) {
      return 'stale';
    }

    const ownedMedia = platformEvidence.find(
      (item) => item.key === 'owned-media-snapshot',
    );
    if (
      ownedMedia?.status === 'empty' &&
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
    previousSnapshot: InstagramAuthorizedSignalsSnapshot | undefined,
  ): string[] {
    const stored = readRecord(credential.warmupSignals);
    const authorization = readRecord(
      stored[INSTAGRAM_AUTHORIZATION_STORAGE_KEY],
    );
    const persistedScopes =
      Array.isArray(credential.grantedScopes) &&
      credential.grantedScopes.length > 0
        ? credential.grantedScopes
        : undefined;

    return parseInstagramGrantedScopes(
      explicitScopes ??
        persistedScopes ??
        authorization.grantedScopes ??
        previousSnapshot?.grantedScopes,
    );
  }

  private hasStoredScopeObservation(
    credential: CredentialDocument,
    previousSnapshot: InstagramAuthorizedSignalsSnapshot | undefined,
  ): boolean {
    const stored = readRecord(credential.warmupSignals);
    const authorization = readRecord(
      stored[INSTAGRAM_AUTHORIZATION_STORAGE_KEY],
    );

    return (
      (Array.isArray(credential.grantedScopes) &&
        credential.grantedScopes.length > 0) ||
      Array.isArray(authorization.grantedScopes) ||
      previousSnapshot !== undefined
    );
  }

  private readStoredSnapshot(
    credential: CredentialDocument,
  ): InstagramAuthorizedSignalsSnapshot | undefined {
    const stored = readRecord(credential.warmupSignals);
    const parsed = instagramAuthorizedSignalsSnapshotSchema.safeParse(
      stored[INSTAGRAM_AUTHORIZED_SIGNALS_STORAGE_KEY],
    );

    return parsed.success ? parsed.data : undefined;
  }

  private async persistSnapshot(
    credential: CredentialDocument,
    organizationId: string,
    cacheKey: string,
    snapshot: InstagramAuthorizedSignalsSnapshot,
  ): Promise<InstagramAuthorizedSignalsSnapshot> {
    await this.credentialsService.mergeWarmupSignals(
      credential.id,
      organizationId,
      {
        [INSTAGRAM_AUTHORIZATION_STORAGE_KEY]: {
          grantedScopes: snapshot.grantedScopes,
          observedAt: snapshot.refreshAttemptedAt,
        },
        [INSTAGRAM_AUTHORIZED_SIGNALS_STORAGE_KEY]: snapshot,
      },
    );
    if (credential.brandId) {
      await this.socialWarmupEnrollmentsService.syncInstagramAuthorizedSnapshot(
        {
          brandId: credential.brandId,
          credentialId: credential.id,
          organizationId,
          snapshot,
        },
      );
    }
    await this.cacheService.set(cacheKey, snapshot, {
      tags: [
        CACHE_TAGS.INSTAGRAM_AUTHORIZED_SIGNALS,
        SCOPED_CACHE_TAGS.INSTAGRAM_AUTHORIZED_SIGNALS(organizationId),
        credential.id,
      ],
      ttl:
        snapshot.state === 'stale' || snapshot.state === 'revoked'
          ? INSTAGRAM_STALE_SIGNALS_CACHE_TTL_SECONDS
          : INSTAGRAM_AUTHORIZED_SIGNALS_CACHE_TTL_SECONDS,
    });

    this.loggerService.log(`${this.constructorName} refresh completed`, {
      credentialId: credential.id,
      state: snapshot.state,
    });
    return snapshot;
  }
}

async function mediaResultOrRetry<T>(
  promise: Promise<T> | undefined,
  retryWithoutInsights: () => Promise<T>,
): Promise<T | undefined> {
  if (!promise) {
    return undefined;
  }

  try {
    return await promise;
  } catch (error: unknown) {
    if (
      isInstagramAuthorizationError(error) ||
      isInstagramRateLimitError(error)
    ) {
      throw error;
    }

    try {
      return await retryWithoutInsights();
    } catch {
      throw error;
    }
  }
}
