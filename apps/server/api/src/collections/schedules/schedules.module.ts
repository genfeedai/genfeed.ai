/**
 * Schedules Module
 * AI-powered scheduling: optimal posting time calculation, bulk content scheduling,
 * content repurposing (video → shorts, stories, GIFs), and performance tracking.
 */

import { CreditsModule } from '@api/collections/credits/credits.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { SchedulesController } from '@api/collections/schedules/controllers/schedules.controller';
import {
  RepurposingJob,
  RepurposingJobSchema,
} from '@api/collections/schedules/schemas/repurposing-job.schema';
import {
  Schedule,
  ScheduleSchema,
} from '@api/collections/schedules/schemas/schedule.schema';
import { SchedulesService } from '@api/collections/schedules/services/schedules.service';
import { ConfigModule } from '@api/config/config.module';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ByokModule } from '@api/services/byok/byok.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  controllers: [SchedulesController],
  exports: [SchedulesService],
  imports: [
    ByokModule,
    ConfigModule,
    forwardRef(() => CreditsModule),
    forwardRef(() => ModelsModule),
    ReplicateModule,
    MongooseModule.forFeatureAsync(
      [
        {
          name: Schedule.name,
          useFactory: () => {
            const schema = ScheduleSchema;

            // Primary query with soft delete
            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Scheduled time lookups
            schema.index({ organization: 1, scheduledAt: 1 });

            // Status-based scheduling queries
            schema.index({ scheduledAt: 1, status: 1 });

            // User schedules
            schema.index({ createdAt: -1, user: 1 });

            // Platform + Brand queries
            schema.index({ brand: 1, platform: 1 });

            return schema;
          },
        },
        {
          name: RepurposingJob.name,
          useFactory: () => {
            const schema = RepurposingJobSchema;

            // Primary query with soft delete
            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Status-based job processing
            schema.index({ createdAt: -1, organization: 1, status: 1 });

            // User jobs
            schema.index({ createdAt: -1, user: 1 });

            // Source content lookup
            schema.index({ sourceContent: 1 });

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [SchedulesService, CreditsGuard, CreditsInterceptor],
})
export class SchedulesModule {}
