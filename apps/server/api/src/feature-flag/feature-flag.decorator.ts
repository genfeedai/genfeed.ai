import { FeatureFlagGuard } from '@api/feature-flag/feature-flag.guard';
import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';

export const FEATURE_FLAG_KEY = 'featureFlag';

export function FeatureFlag(flagKey: string) {
  return applyDecorators(
    SetMetadata(FEATURE_FLAG_KEY, flagKey),
    UseGuards(FeatureFlagGuard),
  );
}
