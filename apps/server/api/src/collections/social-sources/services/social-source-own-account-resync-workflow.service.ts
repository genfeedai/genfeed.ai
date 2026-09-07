import {
  buildSocialSourceOwnAccountResyncItemWorkflowDefinition,
  buildSocialSourceOwnAccountResyncSweepWorkflowDefinition,
  SOCIAL_SOURCE_OWN_ACCOUNT_RESYNC_ACTION_IDS,
  SOCIAL_SOURCE_OWN_ACCOUNT_RESYNC_WORKFLOW_ID,
} from '@api/collections/social-sources/services/social-source-own-account-resync-workflow-definition';
import { SocialSourcesService } from '@api/collections/social-sources/services/social-sources.service';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  SocialSourceType,
  WorkflowExecutionTrigger,
} from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, type OnModuleInit } from '@nestjs/common';

const SYSTEM_MAINTENANCE_PRINCIPAL_ID = 'genfeed-public-tools';
const RESYNC_SWEEP_INTERVAL_MS = 60 * 60 * 1000;

/** Upper bound on sources discovered (and thus scheduled) per sweep run. */
export const SOCIAL_OWN_ACCOUNT_RESYNC_MAX_SOURCES_PER_RUN = 200;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export interface SocialSourceOwnAccountResyncItem {
  brandId: string;
  organizationId: string;
  sourceId: string;
  userId: string;
}

interface SocialSourceOwnAccountResyncRunResult {
  importedCount: number;
  provider: string | null;
  rejectedCount: number;
  sourceId: string;
}

/**
 * Executes the own-account resync sweep: a discovery action that lists due
 * own-account sources across every tenant, fanned out through
 * `workflow.for-each-tenant` to a per-source child workflow. Registered in
 * the API and worker processes alike, mirroring
 * `SocialSourceHistoryImportWorkflowService`.
 */
@Injectable()
export class SocialSourceOwnAccountResyncWorkflowService
  implements OnModuleInit
{
  constructor(
    private readonly prisma: PrismaService,
    private readonly socialSourcesService: SocialSourcesService,
    private readonly queue: WorkflowExecutionQueueService,
    private readonly runner: SystemWorkflowRunnerService,
    private readonly logger: LoggerService,
  ) {}

  onModuleInit(): void {
    this.runner.registerAction(
      SOCIAL_SOURCE_OWN_ACCOUNT_RESYNC_ACTION_IDS.DISCOVER,
      () => this.discoverDueSources(),
    );
    this.runner.registerAction(
      SOCIAL_SOURCE_OWN_ACCOUNT_RESYNC_ACTION_IDS.RUN,
      ({ input }) =>
        this.runResync(input.request as SocialSourceOwnAccountResyncItem),
    );
    this.runner.registerWorkflow(
      buildSocialSourceOwnAccountResyncSweepWorkflowDefinition(),
    );
    this.runner.registerWorkflow(
      buildSocialSourceOwnAccountResyncItemWorkflowDefinition(),
    );
  }

  async enqueueSweep(now = new Date()): Promise<string> {
    return this.queue.queueSystemWorkflow(
      {
        actionType: SOCIAL_SOURCE_OWN_ACCOUNT_RESYNC_WORKFLOW_ID,
        canonicalId: SOCIAL_SOURCE_OWN_ACCOUNT_RESYNC_WORKFLOW_ID,
        inputValues: {},
        organizationId: SYSTEM_MAINTENANCE_PRINCIPAL_ID,
        source: 'social_source_own_account_resync_sweep',
        trigger: WorkflowExecutionTrigger.SCHEDULED,
        userId: SYSTEM_MAINTENANCE_PRINCIPAL_ID,
      },
      `social-source-own-account-resync-${Math.floor(now.getTime() / RESYNC_SWEEP_INTERVAL_MS)}`,
      { attempts: 3, replaceTerminalJob: true },
    );
  }

  /**
   * Lists own-account sources due for a metrics resync under a tiered
   * cadence, bounded to
   * `SOCIAL_OWN_ACCOUNT_RESYNC_MAX_SOURCES_PER_RUN` sources per run so one
   * sweep can never balloon:
   *
   * - Sources connected less than 7 days ago resync every 6 hours (metrics
   *   move fastest right after an account is connected).
   * - Sources connected 7-30 days ago resync once a day.
   * - Sources connected more than 30 days ago resync once a week.
   *
   * A source that has never synced (`lastSyncedAt` is null) is always due.
   * This runs hourly (see `RESYNC_SWEEP_INTERVAL_MS`) purely to keep the
   * discovery window tight; the tiers above are what actually throttle how
   * often any one source is re-collected.
   */
  async discoverDueSources(
    now = new Date(),
  ): Promise<{ items: SocialSourceOwnAccountResyncItem[] }> {
    const sixHoursAgo = new Date(now.getTime() - 6 * HOUR_MS);
    const oneDayAgo = new Date(now.getTime() - DAY_MS);
    const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY_MS);

    // tenant-scope-ignore: platform sweep intentionally spans organizations so every eligible own-account source can schedule its own tenant-scoped resync
    const sources = await this.prisma.socialSource.findMany({
      orderBy: [{ lastSyncedAt: 'asc' }, { id: 'asc' }],
      select: {
        brandId: true,
        id: true,
        organizationId: true,
        userId: true,
      },
      take: SOCIAL_OWN_ACCOUNT_RESYNC_MAX_SOURCES_PER_RUN,
      where: {
        credentialId: { not: null },
        isActive: true,
        isDeleted: false,
        sourceType: SocialSourceType.OWN_ACCOUNT,
        OR: [
          { lastSyncedAt: null },
          {
            createdAt: { gte: sevenDaysAgo },
            lastSyncedAt: { lte: sixHoursAgo },
          },
          {
            createdAt: { gte: thirtyDaysAgo, lt: sevenDaysAgo },
            lastSyncedAt: { lte: oneDayAgo },
          },
          {
            createdAt: { lt: thirtyDaysAgo },
            lastSyncedAt: { lte: sevenDaysAgo },
          },
        ],
      },
    });

    return {
      items: sources.map((source) => ({
        brandId: source.brandId,
        organizationId: source.organizationId,
        sourceId: source.id,
        userId: source.userId,
      })),
    };
  }

  private async runResync(
    request: SocialSourceOwnAccountResyncItem,
  ): Promise<SocialSourceOwnAccountResyncRunResult> {
    const source = await this.prisma.socialSource.findFirst({
      where: scopedWhere(request.organizationId, {
        brandId: request.brandId,
        id: request.sourceId,
      }),
    });
    if (!source) {
      throw new Error(
        `Own-account source ${request.sourceId} is not available for resync`,
      );
    }

    const result = await this.socialSourcesService.resyncOwnAccount(source);
    this.logger.log('Social account own-account resync completed', {
      importedCount: result.count,
      provider: result.provider,
      sourceId: source.id,
    });
    return {
      importedCount: result.count,
      provider: result.provider ?? null,
      rejectedCount: result.rejectedCount,
      sourceId: source.id,
    };
  }
}
