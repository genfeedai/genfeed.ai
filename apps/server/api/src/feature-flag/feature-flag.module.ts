import { FeatureFlagGuard } from '@api/feature-flag/feature-flag.guard';
import { FeatureFlagService } from '@api/feature-flag/feature-flag.service';
import { PlatformFeatureSettingsService } from '@api/feature-flag/platform-feature-settings.service';
import { PostHogFeatureFlagEvaluator } from '@api/feature-flag/posthog-feature-flag.evaluator';
import { ConfigModule } from '@libs/config/config.module';
import { Module } from '@nestjs/common';

/**
 * PostHog feature flags: per-user product flags (`FeatureFlagService`) and the
 * platform-wide product switches (`PlatformFeatureSettingsService`, #5468).
 * Imported by the api and by the workers runtime.
 */
@Module({
  exports: [
    FeatureFlagService,
    FeatureFlagGuard,
    PlatformFeatureSettingsService,
  ],
  imports: [ConfigModule],
  providers: [
    FeatureFlagService,
    FeatureFlagGuard,
    PlatformFeatureSettingsService,
    PostHogFeatureFlagEvaluator,
  ],
})
export class FeatureFlagModule {}
