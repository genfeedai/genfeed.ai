import type { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import { DefaultRecurringContentService } from '@api/collections/brands/services/default-recurring-content.service';
import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { CronJobsService } from '@api/collections/cron-jobs/services/cron-jobs.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { ConfigModule } from '@api/config/config.module';
import type { AgentRunQueueService } from '@api/queues/agent-run/agent-run-queue.service';
import { WorkflowDeploymentBackfillService } from '@api/seeds/workflow-deployment-backfill.service';
import type { CacheService } from '@api/services/cache/services/cache.service';
import type { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import type { SubstackService } from '@api/services/integrations/substack/services/substack.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { LoggerService } from '@libs/logger/logger.service';
import { Module } from '@nestjs/common';

@Module({
  imports: [ConfigModule, LoggerModule, PrismaModule],
  providers: [
    WorkflowsService,
    DefaultRecurringContentService,
    WorkflowDeploymentBackfillService,
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
