import { TasksService } from '@api/collections/tasks/services/tasks.service';
import { ReviewGateNotificationService } from '@api/collections/workflows/services/review-gate-notification.service';
import type { PendingReviewGateState } from '@api/collections/workflows/services/workflow-executor.types';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { NotificationChannel } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const assertSafeWebhookEndpoint = vi.fn().mockResolvedValue(undefined);
vi.mock('@api/services/webhook-client/webhook-endpoint.validator', () => ({
  assertSafeWebhookEndpoint: (url: string) => assertSafeWebhookEndpoint(url),
}));

const CTX = {
  executionId: 'exec-1',
  organizationId: 'org-1',
  ownerUserId: 'user-1',
  workflowId: 'wf-1',
  workflowLabel: 'My Workflow',
};

function pending(
  overrides: Partial<PendingReviewGateState> = {},
): PendingReviewGateState {
  return {
    autoApproveIfNoResponse: false,
    inputCaption: 'A caption',
    inputMedia: null,
    nodeId: 'node-1',
    notifyChannels: [],
    rawCaption: 'A caption',
    rawMedia: null,
    requestedAt: new Date(0).toISOString(),
    timeoutHours: 24,
    ...overrides,
  };
}

describe('ReviewGateNotificationService', () => {
  let service: ReviewGateNotificationService;
  let notificationsService: {
    sendReviewGatePendingEmail: ReturnType<typeof vi.fn>;
    sendReviewGatePendingSlack: ReturnType<typeof vi.fn>;
  };
  let httpService: { post: ReturnType<typeof vi.fn> };
  let tasksService: {
    create: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let prisma: { user: { findUnique: ReturnType<typeof vi.fn> } };

  beforeEach(async () => {
    assertSafeWebhookEndpoint.mockClear();
    notificationsService = {
      sendReviewGatePendingEmail: vi.fn().mockResolvedValue(undefined),
      sendReviewGatePendingSlack: vi.fn().mockResolvedValue(undefined),
    };
    httpService = { post: vi.fn().mockReturnValue(of({ data: {} })) };
    tasksService = {
      create: vi.fn().mockResolvedValue({ id: 'task-1' }),
      patch: vi.fn().mockResolvedValue({ id: 'task-1' }),
    };
    prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ email: 'owner@example.com' }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewGateNotificationService,
        { provide: LoggerService, useValue: { error: vi.fn(), warn: vi.fn() } },
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: HttpService, useValue: httpService },
        { provide: TasksService, useValue: tasksService },
      ],
    }).compile();

    service = module.get(ReviewGateNotificationService);
  });

  it('dispatches nothing when no channels are configured', async () => {
    const result = await service.dispatchPendingNotifications(pending(), CTX);
    expect(result).toEqual({});
    expect(
      notificationsService.sendReviewGatePendingEmail,
    ).not.toHaveBeenCalled();
  });

  it('emails the owner when the email channel is configured with no explicit recipient', async () => {
    await service.dispatchPendingNotifications(
      pending({ notifyChannels: [NotificationChannel.EMAIL] }),
      CTX,
    );

    expect(prisma.user.findUnique).toHaveBeenCalled();
    expect(
      notificationsService.sendReviewGatePendingEmail,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'owner@example.com', workflowId: 'wf-1' }),
    );
  });

  it('prefers the explicit notifyEmail over the owner email', async () => {
    await service.dispatchPendingNotifications(
      pending({
        notifyChannels: [NotificationChannel.EMAIL],
        notifyEmail: 'reviewer@example.com',
      }),
      CTX,
    );

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(
      notificationsService.sendReviewGatePendingEmail,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'reviewer@example.com' }),
    );
  });

  it('posts to the configured webhook url only after the SSRF guard passes', async () => {
    await service.dispatchPendingNotifications(
      pending({
        notifyChannels: [NotificationChannel.WEBHOOK],
        webhookUrl: 'https://example.com/hook',
      }),
      CTX,
    );

    expect(assertSafeWebhookEndpoint).toHaveBeenCalledWith(
      'https://example.com/hook',
    );
    expect(httpService.post).toHaveBeenCalledWith(
      'https://example.com/hook',
      expect.objectContaining({ event: 'review_gate.pending' }),
      expect.any(Object),
    );
  });

  it('does not post when the SSRF guard rejects the url', async () => {
    assertSafeWebhookEndpoint.mockRejectedValueOnce(new Error('blocked host'));

    await service.dispatchPendingNotifications(
      pending({
        notifyChannels: [NotificationChannel.WEBHOOK],
        webhookUrl: 'http://169.254.169.254/latest',
      }),
      CTX,
    );

    expect(httpService.post).not.toHaveBeenCalled();
  });

  it('sends a slack message to the configured channel', async () => {
    await service.dispatchPendingNotifications(
      pending({
        notifyChannels: [NotificationChannel.SLACK],
        slackChannel: '#content-review',
      }),
      CTX,
    );

    expect(
      notificationsService.sendReviewGatePendingSlack,
    ).toHaveBeenCalledWith(
      '#content-review',
      expect.stringContaining('My Workflow'),
    );
  });

  it('creates a task-inbox task and returns its id', async () => {
    const result = await service.dispatchPendingNotifications(
      pending({ notifyChannels: [NotificationChannel.TASK_INBOX] }),
      CTX,
    );

    expect(tasksService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        reviewState: 'pending_approval',
        status: 'in_review',
      }),
    );
    expect(result.taskId).toBe('task-1');
  });

  it('swallows a failing channel without throwing', async () => {
    notificationsService.sendReviewGatePendingEmail.mockRejectedValueOnce(
      new Error('smtp down'),
    );

    await expect(
      service.dispatchPendingNotifications(
        pending({ notifyChannels: [NotificationChannel.EMAIL] }),
        CTX,
      ),
    ).resolves.toEqual({ taskId: undefined });
  });

  describe('resolvePendingTask', () => {
    it('closes the task as done when approved', async () => {
      await service.resolvePendingTask('task-1', 'approved');
      expect(tasksService.patch).toHaveBeenCalledWith('task-1', {
        reviewState: 'approved',
        status: 'done',
      });
    });

    it('cancels the task on rejection/timeout', async () => {
      await service.resolvePendingTask('task-1', 'timeout');
      expect(tasksService.patch).toHaveBeenCalledWith('task-1', {
        reviewState: 'dismissed',
        status: 'cancelled',
      });
    });

    it('is a no-op when no task id is present', async () => {
      await service.resolvePendingTask(undefined, 'approved');
      expect(tasksService.patch).not.toHaveBeenCalled();
    });
  });
});
