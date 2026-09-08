import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock(
  '@api/services/agent-source-ingest/agent-source-ingest.service',
  () => ({ AgentSourceIngestService: class {} }),
);
vi.mock('@api/shared/modules/prisma/prisma.service', () => ({
  PrismaService: class {},
}));
vi.mock(
  '@api/services/agent-orchestrator/agent-stream-publisher.service',
  () => ({ AgentStreamPublisherService: class {} }),
);
vi.mock('@api/services/content-quality/content-quality-scorer.service', () => ({
  ContentQualityScorerService: class {},
}));

import { AgentWorkObjectService } from '@api/services/agent-orchestrator/tools/agent-work-object.service';

describe('AgentWorkObjectService review and scope boundary', () => {
  const scope = {
    threadId: 'thread-1',
    organizationId: 'org-1',
    userId: 'user-1',
    brandId: 'brand-1',
  };
  const context = { ...scope, validatedScope: { ...scope, contextVersion: 1 } };
  const prisma = {
    agentThreadSnapshot: { findFirst: vi.fn() },
    workflowExecution: { findFirst: vi.fn() },
    agentThread: { findFirst: vi.fn() },
    ingredient: { findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
  };
  const publisher = { publishWorkEvent: vi.fn(), publishInputRequest: vi.fn() };
  const scorer = { scoreText: vi.fn() };
  const executions = { cancelExecution: vi.fn() };
  let service: AgentWorkObjectService;
  let ingredient: Record<string, unknown>;
  beforeEach(() => {
    vi.resetAllMocks();
    ingredient = {
      id: 'work-1',
      version: 1,
      updatedAt: new Date(),
      category: 'TEXT',
      providerData: {
        agentWorkObject: {
          threadId: scope.threadId,
          kind: 'script',
          title: 'Launch script',
          body: 'A complete script.',
          reviewStatus: 'pending',
        },
      },
    };
    prisma.agentThread.findFirst.mockResolvedValue({
      config: { sessionIngredientIds: ['work-1'] },
    });
    prisma.ingredient.findFirst.mockImplementation(async () => ingredient);
    prisma.ingredient.findMany.mockImplementation(async () => [ingredient]);
    prisma.ingredient.updateMany.mockResolvedValue({ count: 1 });
    service = new AgentWorkObjectService(
      prisma as never,
      publisher as never,
      scorer as never,
      executions as never,
      {} as never,
    );
  });
  it('requires the exact organization, brand and thread owner', async () => {
    prisma.agentThread.findFirst.mockResolvedValue(null);
    await expect(service.list(scope, 'session-1')).rejects.toThrow();
    expect(prisma.agentThread.findFirst).toHaveBeenCalledWith({
      where: {
        id: scope.threadId,
        organizationId: scope.organizationId,
        userId: scope.userId,
        brandId: scope.brandId,
        isDeleted: false,
      },
    });
  });
  it('blocks review until this session has viewed this revision', async () => {
    await expect(
      service.action(scope, 'work-1', {
        action: 'review',
        revision: 1,
        sessionId: 'session-1',
      }),
    ).rejects.toThrow('View this version');
    expect(prisma.ingredient.updateMany).not.toHaveBeenCalled();
  });
  it('rejects stale edits without overwriting the canonical artifact', async () => {
    await expect(
      service.action(scope, 'work-1', {
        action: 'edit',
        revision: 0,
        sessionId: 'session-1',
        body: 'New script',
      }),
    ).rejects.toThrow('changed');
  });
  it('invalidates review and view evidence when editing', async () => {
    await service.action(scope, 'work-1', {
      action: 'edit',
      revision: 1,
      sessionId: 'session-1',
      body: 'Updated script',
    });
    const update = prisma.ingredient.updateMany.mock.calls[0][0];
    expect(update.data.version).toBe(2);
    expect(update.data.providerData.agentWorkObject).toMatchObject({
      body: 'Updated script',
      reviewStatus: 'pending',
    });
    expect(
      update.data.providerData.agentWorkObject.viewedSessionId,
    ).toBeUndefined();
  });
  it('blocks generation for pending, failed and running reviews', async () => {
    for (const reviewStatus of ['pending', 'reviewing', 'failed']) {
      ingredient.providerData = {
        agentWorkObject: {
          threadId: scope.threadId,
          kind: 'script',
          title: 'Script',
          reviewStatus,
        },
      };
      await expect(service.assertReady(context as never)).rejects.toThrow(
        'Review your draft',
      );
    }
  });
  it('allows generation only after a passed or explicitly skipped review', async () => {
    for (const reviewStatus of ['passed', 'skipped']) {
      ingredient.providerData = {
        agentWorkObject: {
          threadId: scope.threadId,
          kind: 'script',
          title: 'Script',
          reviewStatus,
        },
      };
      await expect(
        service.assertReady(context as never),
      ).resolves.toBeUndefined();
    }
  });
  it('keeps cancelled reviews from recording a late pass', async () => {
    let finish: (value: { score: number }) => void = () => {};
    scorer.scoreText.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    ingredient.providerData = {
      agentWorkObject: {
        threadId: scope.threadId,
        kind: 'script',
        title: 'Script',
        body: 'Draft',
        reviewStatus: 'reviewing',
        reviewToken: 'token-1',
      },
    };
    const reviewing = service.review(scope, 'work-1', 'token-1');
    await vi.waitFor(() => expect(scorer.scoreText).toHaveBeenCalled());
    ingredient.providerData = {
      agentWorkObject: {
        threadId: scope.threadId,
        kind: 'script',
        title: 'Script',
        reviewStatus: 'pending',
      },
    };
    finish({ score: 8 });
    await reviewing;
    expect(prisma.ingredient.updateMany).not.toHaveBeenCalled();
  });
  it.each(['FAILED', 'CANCELLED'])(
    'allows retry and edit after the durable review job becomes %s',
    async (status) => {
      ingredient.providerData = {
        agentWorkObject: {
          threadId: scope.threadId,
          kind: 'script',
          title: 'Draft',
          body: 'Original draft',
          reviewStatus: 'reviewing',
          reviewToken: 'old-token',
          reviewExecutionId: 'old-job',
          viewedSessionId: 'session-1',
          viewedRevision: 1,
        },
      };
      prisma.workflowExecution.findFirst.mockResolvedValue({
        id: 'old-job',
        status,
      });
      expect(
        (await service.list(scope, 'session-1')).workObjects[0].reviewStatus,
      ).toBe('failed');
      await expect(
        service.action(scope, 'work-1', {
          action: 'review',
          revision: 1,
          sessionId: 'session-1',
        }),
      ).resolves.toEqual(expect.any(String));
      const retry =
        prisma.ingredient.updateMany.mock.calls[0][0].data.providerData
          .agentWorkObject;
      expect(retry.reviewStatus).toBe('reviewing');
      expect(retry.reviewExecutionId).toBeUndefined();
      await expect(
        service.action(scope, 'work-1', {
          action: 'edit',
          revision: 1,
          sessionId: 'session-1',
          body: 'Revised draft',
        }),
      ).resolves.toBeUndefined();
    },
  );

  it('does not publish a review completion when cancellation wins the final CAS', async () => {
    ingredient.providerData = {
      agentWorkObject: {
        threadId: scope.threadId,
        kind: 'script',
        title: 'Draft',
        body: 'Draft',
        reviewStatus: 'reviewing',
        reviewToken: 'token-1',
      },
    };
    scorer.scoreText.mockResolvedValue({ score: 8, suggestions: [] });
    prisma.ingredient.updateMany.mockResolvedValue({ count: 0 });
    await service.review(scope, 'work-1', 'token-1', 'review-job');
    expect(publisher.publishWorkEvent).toHaveBeenCalledOnce();
    expect(publisher.publishWorkEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'tool_started', runId: 'review-job' }),
    );
  });

  it('merges review completion onto the latest same-token linkage and view state', async () => {
    const initial = {
      threadId: scope.threadId,
      kind: 'script',
      title: 'Draft',
      body: 'Draft',
      reviewStatus: 'reviewing',
      reviewToken: 'token-1',
    };
    ingredient.providerData = { agentWorkObject: initial };
    scorer.scoreText.mockImplementation(async () => {
      ingredient.providerData = {
        agentWorkObject: {
          ...initial,
          reviewExecutionId: 'linked-job',
          viewedSessionId: 'new-tab',
          viewedRevision: 1,
        },
      };
      return { score: 8, suggestions: [] };
    });
    await service.review(scope, 'work-1', 'token-1', 'review-job');
    const write = prisma.ingredient.updateMany.mock.calls[0][0];
    expect(write.where.providerData).toEqual({
      path: ['agentWorkObject', 'reviewToken'],
      equals: 'token-1',
    });
    expect(write.data.providerData.agentWorkObject).toMatchObject({
      reviewStatus: 'passed',
      reviewExecutionId: 'linked-job',
      viewedSessionId: 'new-tab',
    });
    expect(write.data.providerData.agentWorkObject.reviewToken).toBeUndefined();
  });

  it('does not roll back a newer review when an older dispatch fails', async () => {
    ingredient.providerData = {
      agentWorkObject: {
        threadId: scope.threadId,
        kind: 'script',
        title: 'Draft',
        reviewStatus: 'reviewing',
        reviewToken: 'review-B',
        reviewExecutionId: 'execution-B',
      },
    };
    await service.cancelPreparedReview(scope, 'work-1', 'review-A');
    expect(prisma.ingredient.updateMany).not.toHaveBeenCalled();
    expect(executions.cancelExecution).not.toHaveBeenCalled();
  });

  it('preserves a replacement review created between the rollback read and write', async () => {
    ingredient.providerData = {
      agentWorkObject: {
        threadId: scope.threadId,
        kind: 'script',
        title: 'Draft',
        reviewStatus: 'reviewing',
        reviewToken: 'review-A',
        reviewExecutionId: 'execution-A',
      },
    };
    prisma.ingredient.updateMany.mockResolvedValue({ count: 0 });
    await service.cancelPreparedReview(scope, 'work-1', 'review-A');
    expect(prisma.ingredient.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'work-1',
          organizationId: scope.organizationId,
          brandId: scope.brandId,
          isDeleted: false,
          version: 1,
          updatedAt: ingredient.updatedAt,
          providerData: {
            path: ['agentWorkObject', 'reviewToken'],
            equals: 'review-A',
          },
        }),
      }),
    );
    expect(executions.cancelExecution).not.toHaveBeenCalled();
  });

  it('rolls back and cancels only its own prepared review execution', async () => {
    ingredient.providerData = {
      agentWorkObject: {
        threadId: scope.threadId,
        kind: 'script',
        title: 'Draft',
        reviewStatus: 'reviewing',
        reviewToken: 'review-A',
        reviewExecutionId: 'execution-A',
      },
    };
    prisma.workflowExecution.findFirst.mockResolvedValue({ id: 'execution-A' });
    await service.cancelPreparedReview(scope, 'work-1', 'review-A');
    expect(
      prisma.ingredient.updateMany.mock.calls[0][0].data.providerData
        .agentWorkObject,
    ).toEqual({
      threadId: scope.threadId,
      kind: 'script',
      title: 'Draft',
      reviewStatus: 'pending',
    });
    expect(executions.cancelExecution).toHaveBeenCalledWith('execution-A');
  });

  it('keeps a review that settles before its queue acknowledgement', async () => {
    ingredient.providerData = {
      agentWorkObject: {
        threadId: scope.threadId,
        kind: 'script',
        title: 'Script',
        reviewStatus: 'passed',
      },
    };
    await expect(
      service.linkReviewExecution(scope, 'work-1', 'token-1', 'execution-1'),
    ).resolves.toBeUndefined();
    expect(prisma.ingredient.updateMany).not.toHaveBeenCalled();
  });

  it('caps consequential choices before publishing', async () => {
    await expect(
      service.requestInput(
        {
          requestId: 'ask-1',
          title: 'Format',
          prompt: 'Pick a format',
          options: Array.from({ length: 6 }, (_, index) => ({
            id: String(index),
            label: String(index),
          })),
        },
        context as never,
      ),
    ).rejects.toThrow('five');
    expect(publisher.publishInputRequest).not.toHaveBeenCalled();
  });
});
