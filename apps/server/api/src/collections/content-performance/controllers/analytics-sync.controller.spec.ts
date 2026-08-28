import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import { AnalyticsSyncController } from '@api/collections/content-performance/controllers/analytics-sync.controller';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { Test } from '@nestjs/testing';
import type { AuthenticatedUser } from '@server/auth/interfaces/authenticated-user.interface';
import { AnalyticsSyncService } from '@server/collections/content-performance/services/analytics-sync.service';
import { EmailDigestService } from '@server/collections/content-performance/services/email-digest.service';
import { AnalyticsSyncWorkflowService } from '@server/collections/workflows/services/analytics-sync-workflow.service';
import { QueueService } from '@server/queues/core/queue.service';
import { vi } from 'vitest';

describe('AnalyticsSyncController', () => {
  let controller: AnalyticsSyncController;
  let mockAnalyticsSyncService: {
    getLastSyncDate: ReturnType<typeof vi.fn>;
  };
  let mockAnalyticsWorkflow: { queueGenericSync: ReturnType<typeof vi.fn> };
  let mockEmailDigestService: { sendDigest: ReturnType<typeof vi.fn> };
  let mockQueueService: { add: ReturnType<typeof vi.fn> };

  const mockUser = {
    organizationId: 'org-123',
    userId: 'user-123',
  } as unknown as AuthenticatedUser;

  beforeEach(async () => {
    mockAnalyticsSyncService = {
      getLastSyncDate: vi.fn().mockResolvedValue(null),
    };

    mockAnalyticsWorkflow = {
      queueGenericSync: vi.fn().mockResolvedValue({
        jobId: 'workflow-job-1',
        workflowId: 'analytics-sync',
      }),
    };

    mockEmailDigestService = {
      sendDigest: vi.fn().mockResolvedValue({
        errors: 0,
        sent: 1,
        skipped: 0,
      }),
    };

    mockQueueService = {
      add: vi.fn().mockResolvedValue({ id: 'job-1' }),
    };

    const module = await Test.createTestingModule({
      controllers: [AnalyticsSyncController],
      providers: [
        { provide: AnalyticsSyncService, useValue: mockAnalyticsSyncService },
        {
          provide: AnalyticsSyncWorkflowService,
          useValue: mockAnalyticsWorkflow,
        },
        { provide: EmailDigestService, useValue: mockEmailDigestService },
        { provide: QueueService, useValue: mockQueueService },
      ],
    })
      .overrideGuard(BetterAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(AnalyticsSyncController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('triggerSync', () => {
    it('should enqueue analytics sync job', async () => {
      const result = await controller.triggerSync({}, mockUser);

      expect(result.status).toBe('queued');
      expect(result.jobId).toBe('workflow-job-1');
      expect(mockAnalyticsWorkflow.queueGenericSync).toHaveBeenCalledWith({
        brandId: undefined,
        organizationId: 'org-123',
        since: undefined,
        userId: 'user-123',
      });
    });
  });

  describe('runSync', () => {
    it('should enqueue the same analytics workflow', async () => {
      const result = await controller.runSync({}, mockUser);

      expect(result).toEqual({
        jobId: 'workflow-job-1',
        workflowId: 'analytics-sync',
      });
      expect(mockAnalyticsWorkflow.queueGenericSync).toHaveBeenCalledWith({
        brandId: undefined,
        organizationId: 'org-123',
        since: undefined,
        userId: 'user-123',
      });
    });
  });

  describe('getSyncStatus', () => {
    it('should return sync status', async () => {
      const result = await controller.getSyncStatus(undefined, mockUser);

      expect(result.organizationId).toBe('org-123');
      expect(result.lastSyncDate).toBeNull();
    });
  });

  describe('triggerDigest', () => {
    it('should enqueue email digest job', async () => {
      const result = await controller.triggerDigest(
        { brandId: 'brand-1' },
        mockUser,
      );

      expect(result.status).toBe('queued');
      expect(mockQueueService.add).toHaveBeenCalledWith(
        'email-digest',
        expect.objectContaining({
          brandId: 'brand-1',
          organizationId: 'org-123',
        }),
      );
    });
  });

  describe('sendDigest', () => {
    it('should send digest synchronously', async () => {
      const result = await controller.sendDigest(
        { brandId: 'brand-1' },
        mockUser,
      );

      expect(result.sent).toBe(1);
      expect(mockEmailDigestService.sendDigest).toHaveBeenCalled();
    });
  });
});
