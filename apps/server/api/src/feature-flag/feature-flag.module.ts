import { PlatformSettingsModule } from '@api/collections/platform-settings/platform-settings.module';
import { FeatureFlagGuard } from '@api/feature-flag/feature-flag.guard';
import { Module } from '@nestjs/common';

@Module({
  exports: [FeatureFlagGuard],
  imports: [PlatformSettingsModule],
  providers: [FeatureFlagGuard],
})
export class FeatureFlagModule {}
