'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import WorkspaceContentSkeleton from '@/components/shell/workspace-frame-skeleton/WorkspaceContentSkeleton';
import { useOnboardingRouteAccess } from '@/hooks/navigation/use-onboarding-route-access/use-onboarding-route-access';
import { useIsDesktopClient } from '@/hooks/ui/use-is-desktop-client/use-is-desktop-client';
import type { OnboardingGuardProps } from '@/props/guards/onboarding-guard.props';

function OnboardingGuardInner({ children }: OnboardingGuardProps) {
  const pathname = usePathname();
  const { replace } = useRouter();
  const { canRender, redirectTarget } = useOnboardingRouteAccess(pathname);
  const translatePending = useTranslations('pages.organizationRouting.pending');

  useEffect(() => {
    if (redirectTarget) {
      replace(redirectTarget);
    }
  }, [redirectTarget, replace]);

  // The shell is already on screen; hold the page body as a placeholder
  // rather than a centered spinner while access state loads.
  if (!canRender) {
    return <WorkspaceContentSkeleton label={translatePending('loading')} />;
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
