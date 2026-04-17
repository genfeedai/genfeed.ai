/**
 * Schedules Module
 * AI-powered scheduling: optimal posting time calculation, bulk content scheduling,
 * content repurposing (video → shorts, stories, GIFs), and performance tracking.
 */

import { CreditsModule } from '@api/collections/credits/credits.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { SchedulesController } from '@api/collections/schedules/controllers/schedules.controller';
import { SchedulesService } from '@api/collections/schedules/services/schedules.service';
import { ConfigModule } from '@api/config/config.module';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ByokModule } from '@api/services/byok/byok.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [SchedulesController],
  exports: [SchedulesService],
  imports: [
    ByokModule,
    ConfigModule,
    forwardRef(() => CreditsModule),
    forwardRef(() => ModelsModule),
    ReplicateModule,
  ],
  providers: [SchedulesService, CreditsGuard, CreditsInterceptor],
})
export class SchedulesModule {}
