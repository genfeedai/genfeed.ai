import { EmailDeliveryError } from '@api/services/notifications/notifications.service';
import { WorkflowNotificationDeliveryService } from './workflow-notification-delivery.service';

describe('WorkflowNotificationDeliveryService', () => {
  it('marks delivery complete only after Resend returns its message id', async () => {
    const prisma = {
      notificationDelivery: {
        findUnique: vi.fn().mockResolvedValue({
          attemptCount: 1,
          event: {
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
          event: { payload: {} },
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
          event: {
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
      data: expect.objectContaining({ status: 'retry_pending' }),
      where: {
        id: 'delivery-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
  });
});
