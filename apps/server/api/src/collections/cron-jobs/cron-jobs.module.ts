import { AgentRunsModule } from '@api/collections/agent-runs/agent-runs.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { CronJobsController } from '@api/collections/cron-jobs/controllers/cron-jobs.controller';
import { CronJobsService } from '@api/collections/cron-jobs/services/cron-jobs.service';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { QueuesModule } from '@api/queues/core/queues.module';
import { CacheModule } from '@api/services/cache/cache.module';
import { OpenRouterModule } from '@api/services/integrations/openrouter/openrouter.module';
import { SubstackModule } from '@api/services/integrations/substack/substack.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [CronJobsController],
  exports: [CronJobsService],
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
  providers: [CronJobsService],
})
export class CronJobsModule {}
