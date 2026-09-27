import { TASKS_SERVICE } from '@api/collections/tasks/tasks.tokens';
import { ReviewGateNotificationService } from '@api/collections/workflows/services/review-gate-notification.service';
import type { PendingReviewGateState } from '@api/collections/workflows/services/workflow-executor.types';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ActivityKey, NotificationChannel } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { ModuleRef } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pinnedWebhookAgent = { options: { servername: 'example.com' } };
const assertSafeWebhookEndpoint = vi.fn().mockResolvedValue({
  addresses: [{ address: '93.184.216.34', family: 4 }],
  hostname: 'example.com',
  url: new URL('https://example.com/hook'),
});
const createPinnedWebhookAgent = vi.fn(() => pinnedWebhookAgent);
vi.mock('@api/services/webhook-client/webhook-endpoint.validator', () => ({
  assertSafeWebhookEndpoint: (url: string) => assertSafeWebhookEndpoint(url),
  createPinnedWebhookAgent: (endpoint: unknown) =>
    createPinnedWebhookAgent(endpoint),
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
  let activityRecorder: { record: ReturnType<typeof vi.fn> };
  let httpService: { post: ReturnType<typeof vi.fn> };
  let tasksService: {
    create: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let prisma: { user: { findUnique: ReturnType<typeof vi.fn> } };

  beforeEach(async () => {
    assertSafeWebhookEndpoint.mockClear();
    createPinnedWebhookAgent.mockClear();
    activityRecorder = {
      record: vi.fn().mockResolvedValue({ id: 'activity-1' }),
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
        { provide: ActivityRecorderService, useValue: activityRecorder },
        { provide: HttpService, useValue: httpService },
        {
          provide: ModuleRef,
          useValue: { get: vi.fn().mockImplementation(() => tasksService) },
        },
        { provide: TASKS_SERVICE, useValue: tasksService },
      ],
    }).compile();

    service = module.get(ReviewGateNotificationService);
  });

  function recordedDestinations(): unknown {
    const [input] = activityRecorder.record.mock.calls[0] ?? [];
    return input?.alert?.destinations;
  }

  it('records the bell alert with no external channel when none is configured', async () => {
    const result = await service.dispatchPendingNotifications(pending(), CTX);
    expect(result).toEqual({});
    expect(activityRecorder.record).toHaveBeenCalledWith(
      expect.objectContaining({
        alert: expect.objectContaining({
          deduplicationKey: 'workflow-review-requested/exec-1/node-1',
          destinations: [],
        }),
        entityId: 'exec-1',
        key: ActivityKey.WORKFLOW_REVIEW_REQUESTED,
        organizationId: 'org-1',
        userId: 'user-1',
        value: 'My Workflow',
      }),
    );
    expect(httpService.post).not.toHaveBeenCalled();
    expect(tasksService.create).not.toHaveBeenCalled();
  });

  it('emails the owner when the email channel is configured with no explicit recipient', async () => {
    await service.dispatchPendingNotifications(
      pending({ notifyChannels: [NotificationChannel.EMAIL] }),
      CTX,
    );

    expect(prisma.user.findUnique).toHaveBeenCalled();
    expect(recordedDestinations()).toEqual([
      {
        destination: 'owner@example.com',
        message: expect.objectContaining({
          action: 'review_gate_pending',
          payload: expect.objectContaining({
            to: 'owner@example.com',
            workflowId: 'wf-1',
          }),
          type: 'email',
        }),
      },
    ]);
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
    expect(recordedDestinations()).toEqual([
      expect.objectContaining({ destination: 'reviewer@example.com' }),
    ]);
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
      expect.objectContaining({
        headers: { Host: 'example.com' },
        httpsAgent: pinnedWebhookAgent,
        maxRedirects: 0,
        timeout: 8000,
      }),
    );
    expect(createPinnedWebhookAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        addresses: [{ address: '93.184.216.34', family: 4 }],
        hostname: 'example.com',
      }),
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

    expect(recordedDestinations()).toEqual([
      {
        destination: '#content-review',
        message: {
          action: 'send_message',
          payload: {
            chatId: '#content-review',
            message: expect.stringContaining('My Workflow'),
          },
          type: 'slack',
        },
      },
    ]);
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

  it('still opens the task-inbox task when recording the request fails', async () => {
    activityRecorder.record.mockRejectedValueOnce(new Error('db down'));

    await expect(
      service.dispatchPendingNotifications(
        pending({
          notifyChannels: [
            NotificationChannel.EMAIL,
            NotificationChannel.TASK_INBOX,
          ],
        }),
        CTX,
      ),
    ).resolves.toEqual({ taskId: 'task-1' });
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
