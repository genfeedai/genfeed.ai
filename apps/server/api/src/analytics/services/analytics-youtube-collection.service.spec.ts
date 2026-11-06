import type { YouTubeAnalyticsCollectionInput } from '@api/analytics/analytics-collection-action.types';
import { analyticsCollectionAuthorizationFixture } from '@api/analytics/analytics-collection-authorization.fixture';
import { learningHash } from '@api/collections/content-learning/services/learning-operation.service';
import {
  learningPublicationFinalizationVersionV1,
  learningPublicationPostVersionV1,
} from '@api/collections/content-learning/services/learning-publication-source.helper';
import type {
  ServerCredentialStore,
  ServerLogger,
  ServerPostAnalytics,
  ServerYouTubeAnalytics,
} from '@api/server.dependencies';
import { CredentialPlatform, Platform } from '@genfeedai/contracts';
import type { ServerAnalyticsCollectionState } from '@genfeedai/contracts/interfaces';
import type { LearningPublicationSourceV1 } from '@genfeedai/contracts/interfaces/analytics/outlier-persistence.interface';
import { AnalyticsYouTubeCollectionService } from './analytics-youtube-collection.service';

interface PersistedAnalytics {
  authorization: unknown;
  context: {
    brandId?: string;
    credentialId?: string;
    learningObservation?: Record<string, unknown>;
    organizationId?: string;
  };
  metrics: unknown;
  postId: string;
}

interface HarnessLog {
  failed: unknown[];
  persisted: PersistedAnalytics[];
  prepared: unknown[];
  providerCalls: unknown[][];
  ready: unknown[];
  snapshots: Array<Record<string, unknown>>;
  trace: string[];
}

interface HarnessBehaviour {
  onPersist?: () => void;
  onPrepare?: () => void;
  onProvider?: () => void;
  preparation?: LearningPublicationSourceV1 | null | Error;
}

const noop = async (): Promise<void> => undefined;

function createHarness(
  analytics = new Map<string, unknown>(),
  behaviour: HarnessBehaviour = {},
) {
  const log: HarnessLog = {
    failed: [],
    persisted: [],
    prepared: [],
    providerCalls: [],
    ready: [],
    snapshots: [],
    trace: [],
  };
  const collectionState = {
    markFailed: noop,
    markFailedBatch: async (items: unknown) => {
      log.failed.push(items);
    },
    markFailedTargets: noop,
    markReady: noop,
    markReadyBatch: async (items: unknown) => {
      log.ready.push(items);
    },
  } satisfies ServerAnalyticsCollectionState;
  const postAnalytics = {
    prepareLearningObservation: async (target: unknown) => {
      log.trace.push('prepare');
      log.prepared.push(target);
      behaviour.onPrepare?.();
      if (behaviour.preparation instanceof Error) {
        throw behaviour.preparation;
      }
      return behaviour.preparation ?? null;
    },
    processInstagramAnalytics: noop,
    processLinkedInAnalytics: noop,
    processMastodonAnalytics: noop,
    processPinterestAnalytics: noop,
    processTikTokAnalytics: noop,
    processTwitterAnalytics: noop,
    processYouTubeAnalytics: async (
      postId: string,
      metrics: unknown,
      context: PersistedAnalytics['context'],
      authorization: unknown,
    ) => {
      log.trace.push('persist');
      behaviour.onPersist?.();
      log.persisted.push({ authorization, context, metrics, postId });
    },
  } as unknown as ServerPostAnalytics;
  const youtube = {
    getMediaAnalyticsBatch: async (...args: unknown[]) => {
      log.trace.push('provider');
      log.providerCalls.push(args);
      behaviour.onProvider?.();
      return analytics;
    },
  } as unknown as ServerYouTubeAnalytics;
  const logger = {
    error: () => undefined,
    log: () => undefined,
    warn: () => undefined,
  } satisfies ServerLogger;
  const credentials = {
    findConnectedAccounts: async () => [{ id: 'cred-1' }],
    findOne: async () => ({
      brandId: 'brand-1',
      id: 'cred-1',
      organizationId: 'org-1',
      platform: 'YOUTUBE',
    }),
  } as unknown as ServerCredentialStore;
  const accountSnapshots = {
    upsertDailySnapshot: async (snapshot: Record<string, unknown>) => {
      log.snapshots.push(snapshot);
    },
  };
  const service = new AnalyticsYouTubeCollectionService(
    youtube,
    postAnalytics,
    collectionState,
    credentials,
    logger,
    accountSnapshots as unknown as ConstructorParameters<
      typeof AnalyticsYouTubeCollectionService
    >[5],
  );
  return { log, service };
}

function input(): YouTubeAnalyticsCollectionInput {
  return {
    attemptKey: 'attempt-1',
    brandId: 'brand-1',
    credentialId: 'cred-1',
    organizationId: 'org-1',
    posts: [
      {
        brandId: 'brand-1',
        externalId: 'video-1',
        id: 'post-1',
        organizationId: 'org-1',
      },
    ],
  };
}

describe('AnalyticsYouTubeCollectionService', () => {
  it('propagates native revocation during the provider await without writing collected data or failure state', async () => {
    const denied = new Error('membership_revoked');
    let isRevoked = false;
    const authorization = {
      ...analyticsCollectionAuthorizationFixture,
      admit: async () => {
        if (isRevoked) throw denied;
      },
    };
    const { log, service } = createHarness(
      new Map([['video-1', { views: 42 }]]),
      {
        onProvider: () => {
          isRevoked = true;
        },
      },
    );

    await expect(service.collect(input(), authorization)).rejects.toBe(denied);

    expect(log.providerCalls).toHaveLength(1);
    expect(log.persisted).toEqual([]);
    expect(log.failed).toEqual([]);
    expect(log.ready).toEqual([]);
    expect(log.snapshots).toEqual([]);
  });

  it('collects and finalizes exactly one action item', async () => {
    const { log, service } = createHarness(
      new Map([['video-1', { views: 42 }]]),
    );

    await service.collect(input(), analyticsCollectionAuthorizationFixture);

    expect(log.providerCalls).toEqual([
      ['org-1', 'brand-1', ['video-1'], 'cred-1'],
    ]);
    expect(log.persisted).toEqual([
      {
        authorization: analyticsCollectionAuthorizationFixture,
        context: {
          brandId: 'brand-1',
          credentialId: 'cred-1',
          learningObservation: {
            receivedAt: expect.any(Date),
            requestStartedAt: expect.any(Date),
            sourceAttemptId: expect.any(String),
          },
          organizationId: 'org-1',
        },
        metrics: { views: 42 },
        postId: 'post-1',
      },
    ]);
    expect(log.ready).toEqual([
      [
        expect.objectContaining({
          id: 'post-1',
          platform: CredentialPlatform.YOUTUBE,
        }),
      ],
    ]);
    expect(log.snapshots).toEqual([
      expect.objectContaining({
        credentialId: 'cred-1',
        organizationId: 'org-1',
        platform: CredentialPlatform.YOUTUBE,
      }),
    ]);
  });

  it('records delayed state and fails when provider data is unavailable', async () => {
    const { log, service } = createHarness();

    await expect(
      service.collect(input(), analyticsCollectionAuthorizationFixture),
    ).rejects.toThrow('analytics are not available');

    expect(log.failed).toHaveLength(1);
    expect(log.persisted).toEqual([]);
  });

  it('rejects batch-shaped inputs at the action boundary', async () => {
    const { log, service } = createHarness();
    const batch = input();
    batch.posts.push({
      ...(batch.posts[0] as (typeof batch.posts)[number]),
      id: 'post-2',
    });

    await expect(
      service.collect(batch, analyticsCollectionAuthorizationFixture),
    ).rejects.toThrow('requires exactly one post');
    expect(log.providerCalls).toEqual([]);
  });
});

function collectionSource(
  platform: Platform,
  organizationId: string,
  brandId: string,
  credentialId: string,
  postId: string,
  externalId: string,
): LearningPublicationSourceV1 {
  const association = {
    version: 1 as const,
    organizationId,
    brandId,
    credentialId,
    postId,
    externalId,
    platform,
    approvalId: 'approval',
    approvalOperationId: 'operation',
    versionPinId: 'pin',
    publishedAt: '2026-09-28T12:00:00.000Z',
    contentDigest: `sha256:v1:${'a'.repeat(64)}`,
    postSourceVersion: learningPublicationPostVersionV1({
      organizationId,
      brandId,
      credentialId,
      postId,
      externalId,
      platform,
      publishedAt: '2026-09-28T12:00:00.000Z',
      description: 'text',
    }),
  };
  return {
    ...association,
    finalizationId: 'finalization',
    finalizationVersion: learningPublicationFinalizationVersionV1(association),
    approvalVersion: learningHash(['approval']),
  };
}

describe('C3 youtube canonical pre-provider observation transport', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('prepares the exact resolved provider target before clocks/provider and carries the snapshot without rewriting metrics', async () => {
    const metrics = { views: 42 };
    const data = input();
    const post = data.posts[0] as (typeof data.posts)[number];
    const source = collectionSource(
      Platform.YOUTUBE,
      post.organizationId,
      post.brandId,
      'cred-1',
      post.id,
      post.externalId,
    );
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T11:59:59Z'));
    const { log, service } = createHarness(
      new Map([[post.externalId, metrics]]),
      {
        onPrepare: () => {
          vi.setSystemTime(new Date('2026-09-30T12:00:00Z'));
        },
        onProvider: () => {
          vi.setSystemTime(new Date('2026-09-30T12:00:01Z'));
        },
        preparation: source,
      },
    );

    await service.collect(data, analyticsCollectionAuthorizationFixture);

    expect(log.prepared).toEqual([
      {
        brandId: post.brandId,
        credentialId: 'cred-1',
        externalId: post.externalId,
        organizationId: post.organizationId,
        platform: CredentialPlatform.YOUTUBE,
        postId: post.id,
      },
    ]);
    expect(log.trace).toEqual(['prepare', 'provider', 'persist']);
    expect(log.persisted).toEqual([
      expect.objectContaining({
        authorization: analyticsCollectionAuthorizationFixture,
        context: expect.objectContaining({
          credentialId: 'cred-1',
          learningObservation: {
            publicationSource: source,
            receivedAt: new Date('2026-09-30T12:00:01Z'),
            requestStartedAt: new Date('2026-09-30T12:00:00Z'),
            sourceAttemptId: expect.any(String),
          },
        }),
        metrics,
        postId: post.id,
      }),
    ]);
  });

  it('keeps ordinary analytics when preparation is null and omits source authority', async () => {
    const { log, service } = createHarness(
      new Map([['video-1', { views: 42 }]]),
    );

    await service.collect(input(), analyticsCollectionAuthorizationFixture);

    expect(log.persisted[0]?.context.learningObservation).not.toHaveProperty(
      'publicationSource',
    );
  });

  it('propagates preparation DB failure before provider IO', async () => {
    const error = new Error('preparation DB');
    const { log, service } = createHarness(new Map(), { preparation: error });

    await expect(
      service.collect(input(), analyticsCollectionAuthorizationFixture),
    ).rejects.toBe(error);
    expect(log.providerCalls).toEqual([]);
    expect(log.persisted).toEqual([]);
  });
});
