import { FeatureFlagController } from '@api/feature-flag/feature-flag.controller';
import { FeatureFlagGuard } from '@api/feature-flag/feature-flag.guard';
import { FeatureFlagService } from '@api/feature-flag/feature-flag.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [FeatureFlagController],
  exports: [FeatureFlagService, FeatureFlagGuard],
  providers: [FeatureFlagService, FeatureFlagGuard],
})
export class FeatureFlagModule {}
