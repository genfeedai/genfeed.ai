import { CreditsModule } from '@api/collections/credits/credits.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { VideosModule } from '@api/collections/videos/videos.module';
import { AnalyticsModule } from '@api/endpoints/analytics/analytics.module';
import { MCPController } from '@api/endpoints/mcp/mcp.controller';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { ModelsGuard } from '@api/helpers/guards/models/models.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ByokModule } from '@api/services/byok/byok.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [MCPController],
  imports: [
    forwardRef(() => AnalyticsModule),
    ByokModule,
    forwardRef(() => CreditsModule),
    forwardRef(() => ModelsModule),
    forwardRef(() => VideosModule),
  ],
  providers: [CreditsGuard, ModelsGuard, CreditsInterceptor],
})
export class MCPModule {}
