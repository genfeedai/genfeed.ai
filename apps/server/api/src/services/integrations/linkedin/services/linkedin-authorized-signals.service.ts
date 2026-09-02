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
import {
  type AuthorizedSignalsSettledResult,
  retryProviderRequest,
  settleProviderRequest,
} from '@api/services/integrations/_shared/authorized-signals-request.util';
import { LinkedInService } from '@api/services/integrations/linkedin/services/linkedin.service';
import {
  getLinkedinRetryAfterMs,
  isLinkedinAuthorizationError,
  isLinkedinOrganizationSelectionError,
  isLinkedinRateLimitError,
  isLinkedinScopeError,
  parseLinkedinGrantedScopes,
} from '@api/services/integrations/linkedin/utils/linkedin-error.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  type LinkedinAuthorizedSignalEvidence,
  type LinkedinAuthorizedSignalsSnapshot,
  type LinkedinOwnedPostPerformanceSignal,
  type LinkedinOwnedPostSignal,
  linkedinAuthorizedSignalsSnapshotSchema,
} from '@api-types/contracts/linkedin-authorized-signals.contract';
import { CredentialPlatform, TargetExecutionState } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import {
  hasAnyScope,
  hasScope,
  LINKEDIN_MEMBER_POSTS_SCOPE,
  LINKEDIN_MEMBER_PUBLISH_SCOPE,
  LINKEDIN_OPENID_SCOPE,
  LINKEDIN_ORG_ADMIN_SCOPE,
  LINKEDIN_ORG_PUBLISH_SCOPE,
  LINKEDIN_ORG_READ_SCOPE,
  LINKEDIN_PROFILE_SCOPE,
  LinkedInAuthorizedSignalsEvidenceMapper,
  type PlatformEvidenceKey,
  readNonNegativeInteger,
  readRecord,
  readString,
} from './linkedin-authorized-signals-evidence.mapper';

export {
  LINKEDIN_EMAIL_SCOPE,
  LINKEDIN_MEMBER_POSTS_SCOPE,
  LINKEDIN_MEMBER_PUBLISH_SCOPE,
  LINKEDIN_OPENID_SCOPE,
  LINKEDIN_ORG_ADMIN_SCOPE,
  LINKEDIN_ORG_PUBLISH_SCOPE,
  LINKEDIN_ORG_READ_SCOPE,
  LINKEDIN_PROFILE_SCOPE,
} from './linkedin-authorized-signals-evidence.mapper';

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

type LinkedinAuthorizedRefreshContext = {
  accessToken: string;
  cacheKey: string;
  credential: CredentialDocument;
  genfeedEvidence: LinkedinAuthorizedSignalEvidence;
  grantedScopes: string[];
  organizationId: string;
  previousSnapshot: LinkedinAuthorizedSignalsSnapshot | undefined;
  refreshAttemptedAt: string;
};

type GenfeedPublishOutcome =
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'paused'
  | 'cancelled'
  | 'skipped';

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
  private readonly evidenceMapper =
    new LinkedInAuthorizedSignalsEvidenceMapper();

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

  private async fetchAndPersistSnapshot(
    input: LinkedinAuthorizedRefreshContext,
  ): Promise<LinkedinAuthorizedSignalsSnapshot> {
    const {
      accessToken,
      cacheKey,
      credential,
      genfeedEvidence,
      grantedScopes,
      organizationId,
      previousSnapshot,
      refreshAttemptedAt,
    } = input;
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

    const memberId =
      readString(memberProfileResult.value?.id) ??
      readString(credential.externalId);
    const ownedPostsEvidence = this.evidenceMapper.buildOwnedPostsEvidence(
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
      this.evidenceMapper.buildMemberProfileEvidence(
        grantedScopes,
        memberProfileResult,
        previousSnapshot,
        refreshAttemptedAt,
      ),
      this.evidenceMapper.buildOrganizationPageEvidence(
        grantedScopes,
        organizationResult,
        previousSnapshot,
        refreshAttemptedAt,
      ),
      this.evidenceMapper.buildMemberPublishingEvidence(
        grantedScopes,
        memberId,
        memberProfileResult.error,
        previousSnapshot,
        refreshAttemptedAt,
      ),
      this.evidenceMapper.buildOrganizationPublishingEvidence(
        grantedScopes,
        organizationResult,
        previousSnapshot,
        refreshAttemptedAt,
      ),
      ownedPostsEvidence,
      this.evidenceMapper.buildOwnedPostPerformanceEvidence(
        grantedScopes,
        ownedPostsEvidence,
        performanceResult,
        previousSnapshot,
        refreshAttemptedAt,
      ),
      this.evidenceMapper.buildFirstPublishEvidence(
        ownedPostsEvidence,
        refreshAttemptedAt,
      ),
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
      organizationId,
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
          scope: this.evidenceMapper.buildScope(
            this.requiredScopesForKey(key),
            grantedScopes,
          ),
          staleAt: refreshAttemptedAt,
          status: 'revoked' as const,
        };
      }

      return {
        ...this.evidenceMapper.buildUnavailableEvidence(
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
