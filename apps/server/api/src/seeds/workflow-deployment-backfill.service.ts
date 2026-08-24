import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

type BackfillOrganization = {
  id: string;
  userId: string | null;
};

type WorkflowDeploymentBackfillReport = {
  brandFailures: number;
  brandsProcessed: number;
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

    const report: WorkflowDeploymentBackfillReport = {
      brandFailures: 0,
      brandsProcessed: 0,
      orgFailures,
      organizationsProcessed,
    };

    this.logProgress('Deployment workflow backfill completed', report);

    const hardFailures = report.orgFailures + report.brandFailures;
    if (hardFailures > 0) {
      throw new Error(
        `Deployment workflow backfill failed: orgFailures=${report.orgFailures}, brandFailures=${report.brandFailures}`,
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
    const { WorkflowTemplateSeederService } = await import(
      '@api/collections/workflows/services/workflow-template-seeder.service'
    );
    const workflowSeeder = this.moduleRef.get(WorkflowTemplateSeederService, {
      strict: false,
    });

    await workflowSeeder.ensureDailyTrendsDigestWorkflow(
      userId,
      organizationId,
    );
    await workflowSeeder.ensureAdAutomationWorkflows(userId, organizationId);
    await workflowSeeder.ensureCampaignOrchestrationWorkflows(
      userId,
      organizationId,
    );
    await workflowSeeder.ensureOutreachCampaignDispatchWorkflows(
      userId,
      organizationId,
    );
    await workflowSeeder.ensureAgentAutopilotWorkflows(userId, organizationId);
    await workflowSeeder.ensureAnalyticsSyncWorkflows(userId, organizationId);
    await workflowSeeder.ensureContentProductionWorkflows(
      userId,
      organizationId,
    );
    await workflowSeeder.ensureContentLoopAutopilotWorkflows(
      userId,
      organizationId,
    );
    await workflowSeeder.ensureReplyPollingWorkflows(userId, organizationId);
    await workflowSeeder.ensureTrendNotificationWorkflows(
      userId,
      organizationId,
    );
    await workflowSeeder.ensureLivestreamBotWorkflows(userId, organizationId);
    await workflowSeeder.ensureSystemActionWorkflows(userId, organizationId);

    // Seeded schedules fire via BullMQ job schedulers; register them now so
    // they don't wait for the next service restart.
    await workflowSeeder.syncOrganizationWorkflowSchedulers(organizationId);
  }
}
