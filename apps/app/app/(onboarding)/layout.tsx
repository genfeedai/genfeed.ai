'use client';

import { BrandProvider } from '@contexts/user/brand-context/brand-context';
import { UserProvider } from '@contexts/user/user-context/user-context';
import type { LayoutProps } from '@props/layout/layout.props';
import ApiStatusProvider from '@providers/api-status/api-status.provider';
import { ProtectedAuthGate } from '@providers/protected-providers/protected-providers';
import ThemePreferenceSync from '@providers/theme-sync/theme-preference-sync';
import { ErrorBoundary } from '@ui/error';
import { Suspense } from 'react';
import AnalyticsOrganizationSync from '@/components/analytics/AnalyticsOrganizationSync';
import OnboardingFunnelAnalytics from './onboarding-funnel-analytics';

export default function OnboardingSetupLayout({ children }: LayoutProps) {
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

  return <ProtectedAuthGate>{content}</ProtectedAuthGate>;
}
