/**
 * Platform Settings Module
 * Platform-wide operator settings (singleton): cross-client business/infra
 * knobs such as the model-cost margin multiplier. Configured from the
 * top-level /admin operator area, gated to platform superadmins.
 */

import { PlatformSettingsService } from '@api/collections/platform-settings/services/platform-settings.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [],
  exports: [PlatformSettingsService],
  imports: [],
  providers: [PlatformSettingsService],
})
export class PlatformSettingsModule {}
