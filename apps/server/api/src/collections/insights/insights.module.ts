/**
 * Insights Module
 * Predictive analytics: trend forecasting, viral potential prediction, content gap analysis,
 * optimal posting times, audience growth predictions, and AI-generated actionable insights.
 */

import { CreditsModule } from '@api/collections/credits/credits.module';
import { InsightsController } from '@api/collections/insights/controllers/insights.controller';
import { InsightsService } from '@api/collections/insights/services/insights.service';
import { ModelsModule } from '@api/collections/models/models.module';
import { ConfigModule } from '@api/config/config.module';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ByokModule } from '@api/services/byok/byok.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [InsightsController],
  exports: [InsightsService],
  imports: [
    ByokModule,
    ConfigModule,
    forwardRef(() => CreditsModule),
    forwardRef(() => ModelsModule),
    ReplicateModule,
  ],
  providers: [InsightsService, CreditsGuard, CreditsInterceptor],
})
export class InsightsModule {}
