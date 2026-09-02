import { CredentialPlatform } from '@genfeedai/contracts';
import {
  type TwitterAuthorizedSignalEvidence,
  type TwitterAuthorizedSignalsSnapshot,
  type TwitterOwnedPostSignal,
  twitterAuthorizedSignalsSnapshotSchema,
} from '@genfeedai/contracts/api-types/contracts/twitter-authorized-signals.contract';
import {
  assembleTwitterAuthorizedSnapshot,
  buildDerivedPostEvidence,
  buildNativeAccountAgeEvidence,
  buildOwnedPostsEvidence,
  buildProfileEvidence,
  buildPublishingCapabilityEvidence,
  buildStatisticsEvidence,
  buildTwitterRevokedSnapshot,
  MEDIA_WRITE_SCOPE,
  resolveTwitterAuthorizedSnapshotState,
  TWEET_READ_SCOPE,
  TWEET_WRITE_SCOPE,
  USERS_READ_SCOPE,
} from './twitter-authorized-signals-evidence.mapper';

const observedAt = '2026-08-14T08:00:00.000Z';
const previousObservedAt = '2026-08-13T08:00:00.000Z';
const fullScopes = [
  TWEET_READ_SCOPE,
  TWEET_WRITE_SCOPE,
  USERS_READ_SCOPE,
  MEDIA_WRITE_SCOPE,
  'offline.access',
];

function evidenceOf(
  snapshot: TwitterAuthorizedSignalsSnapshot,
  key: TwitterAuthorizedSignalEvidence['key'],
) {
  const evidence = snapshot.evidence.find((item) => item.key === key);
  if (!evidence) {
    throw new Error(`Missing evidence ${key}`);
  }
  return evidence;
}

function makeGenfeedEvidence(
  status: 'available' | 'empty' = 'empty',
): TwitterAuthorizedSignalEvidence {
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
    status,
    value: { attempts: [] },
  };
}

function makeUserInfo(overrides: Record<string, unknown> = {}) {
  return {
    created_at: '2018-01-01T00:00:00.000Z',
    description: 'Niche creator',
    id: 'user-1',
    location: 'Earth',
    name: 'Creator',
    profile_image_url: 'https://x.example/avatar.jpg',
    protected: false,
    public_metrics: {
      followers_count: 10,
      following_count: 4,
      like_count: 2,
      listed_count: 1,
      tweet_count: 3,
    },
    url: 'https://x.com/creator',
    username: 'creator',
    verified: false,
    verified_type: 'none',
    ...overrides,
  };
}

function makeOwnedPost(
  overrides: Partial<TwitterOwnedPostSignal> = {},
): TwitterOwnedPostSignal {
  return {
    conversationId: 'tweet-1',
    createdAt: '2024-08-07T00:00:00.000Z',
    createTime: 1_723_000_000,
    id: 'tweet-1',
    impressionCount: 12,
    isQuote: false,
    isReply: false,
    isRetweet: false,
    likeCount: 4,
    quoteCount: 0,
    replyCount: 0,
    replySettings: 'everyone',
    retweetCount: 0,
    text: 'First original',
    ...overrides,
  };
}

function makePreviousSnapshot(): TwitterAuthorizedSignalsSnapshot {
  const scope = {
    granted: [TWEET_READ_SCOPE],
    missing: [],
    required: [TWEET_READ_SCOPE],
  };
  const common = {
    fieldAvailability: { id: 'available' as const },
    observedAt: previousObservedAt,
    provenance: 'platform_verified' as const,
    scope,
    staleAt: null,
    status: 'available' as const,
  };
  const post = makeOwnedPost();

  return twitterAuthorizedSignalsSnapshotSchema.parse({
    credentialId: 'credential-1',
    evidence: [
      {
        ...common,
        key: 'profile-completeness-signal',
        scope: {
          granted: [USERS_READ_SCOPE],
          missing: [],
          required: [USERS_READ_SCOPE],
        },
        value: { name: 'Creator', username: 'creator' },
      },
      {
        ...common,
        key: 'profile-statistics-snapshot',
        scope: {
          granted: [USERS_READ_SCOPE],
          missing: [],
          required: [USERS_READ_SCOPE],
        },
        value: { followersCount: 10, tweetCount: 1 },
      },
      {
        ...common,
        key: 'owned-posts-snapshot',
        value: { hasMore: false, posts: [post] },
      },
      {
        ...common,
        key: 'publishing-capability-snapshot',
        scope: {
          granted: [TWEET_WRITE_SCOPE],
          missing: [],
          required: [TWEET_WRITE_SCOPE],
        },
        value: { canPublish: true, canUploadMedia: true },
      },
      {
        ...common,
        key: 'first-upload-platform-signal',
        value: {
          createTime: post.createTime,
          createdAt: post.createdAt,
          post,
        },
      },
      {
        ...common,
        key: 'owned-post-metrics-snapshot',
        value: { posts: [post] },
      },
      {
        ...common,
        key: 'native-account-age',
        scope: {
          granted: [USERS_READ_SCOPE],
          missing: [],
          required: [USERS_READ_SCOPE],
        },
        value: {
          createdAt: '2018-01-01T00:00:00.000Z',
          createTime: 1_514_764_800,
        },
      },
      makeGenfeedEvidence(),
    ],
    grantedScopes: fullScopes,
    platform: CredentialPlatform.TWITTER,
    refreshAttemptedAt: previousObservedAt,
    state: 'full',
  });
}

function assemble(options?: {
  grantedScopes?: string[];
  previousSnapshot?: TwitterAuthorizedSignalsSnapshot;
  tweetsError?: unknown;
  tweetsValue?: {
    hasMore: boolean;
    posts: ReturnType<typeof makeOwnedPost>[];
    rawPostCount: number;
  };
  userError?: unknown;
  userValue?: Record<string, unknown>;
}) {
  const grantedScopes = options?.grantedScopes ?? fullScopes;
  const hasUsersRead = grantedScopes.includes(USERS_READ_SCOPE);
  const hasTweetRead = grantedScopes.includes(TWEET_READ_SCOPE);

  return assembleTwitterAuthorizedSnapshot({
    credentialId: 'credential-1',
    genfeedEvidence: makeGenfeedEvidence(),
    grantedScopes,
    observedAt,
    previousSnapshot: options?.previousSnapshot,
    tweetsResult: {
      error: options?.tweetsError,
      value: hasTweetRead
        ? (options?.tweetsValue ?? {
            hasMore: false,
            posts: [makeOwnedPost()],
            rawPostCount: 1,
          })
        : undefined,
    },
    userInfoResult: {
      error: options?.userError,
      value: hasUsersRead ? (options?.userValue ?? makeUserInfo()) : undefined,
    },
  });
}

describe('twitter authorized-signals evidence mapper', () => {
  it('assembles canonical keys, scopes, and a full snapshot', () => {
    const snapshot = assemble();

    expect(snapshot.state).toBe('full');
    expect(snapshot.platform).toBe(CredentialPlatform.TWITTER);
    expect(snapshot.evidence.map((item) => item.key)).toEqual([
      'profile-completeness-signal',
      'profile-statistics-snapshot',
      'owned-posts-snapshot',
      'publishing-capability-snapshot',
      'first-upload-platform-signal',
      'owned-post-metrics-snapshot',
      'native-account-age',
      'genfeed-publish-activity',
    ]);
    expect(evidenceOf(snapshot, 'profile-completeness-signal')).toMatchObject({
      provenance: 'platform_verified',
      status: 'available',
      value: { name: 'Creator', username: 'creator', isVerified: false },
    });
    expect(evidenceOf(snapshot, 'profile-statistics-snapshot')).toMatchObject({
      status: 'available',
      value: { followersCount: 10, likeCount: 2, tweetCount: 3 },
    });
    expect(
      evidenceOf(snapshot, 'publishing-capability-snapshot'),
    ).toMatchObject({
      scope: {
        granted: [TWEET_WRITE_SCOPE, MEDIA_WRITE_SCOPE],
        missing: [],
        required: [TWEET_WRITE_SCOPE],
      },
      value: {
        canPublish: true,
        canUploadMedia: true,
        isProtected: false,
      },
    });
    expect(evidenceOf(snapshot, 'native-account-age')).toMatchObject({
      value: { createdAt: '2018-01-01T00:00:00.000Z' },
    });
  });

  it('keeps missing tweet.read permission-limited without inventing a post value', () => {
    const snapshot = assemble({ grantedScopes: [USERS_READ_SCOPE] });
    const posts = evidenceOf(snapshot, 'owned-posts-snapshot');

    expect(snapshot.state).toBe('partial');
    expect(posts).toMatchObject({
      reason: 'missing_scope',
      scope: {
        granted: [],
        missing: [TWEET_READ_SCOPE],
        required: [TWEET_READ_SCOPE],
      },
      status: 'permission_limited',
    });
    expect(posts).not.toHaveProperty('value');
    expect(
      evidenceOf(snapshot, 'publishing-capability-snapshot'),
    ).toMatchObject({
      reason: 'missing_scope',
      status: 'permission_limited',
    });
  });

  it('represents an authorized empty post list as empty, not unavailable', () => {
    const snapshot = assemble({
      tweetsValue: { hasMore: false, posts: [], rawPostCount: 0 },
      userValue: makeUserInfo({
        public_metrics: {
          followers_count: 0,
          following_count: 0,
          like_count: 0,
          listed_count: 0,
          tweet_count: 0,
        },
      }),
    });

    expect(snapshot.state).toBe('empty');
    expect(evidenceOf(snapshot, 'owned-posts-snapshot')).toMatchObject({
      status: 'empty',
      value: { posts: [] },
    });
  });

  it('marks malformed owned-post payloads unavailable without inventing posts', () => {
    const evidence = buildOwnedPostsEvidence(
      [TWEET_READ_SCOPE],
      {
        value: { hasMore: false, posts: [], rawPostCount: 2 },
      },
      undefined,
      observedAt,
    );

    expect(evidence).toMatchObject({
      key: 'owned-posts-snapshot',
      reason: 'empty_response',
      status: 'unavailable',
      value: { hasMore: false, posts: [] },
    });
  });

  it('reuses the last successful owned posts as stale when the provider rate-limits', () => {
    const previous = makePreviousSnapshot();
    const evidence = buildOwnedPostsEvidence(
      fullScopes,
      { error: { response: { data: { status: 429 }, status: 429 } } },
      previous,
      observedAt,
    );

    expect(evidence).toMatchObject({
      key: 'owned-posts-snapshot',
      reason: 'rate_limited',
      staleAt: observedAt,
      status: 'stale',
      value: { posts: [{ id: 'tweet-1', likeCount: 4 }] },
    });
  });

  it('treats X API tier limitations as missing_scope, not a stale reuse', () => {
    const previous = makePreviousSnapshot();
    const evidence = buildOwnedPostsEvidence(
      fullScopes,
      {
        error: {
          response: { data: { status: 403, title: 'client-not-enrolled' } },
          status: 403,
        },
      },
      previous,
      observedAt,
    );

    expect(evidence).toMatchObject({
      reason: 'missing_scope',
      scope: {
        granted: [],
        missing: [TWEET_READ_SCOPE],
        required: [TWEET_READ_SCOPE],
      },
      status: 'permission_limited',
    });
    expect(evidence).not.toHaveProperty('value');
  });

  it('preserves previous values as revoked and stale-dated', () => {
    const previous = makePreviousSnapshot();
    const snapshot = buildTwitterRevokedSnapshot(
      'credential-1',
      fullScopes,
      previous,
      makeGenfeedEvidence(),
      observedAt,
    );

    expect(snapshot.state).toBe('revoked');
    expect(evidenceOf(snapshot, 'profile-completeness-signal')).toMatchObject({
      observedAt: previousObservedAt,
      reason: 'authorization_revoked',
      staleAt: observedAt,
      status: 'revoked',
      value: { name: 'Creator' },
    });
    expect(evidenceOf(snapshot, 'owned-posts-snapshot')).toMatchObject({
      status: 'revoked',
      value: { posts: [{ id: 'tweet-1' }] },
    });
    expect(evidenceOf(snapshot, 'genfeed-publish-activity').status).toBe(
      'empty',
    );
  });

  it('projects first-upload from the first original post, not a reply or retweet', () => {
    const reply = makeOwnedPost({
      id: 'tweet-reply',
      isReply: true,
      text: 'Reply',
    });
    const retweet = makeOwnedPost({
      id: 'tweet-rt',
      isRetweet: true,
      text: 'RT',
    });
    const original = makeOwnedPost({
      id: 'tweet-original',
      text: 'Original',
    });
    const ownedPosts = buildOwnedPostsEvidence(
      [TWEET_READ_SCOPE],
      {
        value: {
          hasMore: false,
          posts: [reply, retweet, original],
          rawPostCount: 3,
        },
      },
      undefined,
      observedAt,
    );
    const [firstUpload, metrics] = buildDerivedPostEvidence(
      ownedPosts,
      observedAt,
    );

    expect(firstUpload).toMatchObject({
      key: 'first-upload-platform-signal',
      value: { post: { id: 'tweet-original', text: 'Original' } },
    });
    expect(metrics).toMatchObject({
      key: 'owned-post-metrics-snapshot',
      value: { posts: [reply, retweet, original] },
    });
  });

  it('does not invent profile zeros when optional fields are absent', () => {
    const evidence = buildProfileEvidence(
      [USERS_READ_SCOPE],
      { value: { username: 'creator' } },
      undefined,
      observedAt,
    );

    expect(evidence).toMatchObject({
      status: 'available',
      value: { username: 'creator' },
    });
    expect(evidence.value).not.toMatchObject({
      followersCount: 0,
      isVerified: false,
    });
  });

  it('maps statistics only from public_metrics integers', () => {
    const evidence = buildStatisticsEvidence(
      [USERS_READ_SCOPE],
      {
        value: makeUserInfo({
          public_metrics: { followers_count: 8, tweet_count: '3' },
        }),
      },
      undefined,
      observedAt,
    );

    expect(evidence).toMatchObject({
      status: 'available',
      value: { followersCount: 8 },
    });
    if (evidence.key !== 'profile-statistics-snapshot') {
      throw new Error(`expected statistics evidence, got ${evidence.key}`);
    }
    expect(evidence.value?.tweetCount).toBeUndefined();
  });

  it('leaves canUploadMedia false when media.write is missing', () => {
    const evidence = buildPublishingCapabilityEvidence(
      [TWEET_WRITE_SCOPE],
      { value: makeUserInfo() },
      undefined,
      observedAt,
    );

    expect(evidence).toMatchObject({
      scope: {
        granted: [TWEET_WRITE_SCOPE],
        missing: [],
        required: [TWEET_WRITE_SCOPE],
      },
      status: 'available',
      value: { canPublish: true, canUploadMedia: false, isProtected: false },
    });
  });

  it('maps native account age from created_at', () => {
    const evidence = buildNativeAccountAgeEvidence(
      [USERS_READ_SCOPE],
      { value: makeUserInfo() },
      undefined,
      observedAt,
    );

    expect(evidence).toMatchObject({
      status: 'available',
      value: {
        createdAt: '2018-01-01T00:00:00.000Z',
        createTime: 1_514_764_800,
      },
    });
  });

  it('projects stale when every platform evidence item is stale', () => {
    const previous = makePreviousSnapshot();
    const staleEvidence = previous.evidence.map((item) =>
      item.provenance === 'platform_verified'
        ? { ...item, reason: 'rate_limited' as const, status: 'stale' as const }
        : item,
    );

    expect(resolveTwitterAuthorizedSnapshotState(staleEvidence)).toBe('stale');
  });

  it('projects partial when any platform evidence is permission-limited', () => {
    const snapshot = assemble({ grantedScopes: [USERS_READ_SCOPE] });

    expect(resolveTwitterAuthorizedSnapshotState(snapshot.evidence)).toBe(
      'partial',
    );
  });
});
