import { SocialWarmupEnrollmentsService } from '@api/collections/social-warmup-enrollments/services/social-warmup-enrollments.service';
import {
  type AuthorizedSignalsSettledResult,
  retryProviderRequest,
  settleProviderRequest,
} from '@api/services/integrations/_shared/authorized-signals-request.util';
import {
  getLinkedinRetryAfterMs,
  isLinkedinAuthorizationError,
  isLinkedinOrganizationSelectionError,
  isLinkedinRateLimitError,
  isLinkedinScopeError,
  parseLinkedinGrantedScopes,
} from '@api/services/integrations/linkedin/utils/linkedin-error.util';
import {
  type LinkedinAuthorizedSignalEvidence,
  type LinkedinAuthorizedSignalReason,
  type LinkedinAuthorizedSignalsSnapshot,
  type LinkedinOwnedPostPerformanceSignal,
  type LinkedinOwnedPostSignal,
  linkedinAuthorizedSignalStatusValues,
  linkedinAuthorizedSignalsSnapshotSchema,
} from '@api-types/contracts/linkedin-authorized-signals.contract';
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
import { LinkedInService } from '@server/services/integrations/linkedin/services/linkedin.service';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';
import { firstValueFrom } from 'rxjs';

const LINKEDIN_AUTHORIZED_SIGNALS_CACHE_TTL_SECONDS = 5 * 60;
const LINKEDIN_STALE_SIGNALS_CACHE_TTL_SECONDS = 60;
const LINKEDIN_AUTHORIZED_SIGNALS_STORAGE_KEY = 'linkedinAuthorized';
const LINKEDIN_AUTHORIZATION_STORAGE_KEY = 'linkedinAuthorization';
const LINKEDIN_SIGNAL_MAX_ATTEMPTS = 2;
const LINKEDIN_SIGNAL_RETRY_FALLBACK_MS = 1_000;
const LINKEDIN_SIGNAL_RETRY_MAX_MS = 5_000;
const LINKEDIN_SIGNAL_REQUEST_TIMEOUT_MS = 10_000;
const LINKEDIN_POST_LIMIT = 20;
const LINKEDIN_API = 'https://api.linkedin.com/v2';

export const LINKEDIN_OPENID_SCOPE = 'openid';
export const LINKEDIN_PROFILE_SCOPE = 'profile';
export const LINKEDIN_EMAIL_SCOPE = 'email';
export const LINKEDIN_MEMBER_PUBLISH_SCOPE = 'w_member_social';
export const LINKEDIN_MEMBER_POSTS_SCOPE = 'r_member_social';
export const LINKEDIN_ORG_READ_SCOPE = 'r_organization_social';
export const LINKEDIN_ORG_PUBLISH_SCOPE = 'w_organization_social';
export const LINKEDIN_ORG_ADMIN_SCOPE = 'rw_organization_admin';

const MEMBER_PROFILE_FIELDS = [
  'accountKind',
  'email',
  'firstName',
  'id',
  'lastName',
  'name',
  'picture',
] as const;

const ORGANIZATION_PAGE_FIELDS = [
  'accountKind',
  'id',
  'name',
  'role',
  'vanityName',
] as const;

const MEMBER_PUBLISHING_FIELDS = [
  'accountKind',
  'canPublish',
  'personUrn',
] as const;

const ORGANIZATION_PUBLISHING_FIELDS = [
  'accountKind',
  'canPublish',
  'organizationId',
  'organizationUrn',
] as const;

const OWNED_POST_FIELDS = [
  'authorUrn',
  'commentCount',
  'createTime',
  'id',
  'likeCount',
  'mediaType',
  'text',
] as const;

const PERFORMANCE_FIELDS = [
  'clicks',
  'commentCount',
  'id',
  'impressions',
  'likeCount',
  'shares',
  'views',
] as const;

type LinkedinSignalFieldStatus =
  (typeof linkedinAuthorizedSignalStatusValues)[number];

function toFieldAvailability(
  entries: ReadonlyArray<readonly [string, LinkedinSignalFieldStatus]>,
): Record<string, LinkedinSignalFieldStatus> {
  return Object.fromEntries(entries);
}

interface LinkedinUgcPostNode {
  author?: unknown;
  created?: { time?: unknown };
  id?: unknown;
  lastModified?: { time?: unknown };
  specificContent?: {
    'com.linkedin.ugc.ShareContent'?: {
      shareCommentary?: { text?: unknown };
      shareMediaCategory?: unknown;
    };
  };
}

interface LinkedinUgcPostsResponse {
  elements?: LinkedinUgcPostNode[];
  paging?: { start?: unknown; count?: unknown; total?: unknown };
}

interface LinkedinOrganizationAclNode {
  organization?: unknown;
  role?: unknown;
  state?: unknown;
}

interface LinkedinOrganizationAclsResponse {
  elements?: LinkedinOrganizationAclNode[];
}

interface LinkedinOrganizationNode {
  id?: unknown;
  localizedName?: unknown;
  vanityName?: unknown;
}

interface LinkedinSocialActionsResponse {
  commentCount?: unknown;
  likeCount?: unknown;
  viewCount?: unknown;
}

export interface RefreshLinkedinAuthorizedSignalsParams {
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
  LinkedinAuthorizedSignalEvidence['key'],
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
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
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

function hasScope(grantedScopes: string[], scope: string): boolean {
  return grantedScopes.includes(scope);
}

function hasAnyScope(
  grantedScopes: string[],
  scopes: readonly string[],
): boolean {
  return scopes.some((scope) => grantedScopes.includes(scope));
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

function organizationIdFromUrn(urn: string | undefined): string | undefined {
  if (!urn) {
    return undefined;
  }
  const match = urn.match(/urn:li:organization:(\d+)/);
  return match?.[1];
}

@Injectable()
export class LinkedInAuthorizedSignalsService {
  private readonly constructorName = this.constructor.name;

  constructor(
    private readonly cacheService: CacheService,
    private readonly credentialsService: CredentialsService,
    private readonly httpService: HttpService,
    private readonly linkedInService: LinkedInService,
    private readonly loggerService: LoggerService,
    private readonly prisma: PrismaService,
    private readonly socialWarmupEnrollmentsService: SocialWarmupEnrollmentsService,
  ) {}

  async refresh(
    params: RefreshLinkedinAuthorizedSignalsParams,
  ): Promise<LinkedinAuthorizedSignalsSnapshot> {
    const credential = await this.credentialsService.findOne({
      id: params.credentialId,
      organizationId: params.organizationId,
      platform: CredentialPlatform.LINKEDIN,
    });

    if (!credential) {
      throw new NotFoundException('LinkedIn credential');
    }

    const previousSnapshot = this.readStoredSnapshot(credential);
    const cacheKey = CACHE_PATTERNS.LINKEDIN_AUTHORIZED_SIGNALS_SINGLE(
      credential.id,
    );

    if (!params.force) {
      const cached = await this.cacheService.get<unknown>(cacheKey);
      const cachedSnapshot =
        linkedinAuthorizedSignalsSnapshotSchema.safeParse(cached);
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
      accessToken = await this.resolveAccessToken(
        params,
        credential,
        grantedScopes,
      );
      if (params.grantedScopes === undefined) {
        const refreshed = await this.credentialsService.findOne({
          id: credential.id,
          organizationId: params.organizationId,
          platform: CredentialPlatform.LINKEDIN,
        });
        grantedScopes = this.resolveGrantedScopes(
          undefined,
          refreshed ?? credential,
          previousSnapshot,
        );
      }
    } catch (error: unknown) {
      if (this.isAuthorizationFailure(error)) {
        await this.markCredentialDisconnected(credential.id);
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

    const memberProfilePromise = hasAnyScope(grantedScopes, [
      LINKEDIN_OPENID_SCOPE,
      LINKEDIN_PROFILE_SCOPE,
    ])
      ? this.requestWithRetry(() =>
          this.linkedInService.getUserProfile(accessToken),
        )
      : undefined;
    const ownedPostsPromise = hasScope(
      grantedScopes,
      LINKEDIN_MEMBER_POSTS_SCOPE,
    )
      ? this.requestWithRetry(() =>
          this.fetchOwnedPosts(accessToken, credential.externalId),
        )
      : undefined;
    const organizationPromise = hasAnyScope(grantedScopes, [
      LINKEDIN_ORG_READ_SCOPE,
      LINKEDIN_ORG_ADMIN_SCOPE,
    ])
      ? this.requestWithRetry(() => this.fetchOrganizationPage(accessToken))
      : undefined;

    const [memberProfileResult, ownedPostsResult, organizationResult] =
      await Promise.all([
        this.settle(memberProfilePromise),
        this.settle(ownedPostsPromise),
        this.settle(organizationPromise),
      ]);

    const authorizationError = [
      memberProfileResult.error,
      ownedPostsResult.error,
      organizationResult.error,
    ].find(
      (error) => error !== undefined && this.isAuthorizationFailure(error),
    );

    if (authorizationError) {
      await this.markCredentialDisconnected(credential.id);
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

    const memberId =
      readString(memberProfileResult.value?.id) ??
      readString(credential.externalId);
    const ownedPostsEvidence = this.buildOwnedPostsEvidence(
      grantedScopes,
      ownedPostsResult,
      previousSnapshot,
      refreshAttemptedAt,
    );
    const performancePromise =
      ownedPostsEvidence.status === 'available' &&
      ownedPostsEvidence.key === 'owned-posts-snapshot' &&
      (ownedPostsEvidence.value?.posts.length ?? 0) > 0
        ? this.requestWithRetry(() =>
            this.fetchPostPerformance(
              accessToken,
              ownedPostsEvidence.value?.posts ?? [],
            ),
          )
        : undefined;
    const performanceResult = await this.settle(performancePromise);

    const evidence: LinkedinAuthorizedSignalEvidence[] = [
      this.buildMemberProfileEvidence(
        grantedScopes,
        memberProfileResult,
        previousSnapshot,
        refreshAttemptedAt,
      ),
      this.buildOrganizationPageEvidence(
        grantedScopes,
        organizationResult,
        previousSnapshot,
        refreshAttemptedAt,
      ),
      this.buildMemberPublishingEvidence(
        grantedScopes,
        memberId,
        memberProfileResult.error,
        previousSnapshot,
        refreshAttemptedAt,
      ),
      this.buildOrganizationPublishingEvidence(
        grantedScopes,
        organizationResult,
        previousSnapshot,
        refreshAttemptedAt,
      ),
      ownedPostsEvidence,
      this.buildOwnedPostPerformanceEvidence(
        grantedScopes,
        ownedPostsEvidence,
        performanceResult,
        previousSnapshot,
        refreshAttemptedAt,
      ),
      this.buildFirstPublishEvidence(ownedPostsEvidence, refreshAttemptedAt),
      genfeedEvidence,
    ];
    const snapshot = linkedinAuthorizedSignalsSnapshotSchema.parse({
      credentialId: credential.id,
      evidence,
      grantedScopes,
      platform: CredentialPlatform.LINKEDIN,
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

  private async resolveAccessToken(
    params: RefreshLinkedinAuthorizedSignalsParams,
    credential: CredentialDocument,
    _grantedScopes: string[],
  ): Promise<string> {
    if (params.accessToken) {
      return params.accessToken;
    }

    const expiry =
      credential.accessTokenExpiry instanceof Date
        ? credential.accessTokenExpiry
        : credential.accessTokenExpiry
          ? new Date(credential.accessTokenExpiry)
          : undefined;
    const isExpired =
      expiry !== undefined && !Number.isNaN(expiry.getTime())
        ? expiry.getTime() <= Date.now()
        : false;

    if (isExpired && credential.brandId) {
      const refreshed = await this.linkedInService.refreshToken(
        params.organizationId,
        credential.brandId,
      );
      const storedToken = refreshed.accessToken ?? credential.accessToken;
      if (!storedToken) {
        throw new Error('LinkedIn credential is missing an access token');
      }
      return EncryptionUtil.decrypt(storedToken);
    }

    const storedToken = credential.accessToken;
    if (!storedToken) {
      throw new Error('LinkedIn credential is missing an access token');
    }
    return EncryptionUtil.decrypt(storedToken);
  }

  private async markCredentialDisconnected(
    credentialId: string,
  ): Promise<void> {
    await this.credentialsService.patch(credentialId, { isConnected: false });
  }

  private async fetchOwnedPosts(
    accessToken: string,
    externalId: string | null | undefined,
  ): Promise<{
    hasMore: boolean;
    posts: LinkedinOwnedPostSignal[];
    rawCount: number;
  }> {
    const memberId = readString(externalId);
    if (!memberId) {
      throw {
        response: {
          data: { message: 'Missing LinkedIn member id', status: 400 },
          status: 400,
        },
      };
    }

    const personUrn = `urn:li:person:${memberId}`;
    const response = await firstValueFrom(
      this.httpService.get<LinkedinUgcPostsResponse>(
        `${LINKEDIN_API}/ugcPosts`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'X-Restli-Protocol-Version': '2.0.0',
          },
          params: {
            authors: `List(${personUrn})`,
            count: LINKEDIN_POST_LIMIT,
            q: 'authors',
          },
          timeout: LINKEDIN_SIGNAL_REQUEST_TIMEOUT_MS,
        },
      ),
    );
    const rawPosts = Array.isArray(response.data?.elements)
      ? response.data.elements
      : [];
    const posts = rawPosts.flatMap((node) => {
      const mapped = this.mapOwnedPost(node);
      return mapped ? [mapped] : [];
    });
    const total = readNonNegativeInteger(response.data?.paging?.total);

    return {
      hasMore: total !== undefined ? total > posts.length : false,
      posts,
      rawCount: rawPosts.length,
    };
  }

  private mapOwnedPost(
    node: LinkedinUgcPostNode,
  ): LinkedinOwnedPostSignal | undefined {
    const id = readString(node.id);
    if (!id) {
      return undefined;
    }

    const share = node.specificContent?.['com.linkedin.ugc.ShareContent'];
    const createdAt = readNonNegativeInteger(node.created?.time);
    return {
      authorUrn: readString(node.author),
      createTime:
        createdAt !== undefined ? Math.floor(createdAt / 1000) : undefined,
      id,
      mediaType: readString(share?.shareMediaCategory),
      text: readString(share?.shareCommentary?.text),
    };
  }

  private async fetchOrganizationPage(accessToken: string): Promise<{
    id?: string;
    name?: string;
    role?: string;
    vanityName?: string;
  }> {
    const aclResponse = await firstValueFrom(
      this.httpService.get<LinkedinOrganizationAclsResponse>(
        `${LINKEDIN_API}/organizationAcls`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'X-Restli-Protocol-Version': '2.0.0',
          },
          params: { q: 'roleAssignee' },
          timeout: LINKEDIN_SIGNAL_REQUEST_TIMEOUT_MS,
        },
      ),
    );
    const acls = Array.isArray(aclResponse.data?.elements)
      ? aclResponse.data.elements
      : [];
    const approved = acls.find((acl) => readString(acl.state) === 'APPROVED');
    const selected = approved ?? acls[0];
    const organizationUrn = readString(selected?.organization);
    const organizationId = organizationIdFromUrn(organizationUrn);

    if (!organizationId) {
      throw {
        response: {
          data: {
            message: 'No organization ACL found for this company page',
            status: 400,
          },
          status: 400,
        },
      };
    }

    const organizationResponse = await firstValueFrom(
      this.httpService.get<LinkedinOrganizationNode>(
        `${LINKEDIN_API}/organizations/${organizationId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'X-Restli-Protocol-Version': '2.0.0',
          },
          timeout: LINKEDIN_SIGNAL_REQUEST_TIMEOUT_MS,
        },
      ),
    );

    return {
      id: organizationId,
      name: readString(organizationResponse.data?.localizedName),
      role: readString(selected?.role),
      vanityName: readString(organizationResponse.data?.vanityName),
    };
  }

  private async fetchPostPerformance(
    accessToken: string,
    posts: LinkedinOwnedPostSignal[],
  ): Promise<LinkedinOwnedPostPerformanceSignal[]> {
    const results = await Promise.all(
      posts.slice(0, LINKEDIN_POST_LIMIT).map(async (post) => {
        try {
          const response = await firstValueFrom(
            this.httpService.get<LinkedinSocialActionsResponse>(
              `${LINKEDIN_API}/socialActions/${encodeURIComponent(post.id)}`,
              {
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  'X-Restli-Protocol-Version': '2.0.0',
                },
                timeout: LINKEDIN_SIGNAL_REQUEST_TIMEOUT_MS,
              },
            ),
          );
          return {
            commentCount: readNonNegativeInteger(response.data?.commentCount),
            id: post.id,
            likeCount: readNonNegativeInteger(response.data?.likeCount),
            views: readNonNegativeInteger(response.data?.viewCount),
          } satisfies LinkedinOwnedPostPerformanceSignal;
        } catch {
          return { id: post.id } satisfies LinkedinOwnedPostPerformanceSignal;
        }
      }),
    );

    return results;
  }

  private async requestWithRetry<T>(request: () => Promise<T>): Promise<T> {
    return retryProviderRequest(request, {
      getDelayMs: (error, attempt) =>
        getLinkedinRetryAfterMs(
          error,
          LINKEDIN_SIGNAL_RETRY_FALLBACK_MS * 2 ** attempt,
          LINKEDIN_SIGNAL_RETRY_MAX_MS,
        ),
      isRetryable: isLinkedinRateLimitError,
      maxAttempts: LINKEDIN_SIGNAL_MAX_ATTEMPTS,
    });
  }

  private async settle<T>(
    promise: Promise<T> | undefined,
  ): Promise<AuthorizedSignalsSettledResult<T>> {
    return settleProviderRequest(promise);
  }

  private isAuthorizationFailure(error: unknown): boolean {
    return (
      !isLinkedinScopeError(error) &&
      !isLinkedinOrganizationSelectionError(error) &&
      isLinkedinAuthorizationError(error)
    );
  }

  private buildMemberProfileEvidence(
    grantedScopes: string[],
    result: {
      error?: unknown;
      value?: {
        email?: string;
        firstName: string;
        id: string;
        lastName: string;
        picture?: string;
      };
    },
    previousSnapshot: LinkedinAuthorizedSignalsSnapshot | undefined,
    observedAt: string,
  ): LinkedinAuthorizedSignalEvidence {
    const requiredScopes = [LINKEDIN_OPENID_SCOPE, LINKEDIN_PROFILE_SCOPE];
    if (!result.value) {
      return this.buildUnavailableEvidence(
        'member-profile-fields-platform-signal',
        requiredScopes,
        grantedScopes,
        result.error,
        previousSnapshot,
        observedAt,
      );
    }

    const name = `${result.value.firstName} ${result.value.lastName}`.trim();
    const value = {
      accountKind: 'member' as const,
      email: result.value.email,
      firstName: result.value.firstName,
      id: result.value.id,
      lastName: result.value.lastName,
      name: name.length > 0 ? name : undefined,
      picture: readHttpUrl(result.value.picture),
    };
    const fieldAvailability = toFieldAvailability(
      MEMBER_PROFILE_FIELDS.map((field) => [
        field,
        value[field] === undefined ? 'unavailable' : 'available',
      ]),
    );

    return {
      fieldAvailability,
      key: 'member-profile-fields-platform-signal',
      observedAt,
      provenance: 'platform_verified',
      scope: this.buildScope(requiredScopes, grantedScopes),
      staleAt: null,
      status: 'available',
      value,
    };
  }

  private buildOrganizationPageEvidence(
    grantedScopes: string[],
    result: {
      error?: unknown;
      value?: {
        id?: string;
        name?: string;
        role?: string;
        vanityName?: string;
      };
    },
    previousSnapshot: LinkedinAuthorizedSignalsSnapshot | undefined,
    observedAt: string,
  ): LinkedinAuthorizedSignalEvidence {
    const requiredScopes = [LINKEDIN_ORG_READ_SCOPE];
    if (
      !hasAnyScope(grantedScopes, [
        LINKEDIN_ORG_READ_SCOPE,
        LINKEDIN_ORG_ADMIN_SCOPE,
      ])
    ) {
      return this.buildUnavailableEvidence(
        'organization-page-snapshot',
        requiredScopes,
        grantedScopes,
        result.error,
        previousSnapshot,
        observedAt,
      );
    }

    if (!result.value) {
      return this.buildUnavailableEvidence(
        'organization-page-snapshot',
        requiredScopes,
        grantedScopes,
        result.error,
        previousSnapshot,
        observedAt,
      );
    }

    const value = {
      accountKind: 'organization' as const,
      id: result.value.id,
      name: result.value.name,
      role: result.value.role,
      vanityName: result.value.vanityName,
    };
    const fieldAvailability = toFieldAvailability(
      ORGANIZATION_PAGE_FIELDS.map((field) => [
        field,
        value[field] === undefined ? 'unavailable' : 'available',
      ]),
    );

    return {
      fieldAvailability,
      key: 'organization-page-snapshot',
      observedAt,
      provenance: 'platform_verified',
      scope: this.buildScope(
        requiredScopes,
        hasScope(grantedScopes, LINKEDIN_ORG_ADMIN_SCOPE)
          ? [...grantedScopes, LINKEDIN_ORG_READ_SCOPE]
          : grantedScopes,
      ),
      staleAt: null,
      status: 'available',
      value,
    };
  }

  private buildMemberPublishingEvidence(
    grantedScopes: string[],
    memberId: string | undefined,
    error: unknown,
    previousSnapshot: LinkedinAuthorizedSignalsSnapshot | undefined,
    observedAt: string,
  ): LinkedinAuthorizedSignalEvidence {
    const requiredScopes = [LINKEDIN_MEMBER_PUBLISH_SCOPE];
    if (!hasScope(grantedScopes, LINKEDIN_MEMBER_PUBLISH_SCOPE)) {
      return this.buildUnavailableEvidence(
        'member-publishing-capability-snapshot',
        requiredScopes,
        grantedScopes,
        error,
        previousSnapshot,
        observedAt,
      );
    }

    const value = {
      accountKind: 'member' as const,
      canPublish: true,
      personUrn: memberId ? `urn:li:person:${memberId}` : undefined,
    };
    const fieldAvailability = toFieldAvailability(
      MEMBER_PUBLISHING_FIELDS.map((field) => [
        field,
        value[field] === undefined ? 'unavailable' : 'available',
      ]),
    );

    return {
      fieldAvailability,
      key: 'member-publishing-capability-snapshot',
      observedAt,
      provenance: 'platform_verified',
      scope: this.buildScope(requiredScopes, grantedScopes),
      staleAt: null,
      status: 'available',
      value,
    };
  }

  private buildOrganizationPublishingEvidence(
    grantedScopes: string[],
    organizationResult: {
      error?: unknown;
      value?: { id?: string };
    },
    previousSnapshot: LinkedinAuthorizedSignalsSnapshot | undefined,
    observedAt: string,
  ): LinkedinAuthorizedSignalEvidence {
    const requiredScopes = [LINKEDIN_ORG_PUBLISH_SCOPE];
    const hasOrgPage = Boolean(organizationResult.value?.id);
    if (!hasScope(grantedScopes, LINKEDIN_ORG_PUBLISH_SCOPE) || !hasOrgPage) {
      const reason: LinkedinAuthorizedSignalReason | undefined = !hasScope(
        grantedScopes,
        LINKEDIN_ORG_PUBLISH_SCOPE,
      )
        ? 'missing_scope'
        : isLinkedinOrganizationSelectionError(organizationResult.error)
          ? 'organization_page_selection_required'
          : organizationResult.error
            ? undefined
            : 'organization_page_selection_required';

      if (
        reason === 'missing_scope' ||
        reason === 'organization_page_selection_required'
      ) {
        return this.buildUnavailableEvidence(
          'organization-publishing-capability-snapshot',
          requiredScopes,
          grantedScopes,
          organizationResult.error ?? {
            response: {
              data: {
                message: 'No organization ACL found for this company page',
                status: 400,
              },
              status: 400,
            },
          },
          previousSnapshot,
          observedAt,
        );
      }

      return this.buildUnavailableEvidence(
        'organization-publishing-capability-snapshot',
        requiredScopes,
        grantedScopes,
        organizationResult.error,
        previousSnapshot,
        observedAt,
      );
    }

    const organizationId = organizationResult.value?.id;
    const value = {
      accountKind: 'organization' as const,
      canPublish: true,
      organizationId,
      organizationUrn: organizationId
        ? `urn:li:organization:${organizationId}`
        : undefined,
    };
    const fieldAvailability = toFieldAvailability(
      ORGANIZATION_PUBLISHING_FIELDS.map((field) => [
        field,
        value[field] === undefined ? 'unavailable' : 'available',
      ]),
    );

    return {
      fieldAvailability,
      key: 'organization-publishing-capability-snapshot',
      observedAt,
      provenance: 'platform_verified',
      scope: this.buildScope(requiredScopes, grantedScopes),
      staleAt: null,
      status: 'available',
      value,
    };
  }

  private buildOwnedPostsEvidence(
    grantedScopes: string[],
    result: {
      error?: unknown;
      value?: {
        hasMore: boolean;
        posts: LinkedinOwnedPostSignal[];
        rawCount: number;
      };
    },
    previousSnapshot: LinkedinAuthorizedSignalsSnapshot | undefined,
    observedAt: string,
  ): LinkedinAuthorizedSignalEvidence {
    const requiredScopes = [LINKEDIN_MEMBER_POSTS_SCOPE];
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

    const malformedResponse =
      result.value.rawCount > 0 && result.value.posts.length === 0;
    const fieldAvailability = toFieldAvailability(
      OWNED_POST_FIELDS.map((field) => [
        field,
        result.value?.posts.length === 0 ||
        result.value?.posts.every((item) => item[field] !== undefined)
          ? 'available'
          : 'unavailable',
      ]),
    );

    return {
      fieldAvailability,
      key: 'owned-posts-snapshot',
      observedAt,
      provenance: 'platform_verified',
      ...(malformedResponse ? { reason: 'empty_response' as const } : {}),
      scope: this.buildScope(requiredScopes, grantedScopes),
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

  private buildOwnedPostPerformanceEvidence(
    grantedScopes: string[],
    ownedPosts: LinkedinAuthorizedSignalEvidence,
    result: {
      error?: unknown;
      value?: LinkedinOwnedPostPerformanceSignal[];
    },
    previousSnapshot: LinkedinAuthorizedSignalsSnapshot | undefined,
    observedAt: string,
  ): LinkedinAuthorizedSignalEvidence {
    const requiredScopes = [LINKEDIN_MEMBER_POSTS_SCOPE];
    if (ownedPosts.key !== 'owned-posts-snapshot') {
      return this.buildUnavailableEvidence(
        'owned-post-performance-snapshot',
        requiredScopes,
        grantedScopes,
        result.error,
        previousSnapshot,
        observedAt,
      );
    }

    if (ownedPosts.status === 'permission_limited') {
      return this.buildUnavailableEvidence(
        'owned-post-performance-snapshot',
        requiredScopes,
        grantedScopes,
        undefined,
        previousSnapshot,
        observedAt,
      );
    }

    if (ownedPosts.status === 'empty') {
      return {
        fieldAvailability: toFieldAvailability(
          PERFORMANCE_FIELDS.map((field) => [field, 'available'] as const),
        ),
        key: 'owned-post-performance-snapshot',
        observedAt: ownedPosts.observedAt ?? observedAt,
        provenance: 'platform_verified',
        scope: this.buildScope(requiredScopes, grantedScopes),
        staleAt: ownedPosts.staleAt,
        status: 'empty',
        value: { posts: [] },
      };
    }

    if (!result.value) {
      return this.buildUnavailableEvidence(
        'owned-post-performance-snapshot',
        requiredScopes,
        grantedScopes,
        result.error,
        previousSnapshot,
        observedAt,
      );
    }

    const fieldAvailability = toFieldAvailability(
      PERFORMANCE_FIELDS.map((field) => [
        field,
        result.value?.length === 0 ||
        result.value?.every((item) => item[field] !== undefined)
          ? 'available'
          : 'unavailable',
      ]),
    );

    return {
      fieldAvailability,
      key: 'owned-post-performance-snapshot',
      observedAt: ownedPosts.observedAt ?? observedAt,
      provenance: 'platform_verified',
      scope: this.buildScope(requiredScopes, grantedScopes),
      staleAt: ownedPosts.staleAt,
      status: result.value.length === 0 ? 'empty' : 'available',
      value: { posts: result.value },
    };
  }

  private buildFirstPublishEvidence(
    ownedPosts: LinkedinAuthorizedSignalEvidence,
    observedAt: string,
  ): LinkedinAuthorizedSignalEvidence {
    if (ownedPosts.key !== 'owned-posts-snapshot') {
      throw new Error('LinkedIn owned-posts evidence is missing');
    }

    const posts = ownedPosts.value?.posts ?? [];
    return {
      fieldAvailability: ownedPosts.fieldAvailability,
      key: 'first-publish-platform-signal',
      observedAt: ownedPosts.observedAt ?? observedAt,
      provenance: 'platform_verified',
      ...(ownedPosts.reason ? { reason: ownedPosts.reason } : {}),
      scope: ownedPosts.scope,
      staleAt: ownedPosts.staleAt,
      status: ownedPosts.status,
      value: posts.length > 0 ? { post: posts[0] } : {},
    };
  }

  private buildUnavailableEvidence(
    key: PlatformEvidenceKey,
    requiredScopes: string[],
    grantedScopes: string[],
    error: unknown,
    previousSnapshot: LinkedinAuthorizedSignalsSnapshot | undefined,
    observedAt: string,
  ): LinkedinAuthorizedSignalEvidence {
    const scope = this.buildScope(requiredScopes, grantedScopes);
    const reason: LinkedinAuthorizedSignalReason =
      scope.missing.length > 0 || isLinkedinScopeError(error)
        ? 'missing_scope'
        : isLinkedinOrganizationSelectionError(error)
          ? 'organization_page_selection_required'
          : isLinkedinRateLimitError(error)
            ? 'rate_limited'
            : 'provider_error';
    const previous = previousSnapshot?.evidence.find(
      (evidence) => evidence.key === key,
    );

    if (
      previous &&
      reason !== 'missing_scope' &&
      reason !== 'organization_page_selection_required'
    ) {
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
      isLinkedinScopeError(error) && scope.missing.length === 0
        ? { granted: [], missing: requiredScopes, required: requiredScopes }
        : scope;

    return {
      fieldAvailability: toFieldAvailability(
        fieldNames.map((field) => [
          field,
          reason === 'missing_scope' ||
          reason === 'organization_page_selection_required'
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
        reason === 'missing_scope' ||
        reason === 'organization_page_selection_required'
          ? 'permission_limited'
          : 'unavailable',
    } as LinkedinAuthorizedSignalEvidence;
  }

  private fieldNamesForKey(key: PlatformEvidenceKey): readonly string[] {
    if (key === 'member-profile-fields-platform-signal') {
      return MEMBER_PROFILE_FIELDS;
    }
    if (key === 'organization-page-snapshot') {
      return ORGANIZATION_PAGE_FIELDS;
    }
    if (key === 'member-publishing-capability-snapshot') {
      return MEMBER_PUBLISHING_FIELDS;
    }
    if (key === 'organization-publishing-capability-snapshot') {
      return ORGANIZATION_PUBLISHING_FIELDS;
    }
    if (key === 'owned-post-performance-snapshot') {
      return PERFORMANCE_FIELDS;
    }
    return OWNED_POST_FIELDS;
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
  ): Promise<LinkedinAuthorizedSignalEvidence> {
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
      take: LINKEDIN_POST_LIMIT,
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
    previousSnapshot: LinkedinAuthorizedSignalsSnapshot | undefined,
    genfeedEvidence: LinkedinAuthorizedSignalEvidence,
    refreshAttemptedAt: string,
  ): LinkedinAuthorizedSignalsSnapshot {
    const keys: PlatformEvidenceKey[] = [
      'member-profile-fields-platform-signal',
      'organization-page-snapshot',
      'member-publishing-capability-snapshot',
      'organization-publishing-capability-snapshot',
      'owned-posts-snapshot',
      'owned-post-performance-snapshot',
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

    return linkedinAuthorizedSignalsSnapshotSchema.parse({
      credentialId,
      evidence: [...evidence, genfeedEvidence],
      grantedScopes,
      platform: CredentialPlatform.LINKEDIN,
      refreshAttemptedAt,
      state: 'revoked',
    });
  }

  private requiredScopesForKey(key: PlatformEvidenceKey): string[] {
    if (key === 'member-publishing-capability-snapshot') {
      return [LINKEDIN_MEMBER_PUBLISH_SCOPE];
    }
    if (key === 'organization-page-snapshot') {
      return [LINKEDIN_ORG_READ_SCOPE];
    }
    if (key === 'organization-publishing-capability-snapshot') {
      return [LINKEDIN_ORG_PUBLISH_SCOPE];
    }
    if (
      key === 'owned-posts-snapshot' ||
      key === 'owned-post-performance-snapshot' ||
      key === 'first-publish-platform-signal'
    ) {
      return [LINKEDIN_MEMBER_POSTS_SCOPE];
    }
    return [LINKEDIN_OPENID_SCOPE, LINKEDIN_PROFILE_SCOPE];
  }

  private resolveSnapshotState(
    evidence: LinkedinAuthorizedSignalEvidence[],
  ): LinkedinAuthorizedSignalsSnapshot['state'] {
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
    previousSnapshot: LinkedinAuthorizedSignalsSnapshot | undefined,
  ): string[] {
    const stored = readRecord(credential.warmupSignals);
    const authorization = readRecord(
      stored[LINKEDIN_AUTHORIZATION_STORAGE_KEY],
    );
    const persistedScopes =
      Array.isArray(credential.grantedScopes) &&
      credential.grantedScopes.length > 0
        ? credential.grantedScopes
        : undefined;

    return parseLinkedinGrantedScopes(
      explicitScopes ??
        persistedScopes ??
        authorization.grantedScopes ??
        previousSnapshot?.grantedScopes,
    );
  }

  private readStoredSnapshot(
    credential: CredentialDocument,
  ): LinkedinAuthorizedSignalsSnapshot | undefined {
    const stored = readRecord(credential.warmupSignals);
    const parsed = linkedinAuthorizedSignalsSnapshotSchema.safeParse(
      stored[LINKEDIN_AUTHORIZED_SIGNALS_STORAGE_KEY],
    );

    return parsed.success ? parsed.data : undefined;
  }

  private async persistSnapshot(
    credential: CredentialDocument,
    organizationId: string,
    cacheKey: string,
    snapshot: LinkedinAuthorizedSignalsSnapshot,
  ): Promise<LinkedinAuthorizedSignalsSnapshot> {
    await this.credentialsService.mergeWarmupSignals(
      credential.id,
      organizationId,
      {
        [LINKEDIN_AUTHORIZATION_STORAGE_KEY]: {
          grantedScopes: snapshot.grantedScopes,
          observedAt: snapshot.refreshAttemptedAt,
        },
        [LINKEDIN_AUTHORIZED_SIGNALS_STORAGE_KEY]: snapshot,
      },
    );
    if (credential.brandId) {
      await this.socialWarmupEnrollmentsService.syncLinkedinAuthorizedSnapshot({
        brandId: credential.brandId,
        credentialId: credential.id,
        organizationId,
        snapshot,
      });
    }
    await this.cacheService.set(cacheKey, snapshot, {
      tags: [
        CACHE_TAGS.LINKEDIN_AUTHORIZED_SIGNALS,
        SCOPED_CACHE_TAGS.LINKEDIN_AUTHORIZED_SIGNALS(organizationId),
        credential.id,
      ],
      ttl:
        snapshot.state === 'stale' || snapshot.state === 'revoked'
          ? LINKEDIN_STALE_SIGNALS_CACHE_TTL_SECONDS
          : LINKEDIN_AUTHORIZED_SIGNALS_CACHE_TTL_SECONDS,
    });

    this.loggerService.log(`${this.constructorName} refresh completed`, {
      credentialId: credential.id,
      state: snapshot.state,
    });
    return snapshot;
  }
}
