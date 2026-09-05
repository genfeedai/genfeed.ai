import { EmailDeliveryError } from '@api/services/notifications/notifications.service';
import { formatAgentError } from '@genfeedai/agent/server';
import { WorkflowNotificationDeliveryService } from './workflow-notification-delivery.service';

describe('WorkflowNotificationDeliveryService', () => {
  it('marks delivery complete only after Resend returns its message id', async () => {
    const prisma = {
      notificationDelivery: {
        findUnique: vi.fn().mockResolvedValue({
          attemptCount: 1,
          channel: 'email',
          topic: 'workflow.status',
          event: {
            sourceType: 'workflow_execution',
            payload: {
              error: null,
              executionId: 'execution-1',
              status: 'completed',
              trigger: 'agent',
              version: 1,
              workflowId: 'workflow-1',
              workflowLabel: 'Daily Posts',
            },
          },
          idempotencyKey: 'workflow-status/execution-1/completed',
          organizationId: 'org-1',
          user: { email: 'owner@example.com', isDeleted: false },
          userId: 'owner-1',
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      notificationPreference: {
        findFirst: vi.fn().mockResolvedValue({ isEnabled: true }),
      },
    };
    const notifications = {
      deliverEmail: vi.fn().mockResolvedValue('resend-message-1'),
    };
    const service = new WorkflowNotificationDeliveryService(
      prisma as never,
      notifications as never,
      { enqueue: vi.fn() } as never,
      { warn: vi.fn() } as never,
    );

    await service.deliver('delivery-1');

    expect(notifications.deliverEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'workflow-status/execution-1/completed',
        subject: 'Workflow completed: Daily Posts',
        to: 'owner@example.com',
      }),
    );
    expect(prisma.notificationDelivery.updateMany).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        providerMessageId: 'resend-message-1',
        status: 'delivered',
      }),
      where: {
        id: 'delivery-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
  });

  it('skips delivery when the owner disabled the topic', async () => {
    const prisma = {
      notificationDelivery: {
        findUnique: vi.fn().mockResolvedValue({
          channel: 'email',
          topic: 'workflow.status',
          event: {
            sourceType: 'workflow_execution',
            payload: {},
          },
          organizationId: 'org-1',
          user: { email: 'owner@example.com', isDeleted: false },
          userId: 'owner-1',
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      notificationPreference: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const notifications = { deliverEmail: vi.fn() };
    const service = new WorkflowNotificationDeliveryService(
      prisma as never,
      notifications as never,
      { enqueue: vi.fn() } as never,
      { warn: vi.fn() } as never,
    );

    await service.deliver('delivery-1');

    expect(notifications.deliverEmail).not.toHaveBeenCalled();
    expect(prisma.notificationDelivery.updateMany).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ status: 'skipped' }),
      where: {
        id: 'delivery-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
  });

  it('retries a transient notifications gateway failure', async () => {
    const prisma = {
      notificationDelivery: {
        findUnique: vi.fn().mockResolvedValue({
          attemptCount: 1,
          channel: 'email',
          topic: 'workflow.status',
          event: {
            sourceType: 'workflow_execution',
            payload: {
              error: 'invalid recipient',
              executionId: 'execution-1',
              status: 'failed',
              trigger: 'agent',
              version: 1,
              workflowId: 'workflow-1',
              workflowLabel: 'Daily Posts',
            },
          },
          idempotencyKey: 'workflow-status/execution-1/failed',
          organizationId: 'org-1',
          user: { email: 'owner@example.com', isDeleted: false },
          userId: 'owner-1',
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      notificationPreference: {
        findFirst: vi.fn().mockResolvedValue({ isEnabled: true }),
      },
    };
    const notifications = {
      deliverEmail: vi
        .fn()
        .mockRejectedValue(new EmailDeliveryError(true, 502)),
    };
    const service = new WorkflowNotificationDeliveryService(
      prisma as never,
      notifications as never,
      { enqueue: vi.fn() } as never,
      { warn: vi.fn() } as never,
    );

    await service.deliver('delivery-1');

    expect(prisma.notificationDelivery.updateMany).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        nextAttemptAt: expect.any(Date),
        status: 'retry_pending',
      }),
      where: {
        id: 'delivery-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
  });

  it('marks a transient delivery failure final after retry exhaustion', async () => {
    const prisma = {
      notificationDelivery: {
        findUnique: vi.fn().mockResolvedValue({
          attemptCount: 5,
          channel: 'email',
          topic: 'workflow.status',
          event: {
            sourceType: 'workflow_execution',
            payload: {
              error: 'provider unavailable',
              executionId: 'execution-1',
              status: 'failed',
              trigger: 'agent',
              version: 1,
              workflowId: 'workflow-1',
              workflowLabel: 'Daily Posts',
            },
          },
          idempotencyKey: 'workflow-status/execution-1/failed',
          organizationId: 'org-1',
          user: { email: 'owner@example.com', isDeleted: false },
          userId: 'owner-1',
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      notificationPreference: {
        findFirst: vi.fn().mockResolvedValue({ isEnabled: true }),
      },
    };
    const notifications = {
      deliverEmail: vi
        .fn()
        .mockRejectedValue(new EmailDeliveryError(true, 503)),
    };
    const service = new WorkflowNotificationDeliveryService(
      prisma as never,
      notifications as never,
      { enqueue: vi.fn() } as never,
      { warn: vi.fn() } as never,
    );

    await service.deliver('delivery-1');

    expect(prisma.notificationDelivery.updateMany).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        nextAttemptAt: expect.any(Date),
        status: 'failed',
      }),
      where: {
        id: 'delivery-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
  });

  it('does not resend a stale claim after the retry ceiling', async () => {
    const prisma = {
      notificationDelivery: {
        findUnique: vi.fn().mockResolvedValue({
          attemptCount: 6,
          channel: 'email',
          topic: 'workflow.status',
          event: {
            sourceType: 'workflow_execution',
            payload: {
              error: 'provider unavailable',
              executionId: 'execution-1',
              status: 'failed',
              trigger: 'agent',
              version: 1,
              workflowId: 'workflow-1',
              workflowLabel: 'Daily Posts',
            },
          },
          idempotencyKey: 'workflow-status/execution-1/failed',
          organizationId: 'org-1',
          user: { email: 'owner@example.com', isDeleted: false },
          userId: 'owner-1',
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      notificationPreference: {
        findFirst: vi.fn().mockResolvedValue({ isEnabled: true }),
      },
    };
    const notifications = { deliverEmail: vi.fn() };
    const service = new WorkflowNotificationDeliveryService(
      prisma as never,
      notifications as never,
      { enqueue: vi.fn() } as never,
      { warn: vi.fn() } as never,
    );

    await service.deliver('delivery-1');

    expect(notifications.deliverEmail).not.toHaveBeenCalled();
    expect(prisma.notificationDelivery.updateMany).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        lastError: 'Retry limit exceeded after interrupted delivery',
        status: 'failed',
      }),
      where: {
        id: 'delivery-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
  });

  it('continues a recovery sweep when one queue publish fails', async () => {
    const prisma = {
      notificationDelivery: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: 'delivery-1' },
            { id: 'delivery-2' },
            { id: 'delivery-3' },
          ]),
      },
    };
    const queue = {
      enqueue: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Redis unavailable'))
        .mockResolvedValueOnce(undefined),
    };
    const logger = { error: vi.fn(), warn: vi.fn() };
    const service = new WorkflowNotificationDeliveryService(
      prisma as never,
      { deliverEmail: vi.fn() } as never,
      queue as never,
      logger as never,
    );

    await expect(service.recoverDueDeliveries()).resolves.toBe(2);

    expect(prisma.notificationDelivery.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { nextAttemptAt: 'asc' } }),
    );
    expect(queue.enqueue).toHaveBeenCalledTimes(3);
    expect(logger.error).toHaveBeenCalledWith(
      'Durable notification recovery enqueue failed',
      expect.objectContaining({ message: 'Redis unavailable' }),
      expect.objectContaining({ deliveryId: 'delivery-2' }),
    );
  });
});

describe('agent failure delivery', () => {
  function setup(
    enabled = true,
    topic = 'agent.status',
    sourceType = 'agent_run',
  ) {
    const prisma = {
      notificationDelivery: {
        findUnique: vi.fn().mockResolvedValue({
          channel: 'email',
          topic,
          attemptCount: 1,
          event: {
            sourceType,
            payload: {
              version: 1,
              executionId: 'run',
              workflowId: 'workflow',
              workflowLabel: '<Daily>',
              status: 'failed',
              error: 'secret raw error',
              failure: formatAgentError('insufficient credits'),
            },
          },
          idempotencyKey: 'stable-key',
          organizationId: 'org',
          userId: 'owner',
          user: { email: 'owner@example.com', isDeleted: false },
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      notificationPreference: {
        findFirst: vi
          .fn()
          .mockResolvedValue(enabled ? { isEnabled: true } : null),
      },
    };
    const notifications = {
      deliverEmail: vi
        .fn<(input: { text: string }) => Promise<string>>()
        .mockResolvedValue('message'),
    };
    const service = new WorkflowNotificationDeliveryService(
      prisma as never,
      notifications as never,
      { enqueue: vi.fn() } as never,
      { warn: vi.fn() } as never,
    );
    return { prisma, notifications, service };
  }
  it('honors agent preference and renders classification without raw errors', async () => {
    const { prisma, notifications, service } = setup();
    await service.deliver('delivery');
    expect(prisma.notificationPreference.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ topic: 'agent.status' }),
      }),
    );
    expect(notifications.deliverEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Agent run failed: <Daily>',
        text: expect.stringContaining('Not enough credits'),
        idempotencyKey: 'stable-key',
      }),
    );
    expect(notifications.deliverEmail.mock.calls[0][0].text).not.toContain(
      'secret',
    );
  });
  it('preserves workflow email wording and error when classified data is present', async () => {
    const { prisma, notifications, service } = setup(
      true,
      'workflow.status',
      'workflow_execution',
    );
    await service.deliver('delivery');
    expect(prisma.notificationPreference.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ topic: 'workflow.status' }),
      }),
    );
    expect(notifications.deliverEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Workflow failed: <Daily>',
        text: 'Your workflow <Daily> failed: secret raw error',
        html: expect.stringContaining(
          'Your workflow <strong>&lt;Daily&gt;</strong> failed: secret raw error',
        ),
      }),
    );
  });
  it('skips opted-out agent notifications', async () => {
    const { prisma, notifications, service } = setup(false);
    await service.deliver('delivery');
    expect(notifications.deliverEmail).not.toHaveBeenCalled();
    expect(prisma.notificationDelivery.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'skipped' }),
      }),
    );
  });
  it('rejects a mismatched source and topic', async () => {
    const { prisma, notifications, service } = setup(true, 'workflow.status');
    await service.deliver('delivery');
    expect(notifications.deliverEmail).not.toHaveBeenCalled();
    expect(prisma.notificationDelivery.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'failed' }),
      }),
    );
  });
  it('keeps agent delivery retryable after a transient provider failure', async () => {
    const { prisma, notifications, service } = setup();
    notifications.deliverEmail.mockRejectedValue(
      new EmailDeliveryError(true, 503),
    );
    await service.deliver('delivery');
    expect(prisma.notificationDelivery.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'retry_pending' }),
      }),
    );
  });
});
