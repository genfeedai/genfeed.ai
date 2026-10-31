'use client';

import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import Link from 'next/link';
import { useFeatureFlagContext } from '@/hooks/feature-flags/provider';
import { useFeatureFlag } from '@/hooks/feature-flags/use-feature-flag';
import type { FeatureGateProps } from '@/props/guards/feature-gate.props';

export default function FeatureGate({ flagKey, children }: FeatureGateProps) {
  const { href } = useOrgUrl();
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
          href={href(APP_ROUTES.WORKSPACE.ROOT)}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Back to Workspace
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
