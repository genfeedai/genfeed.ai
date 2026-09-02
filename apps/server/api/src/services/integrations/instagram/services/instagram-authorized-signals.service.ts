import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { SocialWarmupEnrollmentsService } from '@api/collections/social-warmup-enrollments/services/social-warmup-enrollments.service';
import {
  CACHE_PATTERNS,
  CACHE_TAGS,
  SCOPED_CACHE_TAGS,
} from '@api/common/constants/cache-patterns.constants';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { CacheService } from '@api/services/cache/cache.service';
import { mapAuthorizedSignalsOutcome } from '@api/services/integrations/_shared/authorized-signals-outcome.util';
import type { AuthorizedSignalsSettledResult } from '@api/services/integrations/_shared/authorized-signals-request.util';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import {
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
  instagramAuthorizedSignalStatusValues,
  instagramAuthorizedSignalsSnapshotSchema,
} from '@api-types/contracts/instagram-authorized-signals.contract';
import { CredentialPlatform, TargetExecutionState } from '@genfeedai/enums';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import {
  InstagramAuthorizedSignalsProvider,
  type InstagramMediaFetch,
  type InstagramUserResponse,
  readHttpUrl,
  readNonNegativeInteger,
  readRecord,
  readString,
} from './instagram-authorized-signals.provider';

const INSTAGRAM_AUTHORIZED_SIGNALS_CACHE_TTL_SECONDS = 5 * 60;
const INSTAGRAM_STALE_SIGNALS_CACHE_TTL_SECONDS = 60;
const INSTAGRAM_AUTHORIZED_SIGNALS_STORAGE_KEY = 'instagramAuthorized';
const INSTAGRAM_AUTHORIZATION_STORAGE_KEY = 'instagramAuthorization';
const INSTAGRAM_MEDIA_LIMIT = 20;

const BASIC_SCOPE = 'instagram_basic';
const PUBLISH_SCOPE = 'instagram_content_publish';
const INSIGHTS_SCOPE = 'instagram_manage_insights';

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

function isProfessionalAccountType(accountType: string | undefined): boolean {
  return accountType === 'BUSINESS' || accountType === 'MEDIA_CREATOR';
}

@Injectable()
export class InstagramAuthorizedSignalsService {
  private readonly graphUrl = 'https://graph.facebook.com';
  private readonly apiVersion: string;
  private readonly constructorName = this.constructor.name;
  private readonly provider: InstagramAuthorizedSignalsProvider;

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
    this.provider = new InstagramAuthorizedSignalsProvider(
      this.httpService,
      this.graphUrl,
      this.apiVersion,
    );
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
    genfeedEvidence: InstagramAuthorizedSignalEvidence;
    grantedScopes: string[];
    organizationId: string;
    previousSnapshot: InstagramAuthorizedSignalsSnapshot | undefined;
    refreshAttemptedAt: string;
  }): Promise<InstagramAuthorizedSignalsSnapshot> {
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
      readString(credential.externalId),
      grantedScopes,
      BASIC_SCOPE,
      INSIGHTS_SCOPE,
    );
    const { mediaResult, profileResult } = providerResult;
    const authorizationError =
      this.provider.findAuthorizationError(providerResult);

    if (authorizationError) {
      await this.instagramService.handleAuthorizationError(
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
      organizationId,
      cacheKey,
      snapshot,
    );
  }

  private buildProfileEvidence(
    grantedScopes: string[],
    result: AuthorizedSignalsSettledResult<InstagramUserResponse>,
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
    result: AuthorizedSignalsSettledResult<InstagramMediaFetch>,
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
    result: AuthorizedSignalsSettledResult<InstagramUserResponse>,
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
    mediaResult: AuthorizedSignalsSettledResult<InstagramMediaFetch>,
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
    result: AuthorizedSignalsSettledResult<InstagramMediaFetch>,
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
