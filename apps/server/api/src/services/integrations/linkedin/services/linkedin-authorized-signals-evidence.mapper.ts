import {
  isLinkedinOrganizationSelectionError,
  isLinkedinRateLimitError,
  isLinkedinScopeError,
} from '@api/services/integrations/linkedin/utils/linkedin-error.util';
import {
  type LinkedinAuthorizedSignalEvidence,
  type LinkedinAuthorizedSignalReason,
  type LinkedinAuthorizedSignalsSnapshot,
  type LinkedinOwnedPostPerformanceSignal,
  type LinkedinOwnedPostSignal,
  linkedinAuthorizedSignalStatusValues,
} from '@genfeedai/contracts/api-types/contracts/linkedin-authorized-signals.contract';

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

export type PlatformEvidenceKey = Exclude<
  LinkedinAuthorizedSignalEvidence['key'],
  'genfeed-publish-outcomes-observed'
>;

export function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

export function readHttpUrl(value: unknown): string | undefined {
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

export function readNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

export function hasScope(grantedScopes: string[], scope: string): boolean {
  return grantedScopes.includes(scope);
}

export function hasAnyScope(
  grantedScopes: string[],
  scopes: readonly string[],
): boolean {
  return scopes.some((scope) => grantedScopes.includes(scope));
}

export class LinkedInAuthorizedSignalsEvidenceMapper {
  buildMemberProfileEvidence(
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

  buildOrganizationPageEvidence(
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

  buildMemberPublishingEvidence(
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

  buildOrganizationPublishingEvidence(
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

  buildOwnedPostsEvidence(
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

  buildOwnedPostPerformanceEvidence(
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

  buildFirstPublishEvidence(
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

  buildUnavailableEvidence(
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

  fieldNamesForKey(key: PlatformEvidenceKey): readonly string[] {
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

  buildScope(required: string[], grantedScopes: string[]) {
    return {
      granted: grantedScopes.filter((scope) => required.includes(scope)),
      missing: required.filter((scope) => !grantedScopes.includes(scope)),
      required,
    };
  }
}
