import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { AnalyticsSyncController } from '@api/collections/content-performance/controllers/analytics-sync.controller';
import { AnalyticsSyncService } from '@api/collections/content-performance/services/analytics-sync.service';
import { EmailDigestWorkflowService } from '@api/collections/content-performance/services/email-digest-workflow.service';
import { AnalyticsSyncWorkflowService } from '@api/collections/workflows/services/analytics-sync-workflow.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { Test } from '@nestjs/testing';
import { vi } from 'vitest';

describe('AnalyticsSyncController', () => {
  let controller: AnalyticsSyncController;
  let mockAnalyticsSyncService: {
    getLastSyncDate: ReturnType<typeof vi.fn>;
  };
  let mockAnalyticsWorkflow: { queueGenericSync: ReturnType<typeof vi.fn> };
  let mockEmailDigestWorkflow: {
    enqueue: ReturnType<typeof vi.fn>;
    run: ReturnType<typeof vi.fn>;
  };

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

    mockEmailDigestWorkflow = {
      enqueue: vi.fn().mockResolvedValue('job-1'),
      run: vi.fn().mockResolvedValue({
        errors: 0,
        sent: 1,
        skipped: 0,
      }),
    };

    const module = await Test.createTestingModule({
      controllers: [AnalyticsSyncController],
      providers: [
        { provide: AnalyticsSyncService, useValue: mockAnalyticsSyncService },
        {
          provide: AnalyticsSyncWorkflowService,
          useValue: mockAnalyticsWorkflow,
        },
        {
          provide: EmailDigestWorkflowService,
          useValue: mockEmailDigestWorkflow,
        },
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
      expect(result.jobId).toBe('job-1');
      expect(mockEmailDigestWorkflow.enqueue).toHaveBeenCalledWith(
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
      expect(mockEmailDigestWorkflow.run).toHaveBeenCalled();
    });
  });
});
