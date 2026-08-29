import { WorkflowExecutionTrigger } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { TrendsService } from '@server/collections/trends/services/trends.service';
import {
  TRENDS_MAINTENANCE_ACTION_IDS,
  TRENDS_MAINTENANCE_WORKFLOW_IDS,
} from '@server/collections/trends/services/trends-maintenance-workflow-definition';
import { WorkflowExecutionQueueService } from '@server/collections/workflows/services/workflow-execution-queue.service';
import { SystemWorkflowRunnerService } from '@server/collections/workflows/system-workflow-runner.service';
import { CacheService } from '@server/services/cache/cache.service';
import { ConfigService } from '@workers/config/config.service';
import { CronTrendsService } from '@workers/crons/trends/cron.trends.service';

type CapturedAction = (request: {
  input: Record<string, unknown>;
}) => Promise<unknown> | unknown;

describe('CronTrendsService', () => {
  let service: CronTrendsService;
  let actions: Map<string, CapturedAction>;
  let config: { isDevSchedulersEnabled: boolean };
  let queue: { queueSystemWorkflow: ReturnType<typeof vi.fn> };
  let cache: Record<string, ReturnType<typeof vi.fn>>;
  let trends: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    actions = new Map();
    config = { isDevSchedulersEnabled: true };
    queue = {
      queueSystemWorkflow: vi.fn().mockResolvedValue('job-1'),
    };
    cache = {
      claimOnce: vi.fn().mockResolvedValue('claimed'),
      del: vi.fn().mockResolvedValue(true),
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(true),
    };
    trends = {
      fetchAndCacheHashtags: vi.fn().mockResolvedValue(0),
      fetchAndCacheSounds: vi.fn().mockResolvedValue(0),
      fetchAndCacheTrends: vi.fn().mockResolvedValue([{ id: 'trend-1' }]),
      fetchAndCacheViralVideos: vi.fn().mockResolvedValue(0),
      getGlobalCorpusStats: vi
        .fn()
        .mockResolvedValue({ activeTrends: 0, referenceRecords: 0 }),
      markExpiredHashtagsAsHistorical: vi.fn().mockResolvedValue(0),
      markExpiredSoundsAsHistorical: vi.fn().mockResolvedValue(0),
      markExpiredTrendsAsHistorical: vi.fn().mockResolvedValue(0),
      markExpiredVideosAsHistorical: vi.fn().mockResolvedValue(0),
      precomputeGlobalTrendSourcePreview: vi.fn().mockResolvedValue({}),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronTrendsService,
        { provide: TrendsService, useValue: trends },
        { provide: CacheService, useValue: cache },
        { provide: ConfigService, useValue: config },
        { provide: WorkflowExecutionQueueService, useValue: queue },
        {
          provide: SystemWorkflowRunnerService,
          useValue: {
            registerAction: vi.fn((id: string, action: CapturedAction) => {
              actions.set(id, action);
            }),
            registerWorkflow: vi.fn(),
          },
        },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
      ],
    }).compile();
    service = module.get(CronTrendsService);
    service.onModuleInit();
  });

  it('queues the immutable refresh graph with scheduled provenance', async () => {
    await service.refreshGlobalTrends(new Date('2026-08-28T06:00:00.000Z'));
    expect(queue.queueSystemWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: TRENDS_MAINTENANCE_WORKFLOW_IDS.REFRESH,
        trigger: WorkflowExecutionTrigger.SCHEDULED,
      }),
      'trends-refresh-2026-08-28',
      { attempts: 3, replaceTerminalJob: true },
    );
    expect(trends.fetchAndCacheTrends).not.toHaveBeenCalled();
  });

  it('retains preview warmup as an action-backed workflow step', async () => {
    const action = actions.get(
      TRENDS_MAINTENANCE_ACTION_IDS.PRECOMPUTE_PREVIEW,
    );
    await action?.({ input: {} });
    expect(trends.precomputeGlobalTrendSourcePreview).toHaveBeenCalledOnce();
  });

  it('retains the twice-daily warmup and startup backfill adapters', async () => {
    await service.warmGlobalTrendDatasets(new Date('2026-08-28T12:15:00.000Z'));
    service.onApplicationBootstrap();
    await Promise.resolve();
    expect(queue.queueSystemWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: TRENDS_MAINTENANCE_WORKFLOW_IDS.REFRESH,
      }),
      expect.stringMatching(/^trends-warmup-/),
      expect.anything(),
    );
    expect(queue.queueSystemWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: TRENDS_MAINTENANCE_WORKFLOW_IDS.BACKFILL,
      }),
      expect.stringMatching(/^trends-backfill-/),
      expect.anything(),
    );
  });

  it('retains backoff evaluation inside the registered action', async () => {
    const action = actions.get(TRENDS_MAINTENANCE_ACTION_IDS.EVALUATE_BACKFILL);
    await action?.({ input: {} });
    expect(cache.claimOnce).toHaveBeenCalledWith(
      expect.stringContaining('backfill'),
      60 * 60,
    );
  });

  it('does not queue when local schedulers are disabled', async () => {
    config.isDevSchedulersEnabled = false;
    await service.refreshGlobalTrends();
    await service.backfillGlobalTrendCorpus();
    expect(queue.queueSystemWorkflow).not.toHaveBeenCalled();
  });
});
