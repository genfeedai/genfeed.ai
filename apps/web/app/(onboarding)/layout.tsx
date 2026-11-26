import AppPageIntlProvider from '@app-i18n/AppPageIntlProvider';
import messages from '@app-i18n/page-scopes/onboarding';
import type { LayoutProps } from '@props/layout/layout.props';
import { Suspense } from 'react';
import LayoutContent from './layout-client';
import OnboardingShellFallback from './onboarding/components/onboarding-shell-fallback';

export default function PageIntlLayout({ children }: LayoutProps) {
  return (
    <AppPageIntlProvider pages={messages}>
      <Suspense fallback={<OnboardingShellFallback />}>
        <LayoutContent>{children}</LayoutContent>
      </Suspense>
    </AppPageIntlProvider>
  );
}
