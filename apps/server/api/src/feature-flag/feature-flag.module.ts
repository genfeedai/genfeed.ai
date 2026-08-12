import { FeatureFlagGuard } from '@api/feature-flag/feature-flag.guard';
import { FeatureFlagService } from '@api/feature-flag/feature-flag.service';
import { PostHogFeatureFlagEvaluator } from '@api/feature-flag/posthog-feature-flag.evaluator';
import { Module } from '@nestjs/common';

@Module({
  exports: [FeatureFlagService, FeatureFlagGuard],
  providers: [
    FeatureFlagService,
    FeatureFlagGuard,
    PostHogFeatureFlagEvaluator,
  ],
})
export class FeatureFlagModule {}
