'use client';

import { APP_ROUTES } from '@genfeedai/constants';
import { useFeatureFlagContext } from '@genfeedai/hooks/feature-flags/provider';
import { useFeatureFlag } from '@genfeedai/hooks/feature-flags/use-feature-flag';
import type { FeatureGateProps } from '@genfeedai/props/guards/feature-gate.props';
import Link from 'next/link';

export default function FeatureGate({ flagKey, children }: FeatureGateProps) {
  const { flags, isConfigured, isReady } = useFeatureFlagContext();
  const isEnabled = useFeatureFlag(flagKey);
  const hasResolvedValue = Object.hasOwn(flags, flagKey);

  if (!isConfigured && !hasResolvedValue) {
    return <>{children}</>;
  }

  if (isConfigured && !isReady) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <h2 className="text-lg font-semibold text-foreground">
          Loading Feature
        </h2>
        <p className="text-sm text-muted-foreground">
          Checking feature availability.
        </p>
      </div>
    );
  }

  if (!isEnabled) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <h2 className="text-lg font-semibold text-foreground">
          Feature Unavailable
        </h2>
        <p className="text-sm text-muted-foreground">
          This feature is currently unavailable.
        </p>
        <Link
          href={APP_ROUTES.WORKSPACE.ROOT}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Back to Workspace
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
