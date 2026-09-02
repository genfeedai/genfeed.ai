import { TrendsService } from '@api/collections/trends/services/trends.service';
import {
  TRENDS_MAINTENANCE_ACTION_IDS,
  TRENDS_MAINTENANCE_WORKFLOW_IDS,
} from '@api/collections/trends/services/trends-maintenance-workflow-definition';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { WorkflowExecutionTrigger } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaService } from '@libs/prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
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
  let trends: Record<string, ReturnType<typeof vi.fn>>;
  let prisma: { credential: { findMany: ReturnType<typeof vi.fn> } };
  let workflowRunner: {
    registerAction: ReturnType<typeof vi.fn>;
    registerWorkflow: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    actions = new Map();
    config = { isDevSchedulersEnabled: true };
    queue = {
      queueSystemWorkflow: vi.fn().mockResolvedValue('job-1'),
    };
    prisma = { credential: { findMany: vi.fn().mockResolvedValue([]) } };
    trends = {
      fetchAndCacheHashtags: vi.fn().mockResolvedValue(0),
      fetchAndCachePlatformTrends: vi.fn().mockResolvedValue([]),
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
    workflowRunner = {
      registerAction: vi.fn((id: string, action: CapturedAction) => {
        actions.set(id, action);
      }),
      registerWorkflow: vi.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronTrendsService,
        { provide: TrendsService, useValue: trends },
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        { provide: WorkflowExecutionQueueService, useValue: queue },
        {
          provide: SystemWorkflowRunnerService,
          useValue: workflowRunner,
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

  it('queues one immutable refresh graph per twelve-hour window', async () => {
    await service.refreshGlobalTrends(new Date('2026-08-28T12:15:00.000Z'));
    expect(queue.queueSystemWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: TRENDS_MAINTENANCE_WORKFLOW_IDS.REFRESH,
        trigger: WorkflowExecutionTrigger.SCHEDULED,
      }),
      'trends-refresh-41387',
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

  it('registers no empty-corpus backfill workflow that can fan out paid actors', () => {
    const registeredIds = workflowRunner.registerWorkflow.mock.calls.map(
      ([definition]) => definition.canonicalId,
    );

    expect(registeredIds).toEqual([
      TRENDS_MAINTENANCE_WORKFLOW_IDS.DATASET_TASK,
      TRENDS_MAINTENANCE_WORKFLOW_IDS.REFRESH,
      TRENDS_MAINTENANCE_WORKFLOW_IDS.SCOPED_TASK,
      TRENDS_MAINTENANCE_WORKFLOW_IDS.SCOPED_REFRESH,
    ]);
    expect(actions.has(TRENDS_MAINTENANCE_ACTION_IDS.FETCH_GLOBAL)).toBe(true);
  });

  it('discovers each connected platform scope once for native enrichment', async () => {
    prisma.credential.findMany.mockResolvedValue([
      {
        brandId: 'brand-1',
        organizationId: 'org-1',
        platform: 'TIKTOK',
      },
    ]);
    const action = actions.get(TRENDS_MAINTENANCE_ACTION_IDS.DISCOVER_SCOPED);

    await expect(action?.({ input: {} })).resolves.toEqual({
      items: [
        {
          brandId: 'brand-1',
          organizationId: 'org-1',
          platform: 'tiktok',
        },
      ],
    });
  });

  it('refreshes a connected scope through native providers without Apify fallback', async () => {
    const action = actions.get(TRENDS_MAINTENANCE_ACTION_IDS.FETCH_SCOPED);
    await action?.({
      input: {
        task: {
          brandId: 'brand-1',
          organizationId: 'org-1',
          platform: 'instagram',
        },
      },
    });

    expect(trends.fetchAndCachePlatformTrends).toHaveBeenCalledWith(
      'instagram',
      'org-1',
      'brand-1',
      { allowApifyFallback: false },
    );
  });

  it('rejects an invalid dataset task with a framework exception', async () => {
    const action = actions.get(TRENDS_MAINTENANCE_ACTION_IDS.FETCH_DATASET);

    await expect(
      action?.({ input: { task: { dataset: 'unknown' } } }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an invalid scoped task with a framework exception', async () => {
    const action = actions.get(TRENDS_MAINTENANCE_ACTION_IDS.FETCH_SCOPED);

    await expect(
      action?.({ input: { task: { platform: 'instagram' } } }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not queue when local schedulers are disabled', async () => {
    config.isDevSchedulersEnabled = false;
    await service.refreshGlobalTrends();
    expect(queue.queueSystemWorkflow).not.toHaveBeenCalled();
  });
});
