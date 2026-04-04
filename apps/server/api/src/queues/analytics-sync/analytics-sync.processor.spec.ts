import { AnalyticsSyncService } from '@api/collections/content-performance/services/analytics-sync.service';
import { AnalyticsSyncProcessor } from '@api/queues/analytics-sync/analytics-sync.processor';
import { LoggerService } from '@libs/logger/logger.service';
import { Test } from '@nestjs/testing';
import { vi } from 'vitest';

describe('AnalyticsSyncProcessor', () => {
  let processor: AnalyticsSyncProcessor;
  let mockAnalyticsSyncService: {
    syncAnalytics: ReturnType<typeof vi.fn>;
    getLastSyncDate: ReturnType<typeof vi.fn>;
  };
  let mockLogger: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockAnalyticsSyncService = {
      getLastSyncDate: vi.fn().mockResolvedValue(null),
      syncAnalytics: vi.fn().mockResolvedValue({
        errors: 0,
        organizationId: 'org-1',
        skipped: 0,
        synced: 10,
      }),
    };

    mockLogger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        AnalyticsSyncProcessor,
        { provide: AnalyticsSyncService, useValue: mockAnalyticsSyncService },
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();

    processor = module.get(AnalyticsSyncProcessor);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  it('should process sync job with explicit since date', async () => {
    const mockJob = {
      data: {
        organizationId: 'org-1',
        since: '2026-01-01T00:00:00.000Z',
      },
      updateProgress: vi.fn(),
    };

    const result = await processor.process(mockJob as any);

    expect(result.synced).toBe(10);
    expect(mockAnalyticsSyncService.syncAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        since: expect.any(Date),
      }),
    );
  });

  it('should use incremental sync when no since date provided', async () => {
    const lastSync = new Date('2026-02-01');
    mockAnalyticsSyncService.getLastSyncDate.mockResolvedValue(lastSync);

    const mockJob = {
      data: {
        incremental: true,
        organizationId: 'org-1',
      },
      updateProgress: vi.fn(),
    };

    const result = await processor.process(mockJob as any);

    expect(mockAnalyticsSyncService.getLastSyncDate).toHaveBeenCalledWith(
      'org-1',
      undefined,
    );
    expect(mockAnalyticsSyncService.syncAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({ since: lastSync }),
    );
    expect(result.synced).toBe(10);
  });
});
