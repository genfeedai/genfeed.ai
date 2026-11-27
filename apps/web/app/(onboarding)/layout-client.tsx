'use client';

import { BrandProvider } from '@contexts/user/brand-context/brand-context';
import { UserProvider } from '@contexts/user/user-context/user-context';
import type { LayoutProps } from '@props/layout/layout.props';
import ApiStatusProvider from '@providers/api-status/api-status.provider';
import ThemePreferenceSync from '@providers/theme-sync/theme-preference-sync';
import { ErrorBoundary } from '@ui/display/error-boundary/ErrorBoundary';
import { ErrorFallback } from '@ui/error/ErrorFallback';
import { useTranslations } from 'next-intl';
import { Suspense } from 'react';
import AnalyticsOrganizationSync from '@/components/analytics/AnalyticsOrganizationSync';
import { FeatureFlagProvider } from '@/hooks/feature-flags/provider';
import { notifyPlatformFlagsChanged } from '@/lib/platform-flags/platform-flags-sync';
import { usePlatformFlags } from '@/lib/platform-flags/use-platform-flags';
import { ProtectedAuthGate } from '@/providers/protected-providers/protected-providers';
import OnboardingShellFallback from './onboarding/components/onboarding-shell-fallback';
import OnboardingFunnelAnalytics from './onboarding-funnel-analytics';

export default function OnboardingSetupLayout({ children }: LayoutProps) {
  const translate = useTranslations('common.onboarding.error');
  const translateUnavailable = useTranslations(
    'pages.platformFlags.unavailable',
  );
  // Admin flags (#5468): onboarding routes by the `agent` module flag, so it
  // waits for the first read rather than routing on the all-on default.
  const {
    flags: platformFlags,
    isReady: isPlatformFlagsReady,
    isUnavailable: isPlatformFlagsUnavailable,
  } = usePlatformFlags();

  const content = !isPlatformFlagsReady ? (
    isPlatformFlagsUnavailable ? (
      <main className="flex min-h-dvh w-full items-center justify-center bg-background px-4 py-10 sm:px-6">
        <ErrorFallback
          title={translateUnavailable('title')}
          description={translateUnavailable('description')}
          resetErrorBoundary={notifyPlatformFlagsChanged}
          data-testid="platform-flags-unavailable"
        />
      </main>
    ) : (
      <OnboardingShellFallback />
    )
  ) : (
    <FeatureFlagProvider defaults={platformFlags}>
      <ApiStatusProvider>
        <UserProvider>
          <BrandProvider>
            <ThemePreferenceSync />
            <ErrorBoundary
              presentation="inline"
              title={translate('title')}
              description={translate('description')}
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
    </FeatureFlagProvider>
  );

  return (
    <ProtectedAuthGate fallback={<OnboardingShellFallback />}>
      {content}
    </ProtectedAuthGate>
  );
}
