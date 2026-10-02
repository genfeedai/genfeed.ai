import {
  buildYoutubeStatusReconcileDefinition,
  buildYoutubeStatusSweepDefinition,
} from '@workers/crons/youtube/youtube-maintenance-workflow-definition';

describe('YouTube status workflows', () => {
  it('fans pending posts into status reconciliation workflows', () => {
    expect(
      buildYoutubeStatusSweepDefinition().definition.nodes[1]?.data.config
        .actionId,
    ).toBe('workflow.for-each-tenant');
    expect(
      buildYoutubeStatusReconcileDefinition().definition.nodes,
    ).toHaveLength(1);
  });
});

import { PostsService } from '@api/collections/posts/services/posts.service';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { PostLifecycleService } from '@api/index';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import { PublishEventWebhookService } from '@api/services/webhook-client/publish-event-webhook.service';
import {
  CredentialPlatform,
  PostStatus,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaService } from '@libs/prisma/prisma.service';
import { Module, type Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CronPostsModule } from '@workers/crons/posts/cron.posts.module';
import { CronYoutubeModule } from '@workers/crons/youtube/cron.youtube.module';
import { CronYoutubeStatusService } from '@workers/crons/youtube/cron.youtube-status.service';
import { YOUTUBE_MAINTENANCE_ACTION_IDS } from '@workers/crons/youtube/youtube-maintenance-workflow-definition';
import { ScheduledPostWorkflowService } from '@workers/services/scheduled-post-workflow.service';
import { SchedulerPublishStateService } from '@workers/services/scheduler-publish-state.service';

type StatusAction = (request: {
  input: { request: Record<string, unknown> };
  provenance: {
    executionId: string;
    workflowId: string;
    workflowLabel: string;
  };
}) => Promise<unknown>;

function youtubeHarness() {
  const actions = new Map<string, StatusAction>();
  const logger = { warn: vi.fn(), log: vi.fn(), error: vi.fn() };
  const posts = { findOne: vi.fn(), findAll: vi.fn() };
  const youtube = { getVideoStatus: vi.fn() };
  const runner = {
    registerAction: vi.fn((id: string, action: StatusAction) =>
      actions.set(id, action),
    ),
    registerWorkflow: vi.fn(),
  };
  const queue = { queueSystemWorkflow: vi.fn().mockResolvedValue(undefined) };
  const webhook = {
    emitLegacyPostPublished: vi.fn().mockResolvedValue(undefined),
  };
  const scheduler = { transitionPost: vi.fn().mockResolvedValue(true) };
  const workflow = {
    processPendingPublishedFinalization: vi.fn().mockResolvedValue(true),
  };
  const service = new CronYoutubeStatusService(
    logger as never,
    posts as never,
    youtube as never,
    runner as never,
    queue as never,
    webhook as never,
    scheduler as never,
    workflow as never,
  );
  service.onModuleInit();
  const post = {
    id: 'post-1',
    organizationId: 'org-1',
    brandId: 'brand-1',
    credentialId: 'cred-1',
    externalId: 'queried-video-1',
    visibility: PostVisibility.PRIVATE,
    targetExecutionState: TargetExecutionState.PUBLISHING,
    publicationDate: new Date('2026-10-01T00:00:00Z'),
  };
  posts.findOne.mockResolvedValue(post);
  const reconcile = () =>
    actions.get(YOUTUBE_MAINTENANCE_ACTION_IDS.RECONCILE_STATUS)?.({
      input: { request: { organizationId: 'org-1', postId: 'post-1' } },
      provenance: {
        executionId: 'execution-1',
        workflowId: 'workflow-1',
        workflowLabel: 'YouTube status',
      },
    });
  return {
    actions,
    logger,
    posts,
    youtube,
    runner,
    queue,
    webhook,
    scheduler,
    workflow,
    service,
    post,
    reconcile,
  };
}

describe('YouTube publication confirmation', () => {
  it.each(['public', 'private', 'unlisted'])(
    'guards the queried video and creates public-only finalization for %s',
    async (privacyStatus) => {
      const h = youtubeHarness();
      h.youtube.getVideoStatus.mockResolvedValue({ privacyStatus });
      await h.reconcile();
      expect(h.scheduler.transitionPost).toHaveBeenCalledWith(
        h.post,
        expect.objectContaining({
          visibility: privacyStatus,
          executionState: TargetExecutionState.PUBLISHED,
        }),
        expect.any(String),
        expect.objectContaining({
          expectedExternalId: 'queried-video-1',
          priorExecutionStates: [
            TargetExecutionState.PUBLISHING,
            TargetExecutionState.PUBLISHED,
          ],
        }),
        privacyStatus === 'public'
          ? {
              result: {
                success: true,
                executionState: TargetExecutionState.PUBLISHED,
                externalId: 'queried-video-1',
                platform: CredentialPlatform.YOUTUBE,
                url: 'https://www.youtube.com/watch?v=queried-video-1',
              },
              source: 'CronYoutubeStatusService.applyStatusTransition',
            }
          : undefined,
      );
      expect(h.queue.queueSystemWorkflow).toHaveBeenCalledOnce();
      expect(
        h.scheduler.transitionPost.mock.invocationCallOrder[0],
      ).toBeLessThan(
        h.queue.queueSystemWorkflow.mock.invocationCallOrder[0] ?? 0,
      );
      expect(
        h.workflow.processPendingPublishedFinalization,
      ).toHaveBeenCalledTimes(privacyStatus === 'public' ? 1 : 0);
    },
  );

  it.each(['private', 'unlisted'])(
    'commits public withdrawal to %s without positive proof',
    async (privacyStatus) => {
      const h = youtubeHarness();
      Object.assign(h.post, {
        visibility: PostVisibility.PUBLIC,
        targetExecutionState: TargetExecutionState.PUBLISHED,
      });
      h.youtube.getVideoStatus.mockResolvedValue({ privacyStatus });
      await h.reconcile();
      expect(h.scheduler.transitionPost.mock.calls[0]?.[4]).toBeUndefined();
      expect(h.queue.queueSystemWorkflow).toHaveBeenCalledOnce();
    },
  );

  it('does not queue a stale target and still retries its prior public outbox', async () => {
    const h = youtubeHarness();
    h.youtube.getVideoStatus.mockResolvedValue({ privacyStatus: 'public' });
    h.scheduler.transitionPost.mockResolvedValue(false);
    await h.reconcile();
    expect(h.queue.queueSystemWorkflow).not.toHaveBeenCalled();
    expect(h.webhook.emitLegacyPostPublished).not.toHaveBeenCalled();
    expect(
      h.workflow.processPendingPublishedFinalization,
    ).toHaveBeenCalledOnce();
  });

  it('preserves public confirmation when after-commit Redis notification fails', async () => {
    const h = youtubeHarness();
    h.youtube.getVideoStatus.mockResolvedValue({ privacyStatus: 'public' });
    h.queue.queueSystemWorkflow.mockRejectedValue(
      new Error('Redis unavailable'),
    );
    await h.reconcile();
    expect(h.webhook.emitLegacyPostPublished).toHaveBeenCalledOnce();
    expect(
      h.workflow.processPendingPublishedFinalization,
    ).toHaveBeenCalledOnce();
    expect(h.logger.warn).toHaveBeenCalledWith(
      'Failed to queue publication learning refresh',
      expect.anything(),
    );
  });

  it('keeps ordinary seven-day discovery separate from durable pending public outboxes', async () => {
    const h = youtubeHarness();
    const now = new Date('2026-10-02T00:00:00Z');
    const oldPending = {
      ...h.post,
      id: 'old-public',
      createdAt: new Date('2026-08-01T00:00:00Z'),
      visibility: PostVisibility.PUBLIC,
      targetExecutionState: TargetExecutionState.PUBLISHED,
      publishFinalizations: [{ id: 'original-outbox' }],
    };
    const ordinary = {
      ...h.post,
      id: 'ordinary-private',
      publishFinalizations: [],
    };
    h.posts.findAll.mockResolvedValue({ docs: [oldPending, ordinary] });
    const discover = h.actions.get(
      YOUTUBE_MAINTENANCE_ACTION_IDS.DISCOVER_POSTS,
    );
    const result = await discover?.({
      input: { request: { now: now.toISOString() } },
      provenance: {
        executionId: 'sweep',
        workflowId: 'sweep',
        workflowLabel: 'sweep',
      },
    });
    expect(h.posts.findAll).toHaveBeenCalledWith(
      {
        include: {
          credential: true,
          publishFinalizations: {
            select: { id: true },
            where: { completedAt: null },
          },
        },
        where: {
          externalId: { not: null },
          isDeleted: false,
          platform: CredentialPlatform.YOUTUBE,
          OR: [
            {
              createdAt: { gte: new Date('2026-09-25T00:00:00Z') },
              OR: [
                {
                  visibility: {
                    in: [PostVisibility.PRIVATE, PostVisibility.UNLISTED],
                  },
                },
                {
                  visibility: null,
                  status: { in: [PostStatus.PRIVATE, PostStatus.UNLISTED] },
                },
                { targetExecutionState: TargetExecutionState.PUBLISHING },
              ],
            },
            { publishFinalizations: { some: { completedAt: null } } },
          ],
        },
      },
      expect.objectContaining({ limit: 100 }),
    );
    expect(result).toEqual({
      items: [
        {
          organizationId: 'org-1',
          postId: 'old-public',
          finalizationPending: true,
        },
        {
          organizationId: 'org-1',
          postId: 'ordinary-private',
          finalizationPending: false,
        },
      ],
    });
  });

  it('does no publication work for an ordinary already-public polling replay', async () => {
    const h = youtubeHarness();
    Object.assign(h.post, {
      visibility: PostVisibility.PUBLIC,
      targetExecutionState: TargetExecutionState.PUBLISHED,
    });
    h.youtube.getVideoStatus.mockResolvedValue({ privacyStatus: 'public' });
    await h.reconcile();
    await h.reconcile();
    expect(h.scheduler.transitionPost).not.toHaveBeenCalled();
    expect(h.webhook.emitLegacyPostPublished).not.toHaveBeenCalled();
    expect(h.queue.queueSystemWorkflow).not.toHaveBeenCalled();
    expect(
      h.workflow.processPendingPublishedFinalization,
    ).not.toHaveBeenCalled();
  });

  it('replays a failed committed public outbox directly, preserving identity/time and propagating retry failures', async () => {
    const h = youtubeHarness();
    h.youtube.getVideoStatus.mockResolvedValue({ privacyStatus: 'public' });
    h.workflow.processPendingPublishedFinalization.mockRejectedValueOnce(
      new Error('activity failed'),
    );
    const originalTime = h.post.publicationDate;
    await h.reconcile();
    expect(h.scheduler.transitionPost).toHaveBeenCalledOnce();
    const originalOutcome = h.scheduler.transitionPost.mock.calls[0]?.[4];
    h.youtube.getVideoStatus.mockClear();
    h.scheduler.transitionPost.mockClear();
    h.webhook.emitLegacyPostPublished.mockClear();
    h.queue.queueSystemWorkflow.mockClear();
    h.workflow.processPendingPublishedFinalization
      .mockRejectedValueOnce(new Error('recurrence failed'))
      .mockResolvedValueOnce(true);
    const replay = () =>
      h.actions.get(YOUTUBE_MAINTENANCE_ACTION_IDS.RECONCILE_STATUS)?.({
        input: {
          request: {
            organizationId: 'org-1',
            postId: 'post-1',
            finalizationPending: true,
          },
        },
        provenance: {
          executionId: 'replay',
          workflowId: 'replay',
          workflowLabel: 'replay',
        },
      });
    await expect(replay()).rejects.toThrow('recurrence failed');
    await expect(replay()).resolves.toBe(true);
    expect(h.posts.findOne).toHaveBeenLastCalledWith({
      id: 'post-1',
      organizationId: 'org-1',
    });
    expect(
      h.workflow.processPendingPublishedFinalization,
    ).toHaveBeenLastCalledWith(h.post);
    expect(h.youtube.getVideoStatus).not.toHaveBeenCalled();
    expect(h.scheduler.transitionPost).not.toHaveBeenCalled();
    expect(h.webhook.emitLegacyPostPublished).not.toHaveBeenCalled();
    expect(h.queue.queueSystemWorkflow).not.toHaveBeenCalled();
    expect(h.post.publicationDate).toBe(originalTime);
    expect(originalOutcome).toEqual(
      expect.objectContaining({
        result: expect.objectContaining({ externalId: 'queried-video-1' }),
      }),
    );
    h.posts.findAll.mockResolvedValue({ docs: [] });
    await expect(
      h.actions.get(YOUTUBE_MAINTENANCE_ACTION_IDS.DISCOVER_POSTS)?.({
        input: { request: { now: '2026-10-02T00:00:00Z' } },
        provenance: {
          executionId: 'sweep',
          workflowId: 'sweep',
          workflowLabel: 'sweep',
        },
      }),
    ).resolves.toEqual({ items: [] });
  });

  it('constructs the real YouTube module with the direct exported posts finalizer', async () => {
    const h = youtubeHarness();
    const dependencies = [
      { provide: LoggerService, useValue: h.logger },
      { provide: PostsService, useValue: h.posts },
      { provide: YoutubeService, useValue: h.youtube },
      { provide: SystemWorkflowRunnerService, useValue: h.runner },
      { provide: WorkflowExecutionQueueService, useValue: h.queue },
      { provide: PublishEventWebhookService, useValue: h.webhook },
      { provide: PrismaService, useValue: {} },
      { provide: PostLifecycleService, useValue: {} },
    ];
    @Module({
      providers: dependencies,
      exports: dependencies.map((provider) => provider.provide),
    })
    class FixtureDependenciesModule {}
    @Module({
      providers: [
        { provide: ScheduledPostWorkflowService, useValue: h.workflow },
      ],
      exports: [ScheduledPostWorkflowService],
    })
    class FixturePostsModule {}
    const imports: Array<Type<unknown> | { forwardRef: () => Type<unknown> }> =
      Reflect.getMetadata('imports', CronYoutubeModule);
    expect(imports).toContain(CronPostsModule);
    const builder = Test.createTestingModule({ imports: [CronYoutubeModule] });
    for (const imported of imports) {
      const module =
        typeof imported === 'function' ? imported : imported.forwardRef();
      builder
        .overrideModule(module)
        .useModule(
          module === CronPostsModule
            ? FixturePostsModule
            : FixtureDependenciesModule,
        );
    }
    const module = await builder.compile();
    try {
      h.runner.registerAction.mockClear();
      await module.init();
      expect(module.get(CronYoutubeStatusService)).toBeInstanceOf(
        CronYoutubeStatusService,
      );
      expect(module.get(SchedulerPublishStateService)).toBeInstanceOf(
        SchedulerPublishStateService,
      );
      expect(module.get(ScheduledPostWorkflowService)).toBe(h.workflow);
      expect(h.runner.registerAction).toHaveBeenCalledWith(
        YOUTUBE_MAINTENANCE_ACTION_IDS.RECONCILE_STATUS,
        expect.any(Function),
      );
    } finally {
      await module.close();
    }
  });
});
