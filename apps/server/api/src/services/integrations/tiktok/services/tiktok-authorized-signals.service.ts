import { SocialWarmupEnrollmentsService } from '@api/collections/social-warmup-enrollments/services/social-warmup-enrollments.service';
import { mapAuthorizedSignalsOutcome } from '@api/services/integrations/_shared/authorized-signals-outcome.util';
import type { AuthorizedSignalsSettledResult } from '@api/services/integrations/_shared/authorized-signals-request.util';
import {
  type TikTokAuthorizedSignalEvidence,
  type TikTokAuthorizedSignalReason,
  type TikTokAuthorizedSignalsSnapshot,
  tiktokAuthorizedSignalsSnapshotSchema,
} from '@api-types/contracts/tiktok-authorized-signals.contract';
import { CredentialPlatform, TargetExecutionState } from '@genfeedai/enums';
import { scopedWhere } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import type { CredentialDocument } from '@server/collections/credentials/schemas/credential.schema';
import { CredentialsService } from '@server/collections/credentials/services/credentials.service';
import {
  CACHE_PATTERNS,
  CACHE_TAGS,
  SCOPED_CACHE_TAGS,
} from '@server/common/constants/cache-patterns.constants';
import { NotFoundException } from '@server/exceptions/not-found.exception';
import { CacheService } from '@server/services/cache/cache.service';
import { TiktokService } from '@server/services/integrations/tiktok/services/tiktok.service';
import {
  isTikTokRateLimitError,
  isTikTokScopeError,
  parseTikTokGrantedScopes,
} from '@server/services/integrations/tiktok/utils/tiktok-error.util';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';
import {
  readBoolean,
  readHttpUrl,
  readNonNegativeInteger,
  readRecord,
  readString,
  readStringArray,
  type TikTokVideosFetch,
  TiktokAuthorizedSignalsProvider,
} from './tiktok-authorized-signals.provider';

const TIKTOK_AUTHORIZED_SIGNALS_CACHE_TTL_SECONDS = 5 * 60;
const TIKTOK_STALE_SIGNALS_CACHE_TTL_SECONDS = 60;
const TIKTOK_AUTHORIZED_SIGNALS_STORAGE_KEY = 'tiktokAuthorized';
const TIKTOK_AUTHORIZATION_STORAGE_KEY = 'tiktokAuthorization';
const TIKTOK_VIDEO_LIMIT = 20;

const USER_BASIC_SCOPE = 'user.info.basic';
const USER_PROFILE_SCOPE = 'user.info.profile';
const USER_STATS_SCOPE = 'user.info.stats';
const VIDEO_LIST_SCOPE = 'video.list';
const VIDEO_UPLOAD_SCOPE = 'video.upload';
const VIDEO_PUBLISH_SCOPE = 'video.publish';

const PROFILE_FIELDS = {
  avatarUrl: USER_BASIC_SCOPE,
  bioDescription: USER_PROFILE_SCOPE,
  displayName: USER_BASIC_SCOPE,
  isVerified: USER_PROFILE_SCOPE,
  profileDeepLink: USER_PROFILE_SCOPE,
  username: USER_PROFILE_SCOPE,
} as const;

const STATISTICS_FIELDS = {
  followerCount: USER_STATS_SCOPE,
  followingCount: USER_STATS_SCOPE,
  likesCount: USER_STATS_SCOPE,
  videoCount: USER_STATS_SCOPE,
} as const;

const VIDEO_FIELDS = [
  'commentCount',
  'createTime',
  'duration',
  'id',
  'likeCount',
  'shareCount',
  'shareUrl',
  'title',
  'videoDescription',
  'viewCount',
] as const;

const CREATOR_FIELDS = [
  'commentDisabled',
  'creatorNickname',
  'creatorUsername',
  'duetDisabled',
  'maxVideoPostDurationSeconds',
  'privacyLevelOptions',
  'stitchDisabled',
] as const;

export interface RefreshTikTokAuthorizedSignalsParams {
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
  TikTokAuthorizedSignalEvidence['key'],
  'genfeed-publish-activity'
>;

@Injectable()
export class TiktokAuthorizedSignalsService {
  private readonly endpoint = 'https://open.tiktokapis.com/v2';
  private readonly contentType = 'application/json; charset=UTF-8';
  private readonly constructorName = this.constructor.name;
  private readonly provider: TiktokAuthorizedSignalsProvider;

  constructor(
    private readonly cacheService: CacheService,
    private readonly credentialsService: CredentialsService,
    private readonly httpService: HttpService,
    private readonly loggerService: LoggerService,
    private readonly prisma: PrismaService,
    private readonly tiktokService: TiktokService,
    private readonly socialWarmupEnrollmentsService: SocialWarmupEnrollmentsService,
  ) {
    this.provider = new TiktokAuthorizedSignalsProvider(
      this.httpService,
      this.endpoint,
      this.contentType,
    );
  }

  async refresh(
    params: RefreshTikTokAuthorizedSignalsParams,
  ): Promise<TikTokAuthorizedSignalsSnapshot> {
    const credential = await this.credentialsService.findOne({
      id: params.credentialId,
      organizationId: params.organizationId,
      platform: CredentialPlatform.TIKTOK,
    });

    if (!credential) {
      throw new NotFoundException('TikTok credential');
    }

    const previousSnapshot = this.readStoredSnapshot(credential);
    const cacheKey = CACHE_PATTERNS.TIKTOK_AUTHORIZED_SIGNALS_SINGLE(
      credential.id,
    );

    if (!params.force) {
      const cached = await this.cacheService.get<unknown>(cacheKey);
      const cachedSnapshot =
        tiktokAuthorizedSignalsSnapshotSchema.safeParse(cached);
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
          ? await this.tiktokService.refreshToken(
              params.organizationId,
              credential.brandId ?? '',
              credential.id,
            )
          : await this.tiktokService.getValidCredential(
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
        // Raw token from the OAuth exchange — used as-is; only tokens read
        // back from the credential store are encrypted at rest.
        accessToken = params.accessToken;
      } else {
        if (!validCredential.accessToken) {
          throw new Error('TikTok credential is missing an access token');
        }
        accessToken = EncryptionUtil.decrypt(validCredential.accessToken);
      }
    } catch (error: unknown) {
      if (
        await this.tiktokService.handleAuthorizationError(
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

    return await this.fetchAndPersistSnapshot({
      accessToken,
      cacheKey,
      credential,
      genfeedEvidence,
      grantedScopes,
      organizationId: params.organizationId,
      previousSnapshot,
      refreshAttemptedAt,
    });
  }

  private async fetchAndPersistSnapshot(params: {
    accessToken: string;
    cacheKey: string;
    credential: CredentialDocument;
    genfeedEvidence: TikTokAuthorizedSignalEvidence;
    grantedScopes: string[];
    organizationId: string;
    previousSnapshot: TikTokAuthorizedSignalsSnapshot | undefined;
    refreshAttemptedAt: string;
  }): Promise<TikTokAuthorizedSignalsSnapshot> {
    const {
      accessToken,
      cacheKey,
      credential,
      genfeedEvidence,
      grantedScopes,
      organizationId,
      previousSnapshot,
      refreshAttemptedAt,
    } = params;
    const providerResult = await this.provider.fetch(
      accessToken,
      grantedScopes,
      {
        user: [USER_BASIC_SCOPE, USER_PROFILE_SCOPE, USER_STATS_SCOPE],
        videoList: VIDEO_LIST_SCOPE,
        videoPublish: VIDEO_PUBLISH_SCOPE,
      },
    );
    const { creatorInfoResult, userInfoResult, videosResult } = providerResult;
    const authorizationError =
      this.provider.findAuthorizationError(providerResult);

    if (authorizationError) {
      await this.tiktokService.handleAuthorizationError(
        credential.id,
        authorizationError,
        `${this.constructorName} refresh`,
      );
      return await this.persistSnapshot(
        credential,
        organizationId,
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
    const publicVideosEvidence = this.buildPublicVideosEvidence(
      grantedScopes,
      videosResult,
      previousSnapshot,
      refreshAttemptedAt,
    );
    const creatorCapabilitiesEvidence = this.buildCreatorCapabilitiesEvidence(
      grantedScopes,
      creatorInfoResult,
      previousSnapshot,
      refreshAttemptedAt,
    );
    const videoEvidence = this.buildDerivedVideoEvidence(
      publicVideosEvidence,
      refreshAttemptedAt,
    );
    const evidence: TikTokAuthorizedSignalEvidence[] = [
      profileEvidence,
      statisticsEvidence,
      publicVideosEvidence,
      creatorCapabilitiesEvidence,
      ...videoEvidence,
      genfeedEvidence,
    ];
    const snapshot = tiktokAuthorizedSignalsSnapshotSchema.parse({
      credentialId: credential.id,
      evidence,
      grantedScopes,
      platform: CredentialPlatform.TIKTOK,
      refreshAttemptedAt,
      state: this.resolveSnapshotState(evidence),
    });

    return await this.persistSnapshot(
      credential,
      organizationId,
      cacheKey,
      snapshot,
    );
  }

  private buildProfileEvidence(
    grantedScopes: string[],
    result: AuthorizedSignalsSettledResult<Record<string, unknown>>,
    previousSnapshot: TikTokAuthorizedSignalsSnapshot | undefined,
    observedAt: string,
  ): TikTokAuthorizedSignalEvidence {
    const requiredScopes = [USER_BASIC_SCOPE, USER_PROFILE_SCOPE];
    // Mirror buildStatisticsEvidence: with no profile scope granted the
    // evidence must omit `value` instead of emitting undefined members.
    if (
      !requiredScopes.some((scope) => grantedScopes.includes(scope)) ||
      !result.value
    ) {
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
      avatarUrl: grantedScopes.includes(USER_BASIC_SCOPE)
        ? readHttpUrl(result.value.avatar_url)
        : undefined,
      bioDescription: grantedScopes.includes(USER_PROFILE_SCOPE)
        ? readString(result.value.bio_description)
        : undefined,
      displayName: grantedScopes.includes(USER_BASIC_SCOPE)
        ? readString(result.value.display_name)
        : undefined,
      isVerified: grantedScopes.includes(USER_PROFILE_SCOPE)
        ? readBoolean(result.value.is_verified)
        : undefined,
      profileDeepLink: grantedScopes.includes(USER_PROFILE_SCOPE)
        ? readHttpUrl(result.value.profile_deep_link)
        : undefined,
      username: grantedScopes.includes(USER_PROFILE_SCOPE)
        ? readString(result.value.username)
        : undefined,
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
    result: AuthorizedSignalsSettledResult<Record<string, unknown>>,
    previousSnapshot: TikTokAuthorizedSignalsSnapshot | undefined,
    observedAt: string,
  ): TikTokAuthorizedSignalEvidence {
    const requiredScopes = [USER_STATS_SCOPE];
    if (!grantedScopes.includes(USER_STATS_SCOPE) || !result.value) {
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
      followerCount: grantedScopes.includes(USER_STATS_SCOPE)
        ? readNonNegativeInteger(result.value.follower_count)
        : undefined,
      followingCount: grantedScopes.includes(USER_STATS_SCOPE)
        ? readNonNegativeInteger(result.value.following_count)
        : undefined,
      likesCount: grantedScopes.includes(USER_STATS_SCOPE)
        ? readNonNegativeInteger(result.value.likes_count)
        : undefined,
      videoCount: grantedScopes.includes(USER_STATS_SCOPE)
        ? readNonNegativeInteger(result.value.video_count)
        : undefined,
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

  private buildPublicVideosEvidence(
    grantedScopes: string[],
    result: AuthorizedSignalsSettledResult<TikTokVideosFetch>,
    previousSnapshot: TikTokAuthorizedSignalsSnapshot | undefined,
    observedAt: string,
  ): TikTokAuthorizedSignalEvidence {
    const requiredScopes = [VIDEO_LIST_SCOPE];
    if (!result.value) {
      return this.buildUnavailableEvidence(
        'public-videos-snapshot',
        requiredScopes,
        grantedScopes,
        result.error,
        previousSnapshot,
        observedAt,
      );
    }

    const scope = this.buildScope(requiredScopes, grantedScopes);
    const fieldAvailability = Object.fromEntries(
      VIDEO_FIELDS.map(
        (field) =>
          [
            field,
            result.value?.videos.length === 0 ||
            result.value?.videos.every((video) => video[field] !== undefined)
              ? 'available'
              : 'unavailable',
          ] as const,
      ),
    );
    const malformedResponse =
      result.value.rawVideoCount > 0 && result.value.videos.length === 0;

    return {
      fieldAvailability,
      key: 'public-videos-snapshot',
      observedAt,
      provenance: 'platform_verified',
      ...(malformedResponse ? { reason: 'empty_response' as const } : {}),
      scope,
      staleAt: null,
      status: malformedResponse
        ? 'unavailable'
        : result.value.videos.length === 0
          ? 'empty'
          : 'available',
      value: {
        hasMore: result.value.hasMore,
        videos: result.value.videos,
      },
    };
  }

  private buildCreatorCapabilitiesEvidence(
    grantedScopes: string[],
    result: AuthorizedSignalsSettledResult<Record<string, unknown>>,
    previousSnapshot: TikTokAuthorizedSignalsSnapshot | undefined,
    observedAt: string,
  ): TikTokAuthorizedSignalEvidence {
    const requiredScopes = [VIDEO_PUBLISH_SCOPE];
    if (!result.value) {
      return this.buildUnavailableEvidence(
        'creator-capabilities-snapshot',
        requiredScopes,
        grantedScopes,
        result.error,
        previousSnapshot,
        observedAt,
      );
    }

    const value = {
      commentDisabled: readBoolean(result.value.comment_disabled),
      creatorNickname: readString(result.value.creator_nickname),
      creatorUsername: readString(result.value.creator_username),
      duetDisabled: readBoolean(result.value.duet_disabled),
      maxVideoPostDurationSeconds: readNonNegativeInteger(
        result.value.max_video_post_duration_sec,
      ),
      privacyLevelOptions: readStringArray(result.value.privacy_level_options),
      stitchDisabled: readBoolean(result.value.stitch_disabled),
    };
    const fieldAvailability = Object.fromEntries(
      CREATOR_FIELDS.map(
        (field) =>
          [
            field,
            value[field] === undefined ? 'unavailable' : 'available',
          ] as const,
      ),
    );

    return {
      fieldAvailability,
      key: 'creator-capabilities-snapshot',
      observedAt,
      provenance: 'platform_verified',
      scope: {
        ...this.buildScope(requiredScopes, grantedScopes),
        granted: grantedScopes.filter((scope) =>
          [VIDEO_PUBLISH_SCOPE, VIDEO_UPLOAD_SCOPE].includes(scope),
        ),
      },
      staleAt: null,
      status: Object.values(value).every((item) => item === undefined)
        ? 'unavailable'
        : 'available',
      value,
    };
  }

  private buildDerivedVideoEvidence(
    publicVideos: TikTokAuthorizedSignalEvidence,
    observedAt: string,
  ): TikTokAuthorizedSignalEvidence[] {
    if (publicVideos.key !== 'public-videos-snapshot') {
      throw new Error('TikTok public-video evidence is missing');
    }

    const videos = publicVideos.value?.videos ?? [];
    const common = {
      fieldAvailability: publicVideos.fieldAvailability,
      observedAt: publicVideos.observedAt ?? observedAt,
      provenance: 'platform_verified' as const,
      ...(publicVideos.reason ? { reason: publicVideos.reason } : {}),
      scope: publicVideos.scope,
      staleAt: publicVideos.staleAt,
      status: publicVideos.status,
    };

    return [
      {
        ...common,
        key: 'first-upload-platform-signal',
        value: videos.length > 0 ? { video: videos[0] } : {},
      },
      {
        ...common,
        key: 'owned-post-metrics-snapshot',
        value: { videos },
      },
    ];
  }

  private buildUnavailableEvidence(
    key: PlatformEvidenceKey,
    requiredScopes: string[],
    grantedScopes: string[],
    error: unknown,
    previousSnapshot: TikTokAuthorizedSignalsSnapshot | undefined,
    observedAt: string,
  ): TikTokAuthorizedSignalEvidence {
    const scope = this.buildScope(requiredScopes, grantedScopes);
    const reason: TikTokAuthorizedSignalReason =
      scope.missing.length > 0 || isTikTokScopeError(error)
        ? 'missing_scope'
        : isTikTokRateLimitError(error)
          ? 'rate_limited'
          : 'provider_error';
    const previous = previousSnapshot?.evidence.find(
      (evidence) => evidence.key === key,
    );
    const reportedScope =
      key === 'creator-capabilities-snapshot'
        ? {
            ...scope,
            granted: grantedScopes.filter((grantedScope) =>
              [VIDEO_PUBLISH_SCOPE, VIDEO_UPLOAD_SCOPE].includes(grantedScope),
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
      isTikTokScopeError(error) && scope.missing.length === 0
        ? key === 'creator-capabilities-snapshot'
          ? {
              granted: grantedScopes.filter(
                (grantedScope) => grantedScope === VIDEO_UPLOAD_SCOPE,
              ),
              missing: [VIDEO_PUBLISH_SCOPE],
              required: requiredScopes,
            }
          : { granted: [], missing: requiredScopes, required: requiredScopes }
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
    } as TikTokAuthorizedSignalEvidence;
  }

  private fieldNamesForKey(key: PlatformEvidenceKey): readonly string[] {
    if (key === 'profile-completeness-signal') {
      return Object.keys(PROFILE_FIELDS);
    }
    if (key === 'profile-statistics-snapshot') {
      return Object.keys(STATISTICS_FIELDS);
    }
    if (key === 'creator-capabilities-snapshot') {
      return CREATOR_FIELDS;
    }
    return VIDEO_FIELDS;
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
  ): Promise<TikTokAuthorizedSignalEvidence> {
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
      take: TIKTOK_VIDEO_LIMIT,
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
      const outcome = mapAuthorizedSignalsOutcome(row.targetExecutionState);
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
    previousSnapshot: TikTokAuthorizedSignalsSnapshot | undefined,
    genfeedEvidence: TikTokAuthorizedSignalEvidence,
    refreshAttemptedAt: string,
  ): TikTokAuthorizedSignalsSnapshot {
    const keys: PlatformEvidenceKey[] = [
      'profile-completeness-signal',
      'profile-statistics-snapshot',
      'public-videos-snapshot',
      'creator-capabilities-snapshot',
      'first-upload-platform-signal',
      'owned-post-metrics-snapshot',
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
            key === 'creator-capabilities-snapshot'
              ? {
                  ...scope,
                  granted: grantedScopes.filter((grantedScope) =>
                    [VIDEO_PUBLISH_SCOPE, VIDEO_UPLOAD_SCOPE].includes(
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

    return tiktokAuthorizedSignalsSnapshotSchema.parse({
      credentialId,
      evidence: [...evidence, genfeedEvidence],
      grantedScopes,
      platform: CredentialPlatform.TIKTOK,
      refreshAttemptedAt,
      state: 'revoked',
    });
  }

  private requiredScopesForKey(key: PlatformEvidenceKey): string[] {
    if (key === 'profile-completeness-signal') {
      return [USER_BASIC_SCOPE, USER_PROFILE_SCOPE];
    }
    if (key === 'profile-statistics-snapshot') {
      return [USER_STATS_SCOPE];
    }
    if (key === 'creator-capabilities-snapshot') {
      return [VIDEO_PUBLISH_SCOPE];
    }
    return [VIDEO_LIST_SCOPE];
  }

  private resolveSnapshotState(
    evidence: TikTokAuthorizedSignalEvidence[],
  ): TikTokAuthorizedSignalsSnapshot['state'] {
    const platformEvidence = evidence.filter(
      (item) => item.provenance === 'platform_verified',
    );

    if (platformEvidence.every((item) => item.status === 'stale')) {
      return 'stale';
    }

    const publicVideos = platformEvidence.find(
      (item) => item.key === 'public-videos-snapshot',
    );
    if (
      publicVideos?.status === 'empty' &&
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
    credential: Pick<CredentialDocument, 'warmupSignals'>,
    previousSnapshot: TikTokAuthorizedSignalsSnapshot | undefined,
  ): string[] {
    const stored = readRecord(credential.warmupSignals);
    const authorization = readRecord(stored[TIKTOK_AUTHORIZATION_STORAGE_KEY]);

    return parseTikTokGrantedScopes(
      explicitScopes ??
        authorization.grantedScopes ??
        previousSnapshot?.grantedScopes,
    );
  }

  private hasStoredScopeObservation(
    credential: CredentialDocument,
    previousSnapshot: TikTokAuthorizedSignalsSnapshot | undefined,
  ): boolean {
    const stored = readRecord(credential.warmupSignals);
    const authorization = readRecord(stored[TIKTOK_AUTHORIZATION_STORAGE_KEY]);

    return (
      Array.isArray(authorization.grantedScopes) ||
      previousSnapshot !== undefined
    );
  }

  private readStoredSnapshot(
    credential: CredentialDocument,
  ): TikTokAuthorizedSignalsSnapshot | undefined {
    const stored = readRecord(credential.warmupSignals);
    const parsed = tiktokAuthorizedSignalsSnapshotSchema.safeParse(
      stored[TIKTOK_AUTHORIZED_SIGNALS_STORAGE_KEY],
    );

    return parsed.success ? parsed.data : undefined;
  }

  private async persistSnapshot(
    credential: CredentialDocument,
    organizationId: string,
    cacheKey: string,
    snapshot: TikTokAuthorizedSignalsSnapshot,
  ): Promise<TikTokAuthorizedSignalsSnapshot> {
    // Merge only the TikTok-owned keys atomically so concurrent warmup
    // writers (token refresh, account-health assessments, overlapping
    // refreshes) never lose their evidence to a stale full-object replace.
    await this.credentialsService.mergeWarmupSignals(
      credential.id,
      organizationId,
      {
        [TIKTOK_AUTHORIZATION_STORAGE_KEY]: {
          grantedScopes: snapshot.grantedScopes,
          observedAt: snapshot.refreshAttemptedAt,
        },
        [TIKTOK_AUTHORIZED_SIGNALS_STORAGE_KEY]: snapshot,
      },
    );
    if (credential.brandId) {
      await this.socialWarmupEnrollmentsService.syncTikTokAuthorizedSnapshot({
        brandId: credential.brandId,
        credentialId: credential.id,
        organizationId,
        snapshot,
      });
    }
    await this.cacheService.set(cacheKey, snapshot, {
      tags: [
        CACHE_TAGS.TIKTOK_AUTHORIZED_SIGNALS,
        SCOPED_CACHE_TAGS.TIKTOK_AUTHORIZED_SIGNALS(organizationId),
        credential.id,
      ],
      ttl:
        snapshot.state === 'stale' || snapshot.state === 'revoked'
          ? TIKTOK_STALE_SIGNALS_CACHE_TTL_SECONDS
          : TIKTOK_AUTHORIZED_SIGNALS_CACHE_TTL_SECONDS,
    });

    this.loggerService.log(`${this.constructorName} refresh completed`, {
      credentialId: credential.id,
      state: snapshot.state,
    });
    return snapshot;
  }
}
