import { formatAgentError } from '@genfeedai/agent/server';
import {
  recordAgentReviewOutcome,
  WorkflowNotificationOutboxService,
} from './workflow-notification-outbox.service';

describe('WorkflowNotificationOutboxService', () => {
  it('leaves the durable row for recovery when queue publishing fails', async () => {
    const logger = { error: vi.fn() };
    const service = new WorkflowNotificationOutboxService(
      {
        enqueue: vi.fn().mockRejectedValue(new Error('Redis unavailable')),
      } as never,
      logger as never,
    );

    await expect(
      service.enqueueAfterCommit('delivery-1'),
    ).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      'Durable notification queue publish failed',
      expect.objectContaining({ message: 'Redis unavailable' }),
      expect.objectContaining({ deliveryId: 'delivery-1' }),
    );
  });

  it('deduplicates by execution outcome and targets the workflow owner', async () => {
    const transaction = {
      notificationDelivery: {
        upsert: vi.fn().mockResolvedValue({ id: 'delivery-1' }),
      },
      notificationEvent: {
        upsert: vi.fn().mockResolvedValue({ id: 'event-1' }),
      },
    };
    const service = new WorkflowNotificationOutboxService(
      { enqueue: vi.fn() } as never,
      { error: vi.fn() } as never,
    );

    await expect(
      service.recordWorkflowOutcome(transaction as never, {
        actorUserId: 'actor-1',
        error: null,
        executionId: 'execution-1',
        occurredAt: new Date('2026-08-22T10:00:00.000Z'),
        organizationId: 'org-1',
        status: 'completed',
        trigger: 'agent',
        workflowId: 'workflow-1',
        workflowLabel: 'Daily Posts',
        workflowOwnerUserId: 'owner-1',
      }),
    ).resolves.toBe('delivery-1');

    expect(transaction.notificationEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deduplicationKey: 'workflow.execution.completed/execution-1',
        },
      }),
    );
    expect(transaction.notificationDelivery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          idempotencyKey: 'workflow-status/execution-1/completed',
          userId: 'owner-1',
        }),
      }),
    );
    expect(transaction.notificationEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          payload: expect.objectContaining({ version: 1 }),
        }),
      }),
    );
  });
});

it('stores a safe classified agent failure with stable deduplication', async () => {
  const transaction = {
    notificationDelivery: {
      upsert: vi.fn().mockResolvedValue({ id: 'delivery-1' }),
    },
    notificationEvent: { upsert: vi.fn().mockResolvedValue({ id: 'event-1' }) },
  };
  const service = new WorkflowNotificationOutboxService(
    { enqueue: vi.fn() } as never,
    { error: vi.fn() } as never,
  );
  const input = {
    executionId: 'execution-1',
    workflowId: 'workflow-1',
    workflowLabel: 'Daily Posts',
    workflowOwnerUserId: 'owner-1',
    organizationId: 'org-1',
    status: 'failed' as const,
    occurredAt: new Date(),
    isAgentRun: true,
    error: 'secret raw provider dump',
    failure: formatAgentError('insufficient credits'),
  };
  await service.recordWorkflowOutcome(transaction as never, input);
  await service.recordWorkflowOutcome(transaction as never, input);
  expect(transaction.notificationEvent.upsert).toHaveBeenLastCalledWith(
    expect.objectContaining({
      update: {},
      where: { deduplicationKey: 'workflow.execution.failed/execution-1' },
      create: expect.objectContaining({
        sourceType: 'agent_run',
        payload: expect.objectContaining({
          error: null,
          failure: expect.objectContaining({
            title: 'Not enough credits',
            detail: null,
          }),
        }),
      }),
    }),
  );
  expect(transaction.notificationDelivery.upsert).toHaveBeenLastCalledWith(
    expect.objectContaining({
      update: {},
      create: expect.objectContaining({
        topic: 'agent.status',
        idempotencyKey: 'workflow-status/execution-1/failed',
      }),
    }),
  );
});

it.each([{ isAgentRun: false, status: 'failed' as const }])(
  'keeps workflow payloads outside agent failures: %j',
  async (outcome) => {
    const transaction = {
      notificationDelivery: {
        upsert: vi.fn().mockResolvedValue({ id: 'delivery' }),
      },
      notificationEvent: { upsert: vi.fn().mockResolvedValue({ id: 'event' }) },
    };
    const service = new WorkflowNotificationOutboxService(
      { enqueue: vi.fn() } as never,
      { error: vi.fn() } as never,
    );
    await service.recordWorkflowOutcome(transaction as never, {
      ...outcome,
      executionId: 'run',
      workflowId: 'workflow',
      workflowLabel: 'Daily Posts',
      workflowOwnerUserId: 'owner',
      organizationId: 'org',
      occurredAt: new Date(),
      error: 'Workflow node failed',
      failure: formatAgentError('insufficient credits'),
    });
    expect(transaction.notificationEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          sourceType: 'workflow_execution',
          payload: expect.objectContaining({
            error: 'Workflow node failed',
            failure: null,
          }),
        }),
      }),
    );
    expect(transaction.notificationDelivery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ topic: 'workflow.status' }),
      }),
    );
  },
);

it('routes proactive completion to agent.status without fabricating failure and sanitizes the report link', async () => {
  const tx = {
    notificationEvent: { upsert: vi.fn().mockResolvedValue({ id: 'event' }) },
    notificationDelivery: {
      upsert: vi.fn().mockResolvedValue({ id: 'delivery' }),
    },
  };
  const service = new WorkflowNotificationOutboxService(
    { enqueue: vi.fn() } as never,
    {} as never,
  );
  await service.recordWorkflowOutcome(tx as never, {
    executionId: 'run',
    workflowId: 'workflow',
    workflowLabel: 'Daily Agent',
    workflowOwnerUserId: 'owner',
    organizationId: 'org',
    occurredAt: new Date(),
    status: 'completed',
    isAgentRun: true,
    summary: '3 drafts ready',
    strategyId: 'strategy',
    sourcePath: '//foreign.example/path',
    error: 'old failure',
  });
  expect(tx.notificationEvent.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      create: expect.objectContaining({
        sourceType: 'agent_run',
        payload: expect.objectContaining({
          status: 'completed',
          failure: null,
          error: null,
          summary: '3 drafts ready',
          strategyId: 'strategy',
        }),
      }),
    }),
  );
  expect(
    tx.notificationEvent.upsert.mock.calls[0][0].create.payload,
  ).not.toHaveProperty('sourcePath');
  expect(tx.notificationDelivery.upsert).toHaveBeenCalledTimes(3);
  for (const channel of ['telegram', 'discord']) {
    expect(tx.notificationDelivery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          channel,
          provider: channel,
          userId: 'owner',
          topic: 'agent.status',
          idempotencyKey: `agent-report/run/completed/${channel}`,
        }),
        update: {},
      }),
    );
  }
  expect(tx.notificationDelivery.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      create: expect.objectContaining({ topic: 'agent.status' }),
    }),
  );
});

it.each([false, true])(
  'persists idempotent strategy review events without an execution identity (expired=%s)',
  async (expired) => {
    const tx = {
      agentStrategy: {
        findFirst: vi.fn().mockResolvedValue({
          label: 'Daily Agent',
          organization: { slug: 'acme' },
          brand: { slug: 'main' },
        }),
      },
      notificationEvent: { upsert: vi.fn().mockResolvedValue({ id: 'event' }) },
      notificationDelivery: {
        upsert: vi.fn().mockResolvedValue({ id: 'delivery' }),
      },
    };
    const input = {
      organizationId: 'org',
      brandId: 'brand',
      strategyId: 'strategy',
      platform: 'linkedin',
      postId: 'post',
      userId: 'reviewer',
      decisionId: 'decision',
      autoPublishEnabled: true,
      approvalStreak: 5,
      expired,
    };
    await recordAgentReviewOutcome(tx as never, input);
    await recordAgentReviewOutcome(tx as never, input);
    const eventKey = expired ? 'agent.review.expired' : 'agent.review.changed';
    expect(tx.notificationEvent.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          deduplicationKey: `${eventKey}/org/strategy/decision`,
          isDeleted: false,
          organizationId: 'org',
        },
        update: {},
        create: expect.objectContaining({
          eventKey,
          sourceType: 'agent_strategy',
          sourceId: 'strategy',
          organizationId: 'org',
          payload: expect.objectContaining({
            kind: 'agent_review',
            strategyId: 'strategy',
            expired,
            sourcePath: '/acme/main/automation/agents/strategy',
          }),
        }),
      }),
    );
    expect(
      tx.notificationEvent.upsert.mock.calls[0][0].create.payload,
    ).not.toHaveProperty('executionId');
    expect(tx.notificationDelivery.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          userId: 'reviewer',
          organizationId: 'org',
          topic: 'agent.status',
          idempotencyKey: `${eventKey}/org/strategy/decision`,
        }),
      }),
    );
  },
);
