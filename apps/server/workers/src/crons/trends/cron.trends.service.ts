import { WorkflowExecutionTrigger } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Injectable,
  type OnApplicationBootstrap,
  type OnModuleInit,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TrendsService } from '@server/collections/trends/services/trends.service';
import {
  buildTrendDatasetTaskWorkflowDefinition,
  buildTrendsBackfillWorkflowDefinition,
  buildTrendsRefreshWorkflowDefinition,
  TRENDS_MAINTENANCE_ACTION_IDS,
  type TrendDatasetTask,
  type TrendsMaintenanceRequest,
} from '@server/collections/trends/services/trends-maintenance-workflow-definition';
import { WorkflowExecutionQueueService } from '@server/collections/workflows/services/workflow-execution-queue.service';
import {
  type SystemWorkflowGraphDefinition,
  SystemWorkflowRunnerService,
} from '@server/collections/workflows/system-workflow-runner.service';
import { CacheService } from '@server/services/cache/cache.service';
import { ConfigService } from '@workers/config/config.service';

const SYSTEM_MAINTENANCE_PRINCIPAL_ID = 'genfeed-public-tools';
const MIN_ACTIVE_TRENDS = 50;
const MIN_REFERENCE_RECORDS = 100;
const COOLDOWN_KEY = 'cron:trends:backfill:cooldown';
const ATTEMPTS_KEY = 'cron:trends:backfill:attempts';
const BASE_COOLDOWN_SECONDS = 60 * 60;
const MAX_COOLDOWN_SECONDS = 12 * 60 * 60;
const ATTEMPTS_TTL_SECONDS = 24 * 60 * 60;

@Injectable()
export class CronTrendsService implements OnApplicationBootstrap, OnModuleInit {
  private readonly context = 'CronTrendsService';

  constructor(
    private readonly trendsService: TrendsService,
    private readonly cacheService: CacheService,
    private readonly loggerService: LoggerService,
    private readonly configService: ConfigService,
    private readonly workflowQueue: WorkflowExecutionQueueService,
    private readonly workflowRunner: SystemWorkflowRunnerService,
  ) {}

  onModuleInit(): void {
    this.registerActions();
    this.workflowRunner.registerWorkflow(
      buildTrendDatasetTaskWorkflowDefinition(),
    );
    this.workflowRunner.registerWorkflow(
      buildTrendsRefreshWorkflowDefinition(),
    );
    this.workflowRunner.registerWorkflow(
      buildTrendsBackfillWorkflowDefinition(),
    );
  }

  onApplicationBootstrap(): void {
    if (this.configService.isDevSchedulersEnabled) {
      void this.backfillGlobalTrendCorpus();
    }
  }

  @Cron('0 15 0,12 * * *', { timeZone: 'UTC' })
  async warmGlobalTrendDatasets(now = new Date()): Promise<void> {
    if (!this.configService.isDevSchedulersEnabled) return;
    await this.enqueue(
      buildTrendsRefreshWorkflowDefinition(),
      'scheduled-trends-warmup',
      `trends-warmup-${Math.floor(now.getTime() / (12 * 60 * 60 * 1000))}`,
      now,
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async refreshGlobalTrends(now = new Date()): Promise<void> {
    if (!this.configService.isDevSchedulersEnabled) return;
    await this.enqueue(
      buildTrendsRefreshWorkflowDefinition(),
      'scheduled-trends-refresh',
      `trends-refresh-${now.toISOString().slice(0, 10)}`,
      now,
    );
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async backfillGlobalTrendCorpus(now = new Date()): Promise<void> {
    if (!this.configService.isDevSchedulersEnabled) return;
    await this.enqueue(
      buildTrendsBackfillWorkflowDefinition(),
      'scheduled-trends-backfill',
      `trends-backfill-${Math.floor(now.getTime() / (30 * 60 * 1000))}`,
      now,
    );
  }

  private registerActions(): void {
    this.workflowRunner.registerAction(
      TRENDS_MAINTENANCE_ACTION_IDS.EXPIRE_TRENDS,
      () =>
        this.countResult(this.trendsService.markExpiredTrendsAsHistorical()),
    );
    this.workflowRunner.registerAction(
      TRENDS_MAINTENANCE_ACTION_IDS.EXPIRE_VIDEOS,
      () =>
        this.countResult(this.trendsService.markExpiredVideosAsHistorical()),
    );
    this.workflowRunner.registerAction(
      TRENDS_MAINTENANCE_ACTION_IDS.EXPIRE_HASHTAGS,
      () =>
        this.countResult(this.trendsService.markExpiredHashtagsAsHistorical()),
    );
    this.workflowRunner.registerAction(
      TRENDS_MAINTENANCE_ACTION_IDS.EXPIRE_SOUNDS,
      () =>
        this.countResult(this.trendsService.markExpiredSoundsAsHistorical()),
    );
    this.workflowRunner.registerAction(
      TRENDS_MAINTENANCE_ACTION_IDS.FETCH_GLOBAL,
      async () => ({
        count: (await this.trendsService.fetchAndCacheTrends()).length,
      }),
    );
    this.workflowRunner.registerAction(
      TRENDS_MAINTENANCE_ACTION_IDS.FETCH_DATASET,
      ({ input }) => this.fetchDataset(input.task as TrendDatasetTask),
    );
    this.workflowRunner.registerAction(
      TRENDS_MAINTENANCE_ACTION_IDS.FETCH_SOUNDS,
      () => this.countResult(this.trendsService.fetchAndCacheSounds()),
    );
    this.workflowRunner.registerAction(
      TRENDS_MAINTENANCE_ACTION_IDS.PRECOMPUTE_PREVIEW,
      () => this.trendsService.precomputeGlobalTrendSourcePreview(),
    );
    this.workflowRunner.registerAction(
      TRENDS_MAINTENANCE_ACTION_IDS.EVALUATE_BACKFILL,
      () => this.evaluateBackfill(),
    );
    this.workflowRunner.registerAction(
      TRENDS_MAINTENANCE_ACTION_IDS.FINALIZE_BACKFILL,
      ({ input }) => this.finalizeBackfill(Boolean(input.refresh)),
    );
  }

  private async countResult(
    result: Promise<number>,
  ): Promise<{ count: number }> {
    return { count: await result };
  }

  private async fetchDataset(task: TrendDatasetTask): Promise<{
    count: number;
    dataset: TrendDatasetTask['dataset'];
    platform: string;
  }> {
    if (!task || !['hashtags', 'videos'].includes(task.dataset)) {
      throw new Error('Trend dataset task is invalid');
    }
    const count =
      task.dataset === 'videos'
        ? await this.trendsService.fetchAndCacheViralVideos(task.platform)
        : await this.trendsService.fetchAndCacheHashtags(task.platform);
    return {
      count,
      dataset: task.dataset,
      platform: task.platform,
    };
  }

  private async evaluateBackfill(): Promise<{
    attempts: number;
    shouldBackfill: boolean;
    stats: Awaited<ReturnType<TrendsService['getGlobalCorpusStats']>>;
  }> {
    const stats = await this.trendsService.getGlobalCorpusStats();
    if (this.thresholdsSatisfied(stats)) {
      await this.clearBackoff();
      return { attempts: 0, shouldBackfill: false, stats };
    }
    const attempts = await this.getAttempts();
    const claim = await this.cacheService.claimOnce(
      COOLDOWN_KEY,
      this.cooldownSeconds(attempts),
    );
    return { attempts, shouldBackfill: claim !== 'duplicate', stats };
  }

  private async finalizeBackfill(wasRefreshed: boolean): Promise<{
    refreshed: boolean;
    stats: Awaited<ReturnType<TrendsService['getGlobalCorpusStats']>>;
  }> {
    const stats = await this.trendsService.getGlobalCorpusStats();
    if (wasRefreshed) {
      if (this.thresholdsSatisfied(stats)) await this.clearBackoff();
      else await this.recordUnproductive(await this.getAttempts());
    }
    return { refreshed: wasRefreshed, stats };
  }

  private thresholdsSatisfied(stats: {
    activeTrends: number;
    referenceRecords: number;
  }): boolean {
    return (
      stats.activeTrends >= MIN_ACTIVE_TRENDS &&
      stats.referenceRecords >= MIN_REFERENCE_RECORDS
    );
  }

  private async getAttempts(): Promise<number> {
    const stored = await this.cacheService.get<number>(ATTEMPTS_KEY);
    return typeof stored === 'number' && stored > 0 ? stored : 0;
  }

  private cooldownSeconds(attempts: number): number {
    return Math.min(
      BASE_COOLDOWN_SECONDS * 2 ** attempts,
      MAX_COOLDOWN_SECONDS,
    );
  }

  private async recordUnproductive(attempts: number): Promise<void> {
    await this.cacheService.set(ATTEMPTS_KEY, attempts + 1, {
      ttl: ATTEMPTS_TTL_SECONDS,
    });
  }

  private async clearBackoff(): Promise<void> {
    await this.cacheService.del(ATTEMPTS_KEY);
    await this.cacheService.del(COOLDOWN_KEY);
  }

  private async enqueue(
    definition: SystemWorkflowGraphDefinition,
    source: string,
    jobId: string,
    now: Date,
  ): Promise<string> {
    const request: TrendsMaintenanceRequest = {
      requestedAt: now.toISOString(),
      source,
    };
    const queued = await this.workflowQueue.queueSystemWorkflow(
      {
        actionType: definition.canonicalId,
        canonicalId: definition.canonicalId,
        inputValues: { request },
        organizationId: SYSTEM_MAINTENANCE_PRINCIPAL_ID,
        source,
        trigger: WorkflowExecutionTrigger.SCHEDULED,
        userId: SYSTEM_MAINTENANCE_PRINCIPAL_ID,
      },
      jobId,
      { attempts: 3, replaceTerminalJob: true },
    );
    this.loggerService.log('Queued trend maintenance workflow', {
      context: this.context,
      jobId: queued,
      workflowId: definition.canonicalId,
    });
    return queued;
  }
}
