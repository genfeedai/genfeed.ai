'use client';

import { useGrowthBookClientStatus } from '@hooks/feature-flags/provider';
import { useFeatureFlag } from '@hooks/feature-flags/use-feature-flag';
import type { FeatureGateProps } from '@props/guards/feature-gate.props';
import Link from 'next/link';

export default function FeatureGate({ flagKey, children }: FeatureGateProps) {
  const { isConfigured, isReady } = useGrowthBookClientStatus();
  const isEnabled = useFeatureFlag(flagKey);

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
          href="/workspace"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Back to Workspace
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
