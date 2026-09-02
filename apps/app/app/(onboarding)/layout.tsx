'use client';

import { BrandProvider } from '@contexts/user/brand-context/brand-context';
import { UserProvider } from '@contexts/user/user-context/user-context';
import { isDesktopClient } from '@genfeedai/config/deployment';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { LayoutProps } from '@props/layout/layout.props';
import ApiStatusProvider from '@providers/api-status/api-status.provider';
import { ProtectedAuthGate } from '@providers/protected-providers/protected-providers';
import ThemePreferenceSync from '@providers/theme-sync/theme-preference-sync';
import { ErrorBoundary } from '@ui/error';
import { usePathname } from 'next/navigation';
import { Suspense } from 'react';
import AnalyticsOrganizationSync from '@/components/analytics/AnalyticsOrganizationSync';
import OnboardingFunnelAnalytics from './onboarding-funnel-analytics';

export default function OnboardingSetupLayout({ children }: LayoutProps) {
  const pathname = usePathname();
  const isDesktopLocalOnboarding =
    isDesktopClient() &&
    (pathname === APP_ROUTES.ONBOARDING.BRAND ||
      pathname.startsWith(`${APP_ROUTES.ONBOARDING.BRAND}/`) ||
      pathname === APP_ROUTES.ONBOARDING.PROVIDERS ||
      pathname.startsWith(`${APP_ROUTES.ONBOARDING.PROVIDERS}/`));

  const content = (
    <ApiStatusProvider>
      <UserProvider>
        <BrandProvider>
          <ThemePreferenceSync />
          <ErrorBoundary
            title="Onboarding Error"
            description="Something went wrong during setup. Please try again."
          >
            <Suspense fallback={null}>
              <AnalyticsOrganizationSync />
              <OnboardingFunnelAnalytics />
            </Suspense>
            {children}
          </ErrorBoundary>
        </BrandProvider>
      </UserProvider>
    </ApiStatusProvider>
  );

  if (isDesktopLocalOnboarding) {
    return content;
  }

  return <ProtectedAuthGate>{content}</ProtectedAuthGate>;
}
