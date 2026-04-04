import { AnalyticsSyncController } from '@api/collections/content-performance/controllers/analytics-sync.controller';
import { AnalyticsSyncService } from '@api/collections/content-performance/services/analytics-sync.service';
import { EmailDigestService } from '@api/collections/content-performance/services/email-digest.service';
import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { QueueService } from '@api/queues/core/queue.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test } from '@nestjs/testing';
import { vi } from 'vitest';

describe('AnalyticsSyncController', () => {
  let controller: AnalyticsSyncController;
  let mockAnalyticsSyncService: { syncAnalytics: ReturnType<typeof vi.fn> };
  let mockEmailDigestService: { sendDigest: ReturnType<typeof vi.fn> };
  let mockQueueService: { add: ReturnType<typeof vi.fn> };

  const mockUser = {
    publicMetadata: {
      organization: 'org-123',
      userId: 'user-123',
    },
  };

  beforeEach(async () => {
    mockAnalyticsSyncService = {
      getLastSyncDate: vi.fn().mockResolvedValue(null),
      syncAnalytics: vi.fn().mockResolvedValue({
        errors: 0,
        organizationId: 'org-123',
        skipped: 0,
        synced: 5,
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
        { provide: EmailDigestService, useValue: mockEmailDigestService },
        { provide: QueueService, useValue: mockQueueService },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    })
      .overrideGuard(ClerkGuard)
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
      const result = await controller.triggerSync({}, mockUser as any);

      expect(result.status).toBe('queued');
      expect(result.jobId).toBe('job-1');
      expect(mockQueueService.add).toHaveBeenCalledWith(
        'analytics-sync',
        expect.objectContaining({ organizationId: 'org-123' }),
      );
    });
  });

  describe('runSync', () => {
    it('should run sync synchronously', async () => {
      const result = await controller.runSync({}, mockUser as any);

      expect(result.synced).toBe(5);
      expect(mockAnalyticsSyncService.syncAnalytics).toHaveBeenCalled();
    });
  });

  describe('getSyncStatus', () => {
    it('should return sync status', async () => {
      const result = await controller.getSyncStatus(undefined, mockUser as any);

      expect(result.organizationId).toBe('org-123');
      expect(result.lastSyncDate).toBeNull();
    });
  });

  describe('triggerDigest', () => {
    it('should enqueue email digest job', async () => {
      const result = await controller.triggerDigest(
        { brandId: 'brand-1' },
        mockUser as any,
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
        mockUser as any,
      );

      expect(result.sent).toBe(1);
      expect(mockEmailDigestService.sendDigest).toHaveBeenCalled();
    });
  });
});
