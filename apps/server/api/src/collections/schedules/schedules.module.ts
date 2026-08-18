/**
 * Schedules Module
 * AI-powered scheduling: optimal posting time calculation, bulk content scheduling,
 * and performance tracking.
 */

import { CreditsModule } from '@api/collections/credits/credits.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { SchedulesController } from '@api/collections/schedules/controllers/schedules.controller';
import { SchedulesService } from '@api/collections/schedules/services/schedules.service';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ByokModule } from '@api/services/byok/byok.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { ConfigModule } from '@libs/config/config.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [SchedulesController],
  exports: [SchedulesService],
  imports: [
    ByokModule,
    ConfigModule,
    CreditsModule,
    ModelsModule,
    ReplicateModule,
  ],
  providers: [SchedulesService, CreditsGuard, CreditsInterceptor],
})
export class SchedulesModule {}
