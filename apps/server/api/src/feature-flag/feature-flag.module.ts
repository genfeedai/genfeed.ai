import { FeatureFlagGuard } from '@api/feature-flag/feature-flag.guard';
import { FeatureFlagService } from '@api/feature-flag/feature-flag.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [FeatureFlagService, FeatureFlagGuard],
  providers: [FeatureFlagService, FeatureFlagGuard],
})
export class FeatureFlagModule {}
