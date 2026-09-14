'use client';

import { useOnboardingRouteAccess } from '@genfeedai/hooks/navigation/use-onboarding-route-access/use-onboarding-route-access';
import { useIsDesktopClient } from '@genfeedai/hooks/ui/use-is-desktop-client/use-is-desktop-client';
import type { OnboardingGuardProps } from '@genfeedai/props/guards/onboarding-guard.props';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

function OnboardingGuardInner({ children }: OnboardingGuardProps) {
  const pathname = usePathname();
  const { replace } = useRouter();
  const { canRender, redirectTarget } = useOnboardingRouteAccess(pathname);

  useEffect(() => {
    if (redirectTarget) {
      replace(redirectTarget);
    }
  }, [redirectTarget, replace]);

  if (!canRender) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
        <div className="size-6 border-2 border-border border-t-foreground rounded-full animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}

/**
 * OnboardingGuard
 *
 * Desktop offline mode bypasses the cloud onboarding gate; web routes use the
 * DB-backed access state loaded by protected providers.
 */
export default function OnboardingGuard({ children }: OnboardingGuardProps) {
  const isDesktop = useIsDesktopClient();

  // Desktop shell without a cloud session → offline mode, skip onboarding gate.
  if (isDesktop) {
    return <>{children}</>;
  }

  return <OnboardingGuardInner>{children}</OnboardingGuardInner>;
}
