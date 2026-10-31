'use client';

import Spinner from '@ui/primitives/spinner';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useOnboardingRouteAccess } from '@/hooks/navigation/use-onboarding-route-access/use-onboarding-route-access';
import { useIsDesktopClient } from '@/hooks/ui/use-is-desktop-client/use-is-desktop-client';
import type { OnboardingGuardProps } from '@/props/guards/onboarding-guard.props';

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
        <Spinner className="size-6 text-foreground" />
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
