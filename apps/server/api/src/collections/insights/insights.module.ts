/**
 * Insights Module
 * Predictive analytics: trend forecasting, viral potential prediction, content gap analysis,
 * optimal posting times, audience growth predictions, and AI-generated actionable insights.
 */

import { CreditsModule } from '@api/collections/credits/credits.module';
import { InsightsController } from '@api/collections/insights/controllers/insights.controller';
import { InsightsService } from '@server/collections/insights/services/insights.service';
import { ModelsModule } from '@api/collections/models/models.module';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { InsightGenerationQueueModule } from '@api/queues/insight-generation/insight-generation-queue.module';
import { ByokModule } from '@api/services/byok/byok.module';
import { LlmDispatcherModule } from '@api/services/integrations/llm/llm-dispatcher.module';
import { ConfigModule } from '@libs/config/config.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [InsightsController],
  exports: [InsightsService],
  imports: [
    ByokModule,
    ConfigModule,
    CreditsModule,
    InsightGenerationQueueModule,
    LlmDispatcherModule,
    ModelsModule,
  ],
  providers: [InsightsService, CreditsGuard, CreditsInterceptor],
})
export class InsightsModule {}
