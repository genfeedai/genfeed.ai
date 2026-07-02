import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

type BackfillBrand = {
  id: string;
  organizationId: string;
  userId: string | null;
};

type BackfillOrganization = {
  id: string;
  userId: string | null;
};

type WorkflowDeploymentBackfillReport = {
  brandFailures: number;
  brandsProcessed: number;
  legacyCronFailed: number;
  legacyCronInvalid: number;
  legacyCronMigrated: number;
  legacyCronScanned: number;
  orgFailures: number;
  organizationsProcessed: number;
};

type WorkflowDeploymentBackfillOptions = {
  concurrency?: number;
};

const DEFAULT_BACKFILL_CONCURRENCY = 1;
const PROGRESS_LOG_INTERVAL = 25;

@Injectable()
export class WorkflowDeploymentBackfillService {
  private readonly context = 'WorkflowDeploymentBackfillService';

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async run(
    options: WorkflowDeploymentBackfillOptions = {},
  ): Promise<WorkflowDeploymentBackfillReport> {
    const concurrency = this.normalizeConcurrency(options.concurrency);
    this.logProgress('Starting deployment workflow backfill', {
      concurrency,
    });

    const organizations = (await this.prisma.organization.findMany({
      orderBy: { createdAt: 'asc' },
      select: { id: true, userId: true },
      where: { isDeleted: false },
    })) as BackfillOrganization[];
    const orgOwnerById = new Map<string, string>();
    let organizationsProcessed = 0;
    let orgFailures = 0;
    const eligibleOrganizations: BackfillOrganization[] = [];

    for (const organization of organizations) {
      if (!organization.userId) {
        continue;
      }
      orgOwnerById.set(organization.id, organization.userId);
      eligibleOrganizations.push(organization);
    }

    await this.processWithConcurrency(
      eligibleOrganizations,
      concurrency,
      async (organization) => {
        try {
          await this.provisionOrganizationWorkflows(
            organization.userId as string,
            organization.id,
          );
        } catch (error: unknown) {
          orgFailures += 1;
          this.logger.error(
            'Failed to backfill organization workflows',
            error,
            {
              organizationId: organization.id,
            },
          );
        } finally {
          organizationsProcessed += 1;
          this.logProgressCheckpoint(
            'Organization workflow backfill progress',
            organizationsProcessed,
            eligibleOrganizations.length,
            orgFailures,
          );
        }
      },
    );

    const brands = (await this.prisma.brand.findMany({
      orderBy: { createdAt: 'asc' },
      select: { id: true, organizationId: true, userId: true },
      where: { isDeleted: false },
    })) as BackfillBrand[];
    let brandsProcessed = 0;
    let brandFailures = 0;
    const eligibleBrands = brands.filter(
      (brand) => brand.userId ?? orgOwnerById.get(brand.organizationId),
    );

    await this.processWithConcurrency(
      eligibleBrands,
      concurrency,
      async (brand) => {
        const userId = brand.userId ?? orgOwnerById.get(brand.organizationId);
        if (!userId) {
          return;
        }

        try {
          const { DefaultRecurringContentService } = await import(
            '@api/collections/brands/services/default-recurring-content.service'
          );
          const defaultRecurringContentService = this.moduleRef.get(
            DefaultRecurringContentService,
            { strict: false },
          );
          await defaultRecurringContentService.ensureDefaultBundle({
            brandId: brand.id,
            includeStatus: false,
            organizationId: brand.organizationId,
            origin: 'system',
            userId,
          });
        } catch (error: unknown) {
          brandFailures += 1;
          this.logger.error(
            'Failed to backfill default recurring workflows',
            error,
            {
              brandId: brand.id,
              organizationId: brand.organizationId,
            },
          );
        } finally {
          brandsProcessed += 1;
          this.logProgressCheckpoint(
            'Brand workflow backfill progress',
            brandsProcessed,
            eligibleBrands.length,
            brandFailures,
          );
        }
      },
    );

    const { CronJobsService } = await import(
      '@api/collections/cron-jobs/services/cron-jobs.service'
    );
    const cronJobsService = this.moduleRef.get(CronJobsService, {
      strict: false,
    });
    let legacyCronReport = {
      failed: 0,
      invalid: 0,
      migrated: 0,
      scanned: 0,
      skipped: 0,
    };

    try {
      this.logProgress('Starting legacy cron workflow migration');
      legacyCronReport = await cronJobsService.migrateLegacyJobsToWorkflows({
        dryRun: false,
      });
      this.logProgress('Legacy cron workflow migration completed', {
        failed: legacyCronReport.failed,
        invalid: legacyCronReport.invalid,
        migrated: legacyCronReport.migrated,
        scanned: legacyCronReport.scanned,
        skipped: legacyCronReport.skipped,
      });
    } catch (error: unknown) {
      // Treat an unexpected throw the same way the org/brand loops above treat
      // their failures: log it and count it as a hard failure so the final gate
      // still fails the deploy closed, but with a structured report instead of
      // an opaque task crash mid-migration.
      legacyCronReport = {
        ...legacyCronReport,
        failed: legacyCronReport.failed + 1,
      };
      this.logger.error(
        'Failed to migrate legacy cron jobs to workflows',
        error,
      );
    }

    const report: WorkflowDeploymentBackfillReport = {
      brandFailures,
      brandsProcessed,
      legacyCronFailed: legacyCronReport.failed,
      legacyCronInvalid: legacyCronReport.invalid,
      legacyCronMigrated: legacyCronReport.migrated,
      legacyCronScanned: legacyCronReport.scanned,
      orgFailures,
      organizationsProcessed,
    };

    this.logProgress('Deployment workflow backfill completed', report);

    const hardFailures =
      report.orgFailures + report.brandFailures + report.legacyCronFailed;
    if (hardFailures > 0) {
      throw new Error(
        `Deployment workflow backfill failed: orgFailures=${report.orgFailures}, brandFailures=${report.brandFailures}, legacyCronFailed=${report.legacyCronFailed}`,
      );
    }

    return report;
  }

  private async processWithConcurrency<T>(
    items: readonly T[],
    concurrency: number,
    worker: (item: T) => Promise<void>,
  ): Promise<void> {
    let nextIndex = 0;
    const workerCount = Math.min(concurrency, Math.max(items.length, 1));

    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (true) {
          const index = nextIndex;
          nextIndex += 1;

          if (index >= items.length) {
            return;
          }

          await worker(items[index] as T);
        }
      }),
    );
  }

  private normalizeConcurrency(concurrency: number | undefined): number {
    if (!Number.isSafeInteger(concurrency) || !concurrency) {
      return DEFAULT_BACKFILL_CONCURRENCY;
    }

    return Math.min(Math.max(concurrency, 1), 10);
  }

  private logProgress(
    message: string,
    details?: Record<string, unknown>,
  ): void {
    const context = { ...(details ?? {}), service: this.context };
    this.logger.log(message, context);
  }

  private logProgressCheckpoint(
    message: string,
    processed: number,
    total: number,
    failures: number,
  ): void {
    if (processed !== total && processed % PROGRESS_LOG_INTERVAL !== 0) {
      return;
    }

    this.logProgress(message, {
      failures,
      processed,
      total,
    });
  }

  private async provisionOrganizationWorkflows(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    const { WorkflowsService } = await import(
      '@api/collections/workflows/services/workflows.service'
    );
    const workflowsService = this.moduleRef.get(WorkflowsService, {
      strict: false,
    });

    await workflowsService.ensureDailyTrendsDigestWorkflow(
      userId,
      organizationId,
    );
    await workflowsService.ensureAdAutomationWorkflows(userId, organizationId);
    await workflowsService.ensureCampaignOrchestrationWorkflows(
      userId,
      organizationId,
    );
    await workflowsService.ensureAgentAutopilotWorkflows(
      userId,
      organizationId,
    );
    await workflowsService.ensureAnalyticsSyncWorkflows(userId, organizationId);
    await workflowsService.ensureContentProductionWorkflows(
      userId,
      organizationId,
    );
    await workflowsService.ensureReplyPollingWorkflows(userId, organizationId);
    await workflowsService.ensureTrendNotificationWorkflows(
      userId,
      organizationId,
    );
    await workflowsService.ensureLivestreamBotWorkflows(userId, organizationId);
    await workflowsService.ensureSystemActionWorkflows(userId, organizationId);
  }
}
