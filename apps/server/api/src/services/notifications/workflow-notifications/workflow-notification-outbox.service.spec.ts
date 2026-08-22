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
