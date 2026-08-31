import {
  fromPrismaCredentialPlatform,
  WorkflowExecutionTrigger,
} from '@genfeedai/enums';
import { CredentialPlatform as PrismaCredentialPlatform } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaService } from '@libs/prisma/prisma.service';
import {
  BadRequestException,
  Injectable,
  type OnModuleInit,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TrendsService } from '@server/collections/trends/services/trends.service';
import {
  buildScopedTrendsRefreshWorkflowDefinition,
  buildScopedTrendTaskWorkflowDefinition,
  buildTrendDatasetTaskWorkflowDefinition,
  buildTrendsRefreshWorkflowDefinition,
  type ScopedTrendRefreshTask,
  TRENDS_MAINTENANCE_ACTION_IDS,
  type TrendDatasetTask,
  type TrendsMaintenanceRequest,
} from '@server/collections/trends/services/trends-maintenance-workflow-definition';
import { WorkflowExecutionQueueService } from '@server/collections/workflows/services/workflow-execution-queue.service';
import {
  type SystemWorkflowGraphDefinition,
  SystemWorkflowRunnerService,
} from '@server/collections/workflows/system-workflow-runner.service';
import { ConfigService } from '@workers/config/config.service';

const SYSTEM_MAINTENANCE_PRINCIPAL_ID = 'genfeed-public-tools';
const REFRESH_WINDOW_MS = 12 * 60 * 60 * 1000;

@Injectable()
export class CronTrendsService implements OnModuleInit {
  private readonly context = 'CronTrendsService';

  constructor(
    private readonly trendsService: TrendsService,
    private readonly prisma: PrismaService,
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
      buildScopedTrendTaskWorkflowDefinition(),
    );
    this.workflowRunner.registerWorkflow(
      buildScopedTrendsRefreshWorkflowDefinition(),
    );
  }

  @Cron('0 15 0,12 * * *', { timeZone: 'UTC' })
  async refreshGlobalTrends(now = new Date()): Promise<void> {
    if (!this.configService.isDevSchedulersEnabled) return;
    const windowId = Math.floor(now.getTime() / REFRESH_WINDOW_MS);
    await Promise.all([
      this.enqueue(
        buildTrendsRefreshWorkflowDefinition(),
        'scheduled-trends-refresh',
        `trends-refresh-${windowId}`,
        now,
      ),
      this.enqueue(
        buildScopedTrendsRefreshWorkflowDefinition(),
        'scheduled-scoped-native-trends-refresh',
        `trends-scoped-refresh-${windowId}`,
        now,
      ),
    ]);
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
      TRENDS_MAINTENANCE_ACTION_IDS.DISCOVER_SCOPED,
      () => this.discoverScopedTrendTasks(),
    );
    this.workflowRunner.registerAction(
      TRENDS_MAINTENANCE_ACTION_IDS.FETCH_SCOPED,
      ({ input }) =>
        this.fetchScopedTrendTask(input.task as ScopedTrendRefreshTask),
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
      throw new BadRequestException('Trend dataset task is invalid');
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

  private async discoverScopedTrendTasks(): Promise<{
    items: ScopedTrendRefreshTask[];
  }> {
    const credentials = await this.prisma.credential.findMany({
      distinct: ['organizationId', 'brandId', 'platform'],
      select: { brandId: true, organizationId: true, platform: true },
      where: {
        brandId: { not: null },
        isConnected: true,
        isDeleted: false,
        organizationId: { not: null },
        platform: {
          in: [
            PrismaCredentialPlatform.INSTAGRAM,
            PrismaCredentialPlatform.LINKEDIN,
            PrismaCredentialPlatform.PINTEREST,
            PrismaCredentialPlatform.REDDIT,
            PrismaCredentialPlatform.TIKTOK,
            PrismaCredentialPlatform.TWITTER,
            PrismaCredentialPlatform.YOUTUBE,
          ],
        },
      },
    });

    return {
      items: credentials.flatMap((credential) => {
        const platform = fromPrismaCredentialPlatform(credential.platform);
        return credential.organizationId && credential.brandId && platform
          ? [
              {
                brandId: credential.brandId,
                organizationId: credential.organizationId,
                platform,
              },
            ]
          : [];
      }),
    };
  }

  private async fetchScopedTrendTask(
    task: ScopedTrendRefreshTask,
  ): Promise<{ count: number; platform: string }> {
    if (!task?.organizationId || !task.brandId || !task.platform) {
      throw new BadRequestException('Scoped trend refresh task is invalid');
    }

    const trends = await this.trendsService.fetchAndCachePlatformTrends(
      task.platform,
      task.organizationId,
      task.brandId,
      { allowApifyFallback: false },
    );
    return { count: trends.length, platform: task.platform };
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
