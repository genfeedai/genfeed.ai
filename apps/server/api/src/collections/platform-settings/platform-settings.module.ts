/**
 * Platform Settings Module
 * Platform-wide operator settings (singleton): cross-client business/infra
 * knobs such as the model-cost margin multiplier and the typed-decision
 * provider. Configured from the top-level /admin operator area, gated to
 * platform superadmins.
 */

import { BrandVisionModelCatalogService } from '@api/collections/platform-settings/services/brand-vision-model-catalog.service';
import { PlatformSettingsService } from '@api/collections/platform-settings/services/platform-settings.service';
import { ConfigModule } from '@libs/config/config.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [],
  exports: [BrandVisionModelCatalogService, PlatformSettingsService],
  imports: [ConfigModule],
  providers: [BrandVisionModelCatalogService, PlatformSettingsService],
})
export class PlatformSettingsModule {}
