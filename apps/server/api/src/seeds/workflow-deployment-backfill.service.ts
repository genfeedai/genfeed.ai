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

@Injectable()
export class WorkflowDeploymentBackfillService {
  private readonly context = 'WorkflowDeploymentBackfillService';

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async run(): Promise<WorkflowDeploymentBackfillReport> {
    this.logger.log('Starting deployment workflow backfill', this.context);

    const organizations = (await this.prisma.organization.findMany({
      orderBy: { createdAt: 'asc' },
      select: { id: true, userId: true },
      where: { isDeleted: false },
    })) as BackfillOrganization[];
    const orgOwnerById = new Map<string, string>();
    let organizationsProcessed = 0;
    let orgFailures = 0;

    for (const organization of organizations) {
      if (!organization.userId) {
        continue;
      }
      orgOwnerById.set(organization.id, organization.userId);
      organizationsProcessed += 1;

      try {
        await this.provisionOrganizationWorkflows(
          organization.userId,
          organization.id,
        );
      } catch (error: unknown) {
        orgFailures += 1;
        this.logger.error('Failed to backfill organization workflows', {
          error: error instanceof Error ? error.message : String(error),
          organizationId: organization.id,
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    }

    const brands = (await this.prisma.brand.findMany({
      orderBy: { createdAt: 'asc' },
      select: { id: true, organizationId: true, userId: true },
      where: { isDeleted: false },
    })) as BackfillBrand[];
    let brandsProcessed = 0;
    let brandFailures = 0;

    for (const brand of brands) {
      const userId = brand.userId ?? orgOwnerById.get(brand.organizationId);
      if (!userId) {
        continue;
      }
      brandsProcessed += 1;

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
          organizationId: brand.organizationId,
          origin: 'system',
          userId,
        });
      } catch (error: unknown) {
        brandFailures += 1;
        this.logger.error('Failed to backfill default recurring workflows', {
          brandId: brand.id,
          error: error instanceof Error ? error.message : String(error),
          organizationId: brand.organizationId,
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    }

    const { CronJobsService } = await import(
      '@api/collections/cron-jobs/services/cron-jobs.service'
    );
    const cronJobsService = this.moduleRef.get(CronJobsService, {
      strict: false,
    });
    const legacyCronReport = await cronJobsService.migrateLegacyJobsToWorkflows(
      { dryRun: false },
    );

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

    this.logger.log('Deployment workflow backfill completed', report);

    const hardFailures =
      report.orgFailures + report.brandFailures + report.legacyCronFailed;
    if (hardFailures > 0) {
      throw new Error(
        `Deployment workflow backfill failed: orgFailures=${report.orgFailures}, brandFailures=${report.brandFailures}, legacyCronFailed=${report.legacyCronFailed}`,
      );
    }

    return report;
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
  }
}
