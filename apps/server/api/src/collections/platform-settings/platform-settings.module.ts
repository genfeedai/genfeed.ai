/**
 * Platform Settings Module
 * Platform-wide operator settings (singleton): cross-client business/infra
 * knobs such as the model-cost margin multiplier and the typed-decision
 * provider. Configured from the top-level /admin operator area, gated to
 * platform superadmins.
 */

import { PlatformSettingsService } from '@api/collections/platform-settings/services/platform-settings.service';
import { ConfigModule } from '@libs/config/config.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [],
  exports: [PlatformSettingsService],
  imports: [ConfigModule],
  providers: [PlatformSettingsService],
})
export class PlatformSettingsModule {}
