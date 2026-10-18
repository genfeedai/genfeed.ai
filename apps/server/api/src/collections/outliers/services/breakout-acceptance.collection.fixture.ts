import { randomUUID } from 'node:crypto';
import type {
  AnalyticsCollectionAuthorization,
  TwitterAnalyticsCollectionInput,
} from '@api/analytics/analytics-collection-action.types';
import { resolveDailyPublishingAuthorization } from '@api/analytics/analytics-collection-actor';
import { AnalyticsTwitterCollectionService } from '@api/analytics/services/analytics-twitter-collection.service';
import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import type { WorkflowInitiatingActor } from '@api/authorization/brand-access/workflow-actor.util';
import type { LearningCheckpointService } from '@api/collections/content-learning/services/learning-checkpoint.service';
import type { OnboardingCreditGrantsService } from '@api/collections/credits/services/onboarding-credit-grants.service';
import {
  type AcceptanceWorld,
  captureObservationAt,
  MINUTE_MS,
  type PublishedPost,
  publishOwnPost,
  resolveExposureSource,
  type SourceMediaFormat,
  seedComparableHistory,
  silentLogger,
} from '@api/collections/outliers/services/breakout-acceptance.world.fixture';
import { OutlierConfigurationService } from '@api/collections/outliers/services/outlier-configuration.service';
import { OutlierInputsService } from '@api/collections/outliers/services/outlier-inputs.service';
import { OutliersService } from '@api/collections/outliers/services/outliers.service';
import { PostAnalyticsService } from '@api/collections/posts/services/post-analytics.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-definition';
import { ensureHiddenSystemWorkflowMirror } from '@api/collections/workflows/system-workflow-mirror.util';
import { DAILY_PUBLISHING_ACCOUNT_WORKFLOW_ID } from '@api/collections/workflows/templates/daily-publishing-workflow.template';
import { createVersionedWorkflow } from '@api/collections/workflows/workflow-version-definition';
import type { AccountAnalyticsSnapshotService } from '@api/endpoints/analytics/account-analytics-snapshot.service';
import type {
  ServerCredentialStore,
  ServerPostAnalytics,
  ServerTwitterAnalytics,
} from '@api/server.dependencies';
import { TwitterResponseMapper } from '@api/services/integrations/twitter/services/twitter-response.mapper';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  WorkflowExecutionStatus,
  WorkflowExecutionTrigger,
  WorkflowStatus,
} from '@genfeedai/contracts';
import type { ServerAnalyticsCollectionState } from '@genfeedai/contracts/interfaces';
import type { PrismaClient } from '@genfeedai/prisma';
import { toPrismaJson } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import type { Queue } from 'bullmq';

/** The one hidden workflow shape every seeded hidden fixture mirrors. */
export function hiddenFixtureDefinition(
  canonicalId: string,
): SystemWorkflowGraphDefinition {
  return {
    canonicalId,
    definition: { edges: [], inputVariables: [], nodes: [] },
    description: 'Breakout acceptance fixture',
    label: canonicalId,
    resultNodeId: 'none',
    version: 1,
  };
}

type FakeJob = {
  data: unknown;
  id: string;
  opts: Record<string, unknown>;
  state: 'waiting' | 'completed';
};

/**
 * In-memory BullMQ queue with the semantics the system-workflow producer depends on: an id
 * already in flight is refused and reported back, never enqueued twice.
 */
export class FakeBullQueue {
  readonly jobs = new Map<string, FakeJob>();
  readonly adds: string[] = [];

  async getJob(id: string) {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    return {
      getState: async () => job.state,
      remove: async () => {
        this.jobs.delete(id);
      },
    };
  }

  async add(
    _name: string,
    data: unknown,
    opts: Record<string, unknown> & { jobId?: string },
  ) {
    const id = opts.jobId ?? randomUUID();
    this.adds.push(id);
    const job: FakeJob = { data, id, opts, state: 'waiting' };
    this.jobs.set(id, job);
    return { getState: async () => job.state, id };
  }
}

export type CollectionHarness = {
  analytics: PostAnalyticsService;
  collector: AnalyticsTwitterCollectionService;
  /** Every queue the producer can route to, so a scenario can see where a job landed. */
  queues: FakeBullQueue[];
  /** The interactive queue the breakout producer targets. */
  interactive: FakeBullQueue;
  posts: PostsService;
  queue: WorkflowExecutionQueueService;
  /** What the fake X API will report next, by tweet id. */
  tweets: Map<string, { impressions: number; viewCount?: number }>;
  /** Number of provider calls the fake X API served. */
  providerCalls: () => number;
};

/** The X API v2 analytics response the fake provider serves. */
function xApiResponse(tweets: CollectionHarness['tweets']) {
  return {
    data: [...tweets.entries()].map(([id, metrics]) => ({
      id,
      organic_metrics: {
        impression_count: metrics.impressions,
        ...(metrics.viewCount === undefined
          ? {}
          : { view_count: metrics.viewCount }),
      },
      public_metrics: {
        impression_count: metrics.impressions + 5,
        like_count: 3,
        reply_count: 1,
        retweet_count: 1,
      },
    })),
  };
}

/**
 * Real analytics collection, persistence, capture, detection and system-workflow producer
 * over the real database. Fakes: the X API (served as a raw v2 response through the real
 * response mapper), the credential store and the BullMQ transport.
 */
export function buildCollectionHarness(
  prisma: PrismaService,
  logger: LoggerService,
  world: AcceptanceWorld,
  posts: PostsService = new PostsService(prisma, logger, {
    completeMissions: async () => undefined,
  } as unknown as OnboardingCreditGrantsService),
): CollectionHarness {
  const queues = Array.from({ length: 5 }, () => new FakeBullQueue());
  const [interactive] = queues;
  const queue = new WorkflowExecutionQueueService(
    interactive as unknown as Queue,
    queues[1] as unknown as Queue,
    queues[2] as unknown as Queue,
    queues[3] as unknown as Queue,
    queues[4] as unknown as Queue,
    logger,
    {
      assertAccess: async () => undefined,
    } as unknown as ConstructorParameters<
      typeof WorkflowExecutionQueueService
    >[6],
  );
  const outliers = new OutliersService(
    prisma,
    new OutlierInputsService(prisma),
    new OutlierConfigurationService(prisma),
  );
  const analytics = new PostAnalyticsService(
    prisma,
    logger,
    posts,
    outliers,
    { capture: async () => null } as unknown as LearningCheckpointService,
    queue,
  );
  const tweets: CollectionHarness['tweets'] = new Map();
  let providerCalls = 0;
  const twitter: ServerTwitterAnalytics = {
    getValidCredential: async () => ({
      accessToken: EncryptionUtil.encrypt('acceptance-x-token'),
    }),
    getMediaAnalyticsBatch: async (ids) => {
      providerCalls += 1;
      const wanted = new Map(
        [...tweets.entries()].filter(([id]) => ids.includes(id)),
      );
      return new TwitterResponseMapper().mapAnalyticsBatch(
        xApiResponse(wanted),
      );
    },
  };
  const credentials = {
    resolveBrandAccount: async () => ({
      accessToken: EncryptionUtil.encrypt('acceptance-x-token'),
      id: world.credentialId,
    }),
  } as unknown as ServerCredentialStore;
  const collector = new AnalyticsTwitterCollectionService(
    twitter,
    analytics as unknown as ServerPostAnalytics,
    credentials,
    {
      markFailedBatch: async () => undefined,
      markReadyBatch: async () => undefined,
    } as unknown as ServerAnalyticsCollectionState,
    silentLogger,
    {
      upsertDailySnapshot: async () => undefined,
    } as unknown as AccountAnalyticsSnapshotService,
  );
  return {
    analytics,
    collector,
    interactive,
    posts,
    providerCalls: () => providerCalls,
    queue,
    queues,
    tweets,
  };
}

/** Collects one own X post once, the way the analytics action does, under `authorization`. */
export function collectPost(
  harness: CollectionHarness,
  world: AcceptanceWorld,
  post: Pick<PublishedPost, 'externalId' | 'postId'>,
  authorization: AnalyticsCollectionAuthorization | undefined,
) {
  const input: TwitterAnalyticsCollectionInput = {
    attemptKey: `attempt-${randomUUID()}`,
    credentialId: world.credentialId,
    posts: [
      {
        brandId: world.brandId,
        externalId: post.externalId,
        id: post.postId,
        organizationId: world.organizationId,
      },
    ],
  };
  return harness.collector.collect(input, authorization);
}

export type ScheduledCollectionChain = {
  context: Parameters<typeof resolveDailyPublishingAuthorization>[1];
  provenance: { executionId: string; workflowId: string };
  /** Id of the tenant-owned (or seeded) scheduled workflow that started the run. */
  parentWorkflowId: string;
};

/**
 * Persists the rows a scheduler-started tenant workflow leaves: the scheduled parent run
 * and the hidden per-account collection child fanned out from it. The bound actor, when any,
 * is the server-written `scheduleInitiatingActor` of the parent's workflow, which is where
 * collection takes its authority from. A platform-seeded workflow carries a seed key and
 * therefore never lends an actor.
 */
export async function seedScheduledCollectionChain(
  db: PrismaClient<'query'>,
  prisma: PrismaService,
  world: AcceptanceWorld,
  options: { actor: WorkflowInitiatingActor | null; platformSeedKey?: string },
): Promise<ScheduledCollectionChain> {
  const owner = world.owner.id;
  // The pinned version and the workflow reference each other, so they share a transaction.
  const parent = await db.$transaction((tx) =>
    createVersionedWorkflow(
      tx,
      {
        isScheduleEnabled: true,
        label: `Scheduled collection ${randomUUID().slice(0, 8)}`,
        organizationId: world.organizationId,
        schedule: '0 9 * * *',
        scheduleInitiatingActor: options.actor
          ? toPrismaJson(options.actor)
          : undefined,
        status: WorkflowStatus.ACTIVE,
        timezone: 'UTC',
        userId: owner,
      },
      { edges: [], inputVariables: [], nodes: [] },
      options.platformSeedKey
        ? { platformSeedKey: options.platformSeedKey }
        : undefined,
    ),
  );
  if (!parent.currentVersion) throw new Error('Parent workflow is unpinned');
  const parentExecution = await db.workflowExecution.create({
    data: {
      organizationId: world.organizationId,
      result: {
        inputValues: {},
        metadata: { triggeredBy: 'schedule' },
        nodeResults: [],
        progress: 0,
      },
      status: WorkflowExecutionStatus.RUNNING,
      trigger: WorkflowExecutionTrigger.SCHEDULED,
      userId: owner,
      workflowId: parent.id,
      workflowVersionId: parent.currentVersion.id,
    },
  });
  const hidden = await ensureHiddenSystemWorkflowMirror(
    prisma,
    hiddenFixtureDefinition(DAILY_PUBLISHING_ACCOUNT_WORKFLOW_ID),
  );
  if (!hidden.currentVersion) throw new Error('Hidden workflow is unpinned');
  const child = await db.workflowExecution.create({
    data: {
      organizationId: world.organizationId,
      result: {
        inputValues: { item: { credentialId: world.credentialId } },
        metadata: {
          canonicalId: DAILY_PUBLISHING_ACCOUNT_WORKFLOW_ID,
          parentExecutionId: parentExecution.id,
          parentNodeId: 'each-account',
          parentWorkflowId: parent.id,
          source: 'daily-publishing',
          workflowForEachIndex: 0,
        },
        nodeResults: [],
        progress: 0,
      },
      status: WorkflowExecutionStatus.RUNNING,
      userId: owner,
      workflowId: hidden.id,
      workflowVersionId: hidden.currentVersion.id,
    },
  });
  return {
    context: {
      executionId: child.id,
      organizationId: world.organizationId,
      runId: child.id,
      userId: owner,
      workflowId: hidden.id,
      workflowVersionId: hidden.currentVersion.id,
    },
    parentWorkflowId: parent.id,
    provenance: { executionId: child.id, workflowId: hidden.id },
  };
}

/** The collection authorization the daily-publishing account step derives from its chain. */
export function resolveCollectionAuthorization(
  prisma: PrismaService,
  chain: ScheduledCollectionChain,
): Promise<AnalyticsCollectionAuthorization | undefined> {
  return resolveDailyPublishingAuthorization(
    { policy: new BrandAccessService(prisma), prisma },
    chain.context,
    chain.provenance,
  );
}

export type BreakoutCandidate = {
  history: PublishedPost[];
  /** The breakout-to-be, with its earlier prospective observations already stored. */
  target: PublishedPost;
};

export type CandidateOptions = {
  /** Earlier measurements of the target, as [age since publication, impressions]. */
  earlier?: Array<{ ageMs: number; impressions: number }>;
  history?: number[];
  /** The visual format of the target and its comparable history; text when absent. */
  media?: SourceMediaFormat;
  /** The target's age when the collector next measures it (and the baseline age). */
  targetAgeMs?: number;
};

/**
 * Five comparable earlier posts plus a target published `targetAgeMs` ago (62 minutes by
 * default) with earlier measurements stored, so the next collection of the target is its
 * latest, tenfold measurement at the age the baseline was taken.
 */
export async function seedBreakoutCandidate(
  db: PrismaClient<'query'>,
  world: AcceptanceWorld,
  options: CandidateOptions = {},
): Promise<BreakoutCandidate> {
  const nowMs = Date.now();
  const targetAgeMs = options.targetAgeMs ?? 62 * MINUTE_MS;
  const history = await seedComparableHistory(db, world, {
    nowMs,
    observedAtAgeMs: targetAgeMs,
    values: options.history,
    ...(options.media ? { media: options.media } : {}),
  });
  const target = await publishOwnPost(db, world, {
    publishedAt: new Date(nowMs - targetAgeMs),
    text: 'The post that is about to break out',
    ...(options.media ? { media: options.media } : {}),
  });
  const source = await resolveExposureSource(db, world, target);
  for (const earlier of options.earlier ?? [
    { ageMs: 30 * MINUTE_MS, impressions: 400 },
  ])
    await captureObservationAt(db, target, source, earlier);
  return { history, target };
}
