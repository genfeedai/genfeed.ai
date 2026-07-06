import type { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import { DefaultRecurringContentService } from '@api/collections/brands/services/default-recurring-content.service';
import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { CronJobsService } from '@api/collections/cron-jobs/services/cron-jobs.service';
import type { LegacyWorkflowStepRunner } from '@api/collections/workflows/services/legacy-workflow-step-runner.service';
import { WorkflowTemplateSeederService } from '@api/collections/workflows/services/workflow-template-seeder.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import type { AgentRunQueueService } from '@api/queues/agent-run/agent-run-queue.service';
import { WorkflowDeploymentBackfillService } from '@api/seeds/workflow-deployment-backfill.service';
import type { CacheService } from '@api/services/cache/services/cache.service';
import type { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import type { SubstackService } from '@api/services/integrations/substack/services/substack.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { LoggerService } from '@libs/logger/logger.service';
import { Module } from '@nestjs/common';

@Module({
  imports: [ConfigModule, LoggerModule, PrismaModule],
  providers: [
    WorkflowsService,
    DefaultRecurringContentService,
    WorkflowDeploymentBackfillService,
    // Seeding moved out of WorkflowsService in #754; the backfill service
    // resolves this via ModuleRef per-org. Its only required deps (Prisma,
    // Logger) come from the imported modules; WorkflowExecutionQueueService is
    // @Optional and guarded in the seeder, so it's safe to omit here.
    WorkflowTemplateSeederService,
    {
      inject: [PrismaService, WorkflowsService, LoggerService],
      provide: CronJobsService,
      useFactory: (
        prisma: PrismaService,
        workflowsService: WorkflowsService,
        logger: LoggerService,
      ) =>
        new CronJobsService(
          prisma,
          workflowsService,
          {} as LegacyWorkflowStepRunner,
          {} as AgentRunsService,
          {} as AgentRunQueueService,
          {} as OpenRouterService,
          {} as SubstackService,
          {} as CacheService,
          {} as CreditsUtilsService,
          logger,
        ),
    },
  ],
})
export class WorkflowBackfillModule {}
