import { formatAgentError } from '@genfeedai/agent/server';
import { WorkflowNotificationOutboxService } from './workflow-notification-outbox.service';

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

it.each([
  { isAgentRun: false, status: 'failed' as const },
  { isAgentRun: true, status: 'completed' as const },
])('keeps workflow payloads outside agent failures: %j', async (outcome) => {
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
});
