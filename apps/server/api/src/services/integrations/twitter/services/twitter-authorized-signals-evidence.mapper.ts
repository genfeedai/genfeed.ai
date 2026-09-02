import {
  isTwitterRateLimitError,
  isTwitterScopeOrTierError,
} from '@api/services/integrations/twitter/utils/twitter-api-error.util';
import {
  type TwitterAuthorizedSignalEvidence,
  type TwitterAuthorizedSignalReason,
  type TwitterAuthorizedSignalsSnapshot,
  type TwitterOwnedPostSignal,
  twitterAuthorizedSignalStatusValues,
  twitterAuthorizedSignalsSnapshotSchema,
} from '@api-types/contracts/twitter-authorized-signals.contract';
import { CredentialPlatform } from '@genfeedai/enums';

export const USERS_READ_SCOPE = 'users.read';
export const TWEET_READ_SCOPE = 'tweet.read';
export const TWEET_WRITE_SCOPE = 'tweet.write';
export const MEDIA_WRITE_SCOPE = 'media.write';

type TwitterSignalFieldStatus =
  (typeof twitterAuthorizedSignalStatusValues)[number];

type PlatformEvidenceKey = Exclude<
  TwitterAuthorizedSignalEvidence['key'],
  'genfeed-publish-activity'
>;

export type TwitterSettledResult<T> = {
  error?: unknown;
  value?: T;
};

export type TwitterOwnedPostsFetch = {
  hasMore: boolean;
  posts: TwitterOwnedPostSignal[];
  rawPostCount: number;
};

export type AssembleTwitterAuthorizedSnapshotInput = {
  credentialId: string;
  genfeedEvidence: TwitterAuthorizedSignalEvidence;
  grantedScopes: string[];
  observedAt: string;
  previousSnapshot?: TwitterAuthorizedSignalsSnapshot;
  tweetsResult: TwitterSettledResult<TwitterOwnedPostsFetch>;
  userInfoResult: TwitterSettledResult<Record<string, unknown>>;
};

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

const PLATFORM_EVIDENCE_KEYS: PlatformEvidenceKey[] = [
  'profile-completeness-signal',
  'profile-statistics-snapshot',
  'owned-posts-snapshot',
  'publishing-capability-snapshot',
  'first-upload-platform-signal',
  'owned-post-metrics-snapshot',
  'native-account-age',
];

function toFieldAvailability(
  entries: ReadonlyArray<readonly [string, TwitterSignalFieldStatus]>,
): Record<string, TwitterSignalFieldStatus> {
  return Object.fromEntries(entries);
}

export function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function readNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

export function readIsoTimestamp(value: unknown): string | undefined {
  const candidate = readString(value);
  if (!candidate) {
    return undefined;
  }

  const date = new Date(candidate);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function readIsoToUnixSeconds(value: unknown): number | undefined {
  const iso = readIsoTimestamp(value);
  if (!iso) {
    return undefined;
  }

  const seconds = Math.floor(Date.parse(iso) / 1000);
  return seconds > 0 ? seconds : undefined;
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

function fieldNamesForKey(key: PlatformEvidenceKey): readonly string[] {
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

function requiredScopesForKey(key: PlatformEvidenceKey): string[] {
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

function buildScope(required: string[], grantedScopes: string[]) {
  return {
    granted: grantedScopes.filter((scope) => required.includes(scope)),
    missing: required.filter((scope) => !grantedScopes.includes(scope)),
    required,
  };
}

function publishingGrantedScopes(grantedScopes: string[]): string[] {
  return grantedScopes.filter((scope) =>
    [TWEET_WRITE_SCOPE, MEDIA_WRITE_SCOPE].includes(scope),
  );
}

function reportScope(
  key: PlatformEvidenceKey,
  requiredScopes: string[],
  grantedScopes: string[],
) {
  const scope = buildScope(requiredScopes, grantedScopes);
  return key === 'publishing-capability-snapshot'
    ? { ...scope, granted: publishingGrantedScopes(grantedScopes) }
    : scope;
}

function buildUnavailableEvidence(
  key: PlatformEvidenceKey,
  requiredScopes: string[],
  grantedScopes: string[],
  error: unknown,
  previousSnapshot: TwitterAuthorizedSignalsSnapshot | undefined,
  observedAt: string,
): TwitterAuthorizedSignalEvidence {
  const scope = buildScope(requiredScopes, grantedScopes);
  const reason: TwitterAuthorizedSignalReason =
    scope.missing.length > 0 || isTwitterScopeOrTierError(error)
      ? 'missing_scope'
      : isTwitterRateLimitError(error)
        ? 'rate_limited'
        : 'provider_error';
  const previous = previousSnapshot?.evidence.find(
    (evidence) => evidence.key === key,
  );
  const reportedScope = reportScope(key, requiredScopes, grantedScopes);

  if (previous && reason !== 'missing_scope') {
    return {
      ...previous,
      reason,
      scope: reportedScope,
      staleAt: observedAt,
      status: 'stale',
    };
  }

  const unavailableStatus: TwitterSignalFieldStatus =
    reason === 'missing_scope' ? 'permission_limited' : 'unavailable';
  const fieldAvailability = toFieldAvailability(
    fieldNamesForKey(key).map(
      (field): readonly [string, TwitterSignalFieldStatus] => [
        field,
        unavailableStatus,
      ],
    ),
  );
  const effectiveScope =
    isTwitterScopeOrTierError(error) && scope.missing.length === 0
      ? { granted: [], missing: requiredScopes, required: requiredScopes }
      : reportedScope;
  const common = {
    fieldAvailability,
    observedAt,
    provenance: 'platform_verified' as const,
    reason,
    scope: effectiveScope,
    staleAt: null,
    status: unavailableStatus,
  };

  switch (key) {
    case 'profile-completeness-signal':
      return { ...common, key };
    case 'profile-statistics-snapshot':
      return { ...common, key };
    case 'owned-posts-snapshot':
      return { ...common, key };
    case 'publishing-capability-snapshot':
      return { ...common, key };
    case 'first-upload-platform-signal':
      return { ...common, key };
    case 'owned-post-metrics-snapshot':
      return { ...common, key };
    case 'native-account-age':
      return { ...common, key };
  }
}

export function buildProfileEvidence(
  grantedScopes: string[],
  result: TwitterSettledResult<Record<string, unknown>>,
  previousSnapshot: TwitterAuthorizedSignalsSnapshot | undefined,
  observedAt: string,
): TwitterAuthorizedSignalEvidence {
  const requiredScopes = [USERS_READ_SCOPE];
  if (!grantedScopes.includes(USERS_READ_SCOPE) || !result.value) {
    return buildUnavailableEvidence(
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
  const scope = buildScope(requiredScopes, grantedScopes);

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

export function buildStatisticsEvidence(
  grantedScopes: string[],
  result: TwitterSettledResult<Record<string, unknown>>,
  previousSnapshot: TwitterAuthorizedSignalsSnapshot | undefined,
  observedAt: string,
): TwitterAuthorizedSignalEvidence {
  const requiredScopes = [USERS_READ_SCOPE];
  const metrics = readRecord(result.value?.public_metrics);
  if (!grantedScopes.includes(USERS_READ_SCOPE) || !result.value) {
    return buildUnavailableEvidence(
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
  const scope = buildScope(requiredScopes, grantedScopes);

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

export function buildOwnedPostsEvidence(
  grantedScopes: string[],
  result: TwitterSettledResult<TwitterOwnedPostsFetch>,
  previousSnapshot: TwitterAuthorizedSignalsSnapshot | undefined,
  observedAt: string,
): TwitterAuthorizedSignalEvidence {
  const requiredScopes = [TWEET_READ_SCOPE];
  if (!result.value) {
    return buildUnavailableEvidence(
      'owned-posts-snapshot',
      requiredScopes,
      grantedScopes,
      result.error,
      previousSnapshot,
      observedAt,
    );
  }

  const scope = buildScope(requiredScopes, grantedScopes);
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

export function buildPublishingCapabilityEvidence(
  grantedScopes: string[],
  result: TwitterSettledResult<Record<string, unknown>>,
  previousSnapshot: TwitterAuthorizedSignalsSnapshot | undefined,
  observedAt: string,
): TwitterAuthorizedSignalEvidence {
  const requiredScopes = [TWEET_WRITE_SCOPE];
  if (!grantedScopes.includes(TWEET_WRITE_SCOPE)) {
    return buildUnavailableEvidence(
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
    isProtected: result.value ? readBoolean(result.value.protected) : undefined,
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
      ...buildScope(requiredScopes, grantedScopes),
      granted: publishingGrantedScopes(grantedScopes),
    },
    staleAt: null,
    status: 'available',
    value,
  };
}

export function buildNativeAccountAgeEvidence(
  grantedScopes: string[],
  result: TwitterSettledResult<Record<string, unknown>>,
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
    return buildUnavailableEvidence(
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
    scope: buildScope(requiredScopes, grantedScopes),
    staleAt: null,
    status: createdAt ? 'available' : 'unavailable',
    value: createdAt ? { createdAt, createTime } : {},
  };
}

export function buildDerivedPostEvidence(
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

export function resolveTwitterAuthorizedSnapshotState(
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

export function buildTwitterRevokedSnapshot(
  credentialId: string,
  grantedScopes: string[],
  previousSnapshot: TwitterAuthorizedSignalsSnapshot | undefined,
  genfeedEvidence: TwitterAuthorizedSignalEvidence,
  refreshAttemptedAt: string,
): TwitterAuthorizedSignalsSnapshot {
  const evidence = PLATFORM_EVIDENCE_KEYS.map((key) => {
    const previous = previousSnapshot?.evidence.find(
      (item) => item.key === key,
    );
    if (previous) {
      return {
        ...previous,
        reason: 'authorization_revoked' as const,
        scope: reportScope(key, requiredScopesForKey(key), grantedScopes),
        staleAt: refreshAttemptedAt,
        status: 'revoked' as const,
      };
    }

    return {
      ...buildUnavailableEvidence(
        key,
        requiredScopesForKey(key),
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

export function assembleTwitterAuthorizedSnapshot(
  input: AssembleTwitterAuthorizedSnapshotInput,
): TwitterAuthorizedSignalsSnapshot {
  const ownedPostsEvidence = buildOwnedPostsEvidence(
    input.grantedScopes,
    input.tweetsResult,
    input.previousSnapshot,
    input.observedAt,
  );
  const evidence: TwitterAuthorizedSignalEvidence[] = [
    buildProfileEvidence(
      input.grantedScopes,
      input.userInfoResult,
      input.previousSnapshot,
      input.observedAt,
    ),
    buildStatisticsEvidence(
      input.grantedScopes,
      input.userInfoResult,
      input.previousSnapshot,
      input.observedAt,
    ),
    ownedPostsEvidence,
    buildPublishingCapabilityEvidence(
      input.grantedScopes,
      input.userInfoResult,
      input.previousSnapshot,
      input.observedAt,
    ),
    ...buildDerivedPostEvidence(ownedPostsEvidence, input.observedAt),
    buildNativeAccountAgeEvidence(
      input.grantedScopes,
      input.userInfoResult,
      input.previousSnapshot,
      input.observedAt,
    ),
    input.genfeedEvidence,
  ];

  return twitterAuthorizedSignalsSnapshotSchema.parse({
    credentialId: input.credentialId,
    evidence,
    grantedScopes: input.grantedScopes,
    platform: CredentialPlatform.TWITTER,
    refreshAttemptedAt: input.observedAt,
    state: resolveTwitterAuthorizedSnapshotState(evidence),
  });
}
