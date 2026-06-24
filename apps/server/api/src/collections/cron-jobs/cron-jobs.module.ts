import { AgentRunsModule } from '@api/collections/agent-runs/agent-runs.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { CronJobsController } from '@api/collections/cron-jobs/controllers/cron-jobs.controller';
import { LEGACY_CRON_JOB_EXECUTOR } from '@api/collections/cron-jobs/legacy-cron-job-executor.token';
import { CronJobsService } from '@api/collections/cron-jobs/services/cron-jobs.service';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { QueuesModule } from '@api/queues/core/queues.module';
import { CacheModule } from '@api/services/cache/cache.module';
import { OpenRouterModule } from '@api/services/integrations/openrouter/openrouter.module';
import { SubstackModule } from '@api/services/integrations/substack/substack.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [CronJobsController],
  exports: [CronJobsService, LEGACY_CRON_JOB_EXECUTOR],
  imports: [
    forwardRef(() => CreditsModule),
    forwardRef(() => WorkflowsModule),
    forwardRef(() => AgentRunsModule),
    forwardRef(() => QueuesModule),
    forwardRef(() => CreditsModule),
    forwardRef(() => CacheModule),
    forwardRef(() => OpenRouterModule),
    forwardRef(() => SubstackModule),
  ],
  providers: [
    CronJobsService,
    {
      provide: LEGACY_CRON_JOB_EXECUTOR,
      useExisting: CronJobsService,
    },
  ],
})
export class CronJobsModule {}
