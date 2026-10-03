import { CreditsModule } from '@api/collections/credits/credits.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { PlatformSettingsModule } from '@api/collections/platform-settings/platform-settings.module';
import { VideosModule } from '@api/collections/videos/videos.module';
import { AnalyticsModule } from '@api/endpoints/analytics/analytics.module';
import { MCPController } from '@api/endpoints/mcp/mcp.controller';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { ModelsGuard } from '@api/helpers/guards/models/models.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ByokModule } from '@api/services/byok/byok.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [MCPController],
  imports: [
    PlatformSettingsModule,
    AnalyticsModule,
    ByokModule,
    CreditsModule,
    ModelsModule,
    VideosModule,
  ],
  providers: [CreditsGuard, ModelsGuard, CreditsInterceptor],
})
export class MCPModule {}
