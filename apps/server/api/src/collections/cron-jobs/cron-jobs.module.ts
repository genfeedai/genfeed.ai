import { AgentRunsModule } from '@api/collections/agent-runs/agent-runs.module';
import {
  AgentStrategy,
  AgentStrategySchema,
} from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import { CronJobsController } from '@api/collections/cron-jobs/controllers/cron-jobs.controller';
import {
  CronJob,
  CronJobSchema,
} from '@api/collections/cron-jobs/schemas/cron-job.schema';
import {
  CronRun,
  CronRunSchema,
} from '@api/collections/cron-jobs/schemas/cron-run.schema';
import { CronJobsService } from '@api/collections/cron-jobs/services/cron-jobs.service';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { QueuesModule } from '@api/queues/core/queues.module';
import { CacheModule } from '@api/services/cache/cache.module';
import { OpenRouterModule } from '@api/services/integrations/openrouter/openrouter.module';
import { SubstackModule } from '@api/services/integrations/substack/substack.module';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [CronJobsController],
  exports: [CronJobsService],
  imports: [
    forwardRef(() => WorkflowsModule),
    forwardRef(() => AgentRunsModule),
    forwardRef(() => QueuesModule),
    CacheModule,
    OpenRouterModule,
    SubstackModule,
    MongooseModule.forFeature(
      [{ name: AgentStrategy.name, schema: AgentStrategySchema }],
      DB_CONNECTIONS.AGENT,
    ),
    MongooseModule.forFeatureAsync(
      [
        {
          name: CronJob.name,
          useFactory: () => {
            const schema = CronJobSchema;
            schema.plugin(mongooseAggregatePaginateV2);
            schema.index(
              { enabled: 1, nextRunAt: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );
            schema.index(
              { createdAt: -1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );
            return schema;
          },
        },
        {
          name: CronRun.name,
          useFactory: () => {
            const schema = CronRunSchema;
            schema.plugin(mongooseAggregatePaginateV2);
            schema.index(
              { createdAt: -1, cronJob: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );
            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [CronJobsService],
})
export class CronJobsModule {}
